/// A file URL that no longer leads to a file (its original was deleted) is
/// counted, so the paste can report it as failed.
#[derive(Debug, Default, PartialEq, serde::Serialize)]
pub struct ClipboardFiles {
    pub paths: Vec<String>,
    pub unresolved: usize,
}

/// Only file URLs are read, never text or images, and only on an explicit paste.
#[tauri::command]
pub async fn fs_clipboard_paths() -> Result<ClipboardFiles, String> {
    #[cfg(target_os = "macos")]
    {
        // NSPasteboard may be read off the main thread, so a slow (lazy)
        // provider blocks only this worker, never the window.
        let read = tauri::async_runtime::spawn_blocking(|| {
            objc2::rc::autoreleasepool(|_| {
                read_files(&objc2_app_kit::NSPasteboard::generalPasteboard())
            })
        });
        receive_read(read, READ_BUDGET).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("clipboard file paste is only supported on macOS".into())
    }
}

/// Stages a clipboard image as a local PNG named `name`, so a terminal upload
/// takes the same `fs_copy` path as a dropped file. `None`: no image.
#[tauri::command]
pub async fn fs_clipboard_image(name: String) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        check_image_name(&name)?;
        let read = tauri::async_runtime::spawn_blocking(move || {
            sweep_staged_images(
                &std::env::temp_dir(),
                std::time::SystemTime::now(),
                STAGED_IMAGE_MAX_AGE,
            );
            let png = objc2::rc::autoreleasepool(|_| {
                read_png(&objc2_app_kit::NSPasteboard::generalPasteboard())
            });
            png.map(|bytes| stage_clipboard_image(&bytes, &name)).transpose()
        });
        receive_read(read, READ_BUDGET).await?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = name;
        Err("clipboard image paste is only supported on macOS".into())
    }
}

#[cfg(target_os = "macos")]
const READ_BUDGET: std::time::Duration = std::time::Duration::from_secs(5);

#[cfg(target_os = "macos")]
async fn receive_read<T, E>(
    read: impl std::future::Future<Output = Result<T, E>>,
    budget: std::time::Duration,
) -> Result<T, String> {
    match tokio::time::timeout(budget, read).await {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(_)) => Err("clipboard read failed".to_string()),
        Err(_) => Err("clipboard read timed out or was cancelled".to_string()),
    }
}

#[derive(Debug, PartialEq)]
enum ImageFlavor {
    Png,
    Tiff,
}

/// Screenshots carry PNG; apps that only offer TIFF are converted. A Finder
/// file copy also carries the file icon as an image, so file URLs mean no image.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn image_flavor(holds_file_urls: bool, has_png: bool, has_tiff: bool) -> Option<ImageFlavor> {
    if holds_file_urls {
        None
    } else if has_png {
        Some(ImageFlavor::Png)
    } else if has_tiff {
        Some(ImageFlavor::Tiff)
    } else {
        None
    }
}

#[cfg(target_os = "macos")]
fn read_png(pasteboard: &objc2_app_kit::NSPasteboard) -> Option<Vec<u8>> {
    use objc2_app_kit::{
        NSBitmapImageFileType, NSBitmapImageRep, NSPasteboardTypePNG, NSPasteboardTypeTIFF,
    };
    let holds_files = holds_file_urls(pasteboard);
    let png = if holds_files {
        None
    } else {
        pasteboard.dataForType(unsafe { NSPasteboardTypePNG })
    };
    let tiff = if holds_files || png.is_some() {
        None
    } else {
        pasteboard.dataForType(unsafe { NSPasteboardTypeTIFF })
    };
    match image_flavor(holds_files, png.is_some(), tiff.is_some())? {
        ImageFlavor::Png => png.map(|png| png.to_vec()),
        ImageFlavor::Tiff => {
            let tiff = tiff?;
            let image = NSBitmapImageRep::imageRepWithData(&tiff)?;
            let properties = objc2_foundation::NSDictionary::<
                objc2_foundation::NSString,
                objc2::runtime::AnyObject,
            >::new();
            let png = unsafe {
                image.representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)
            }?;
            Some(png.to_vec())
        }
    }
}

#[cfg(target_os = "macos")]
fn holds_file_urls(pasteboard: &objc2_app_kit::NSPasteboard) -> bool {
    let file_type = unsafe { objc2_app_kit::NSPasteboardTypeFileURL };
    pasteboard
        .pasteboardItems()
        .is_some_and(|items| items.iter().any(|item| item.stringForType(file_type).is_some()))
}

const MAX_IMAGE_NAME_BYTES: usize = 255;

/// The name comes over IPC and becomes a file name, so it may not leave its folder.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn check_image_name(name: &str) -> Result<(), String> {
    let plain = !name.is_empty()
        && name.len() <= MAX_IMAGE_NAME_BYTES
        && !name.starts_with('.')
        && name.ends_with(".png")
        && !name.contains(['/', '\\', '\0']);
    if plain {
        Ok(())
    } else {
        Err(format!("invalid clipboard image name: {name:?}"))
    }
}

/// A fresh owner-only folder per image, so a paste never meets an earlier file.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn stage_clipboard_image(png: &[u8], name: &str) -> Result<String, String> {
    use std::io::Write;
    check_image_name(name)?;
    let failed = |e: std::io::Error| format!("could not stage the clipboard image: {e}");
    let mut builder = tempfile::Builder::new();
    builder.prefix(STAGED_IMAGE_PREFIX);
    // tempfile creates folders 0777 & !umask unless told otherwise.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        builder.permissions(std::fs::Permissions::from_mode(0o700));
    }
    let dir = builder.tempdir().map_err(failed)?;
    // Canonical, so the copy guard sees no link on the way (macOS /var).
    let path = std::fs::canonicalize(dir.path()).map_err(failed)?.join(name);
    let mut file = std::fs::File::create_new(&path).map_err(failed)?;
    file.write_all(png).map_err(failed)?;
    file.sync_all().map_err(failed)?;
    drop(file);
    // Kept only once the file is whole; the copy reads it after this returns.
    let _ = dir.keep();
    Ok(super::to_canon(path))
}

const STAGED_IMAGE_PREFIX: &str = "terax-clipboard-";

#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const STAGED_IMAGE_MAX_AGE: std::time::Duration = std::time::Duration::from_secs(24 * 60 * 60);

/// Staged copies are only read by the upload right after staging, so a day
/// old one is left over. Only real folders of ours directly in `temp`.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn sweep_staged_images(
    temp: &std::path::Path,
    now: std::time::SystemTime,
    max_age: std::time::Duration,
) {
    let Ok(entries) = std::fs::read_dir(temp) else {
        return;
    };
    for entry in entries.flatten() {
        let ours = entry
            .file_name()
            .to_str()
            .is_some_and(|name| name.starts_with(STAGED_IMAGE_PREFIX));
        if !ours {
            continue;
        }
        let path = entry.path();
        let Ok(meta) = std::fs::symlink_metadata(&path) else {
            continue;
        };
        let stale = meta.is_dir()
            && meta
                .modified()
                .ok()
                .and_then(|modified| now.duration_since(modified).ok())
                .is_some_and(|age| age > max_age);
        if stale {
            let _ = std::fs::remove_dir_all(&path);
        }
    }
}

/// Finder writes file-reference URLs (`file:///.file/id=…`).
#[cfg(target_os = "macos")]
fn read_files(pasteboard: &objc2_app_kit::NSPasteboard) -> ClipboardFiles {
    use objc2_app_kit::NSPasteboardTypeFileURL;

    let mut files = ClipboardFiles::default();
    let Some(items) = pasteboard.pasteboardItems() else {
        return files;
    };
    let file_type = unsafe { NSPasteboardTypeFileURL };
    for item in items.iter() {
        let Some(raw) = item.stringForType(file_type) else {
            continue;
        };
        match local_file(&raw) {
            LocalFile::Path(path) => files.paths.push(super::to_canon(path)),
            LocalFile::Unresolved => files.unresolved += 1,
            LocalFile::NotAFile => {}
        }
    }
    files
}

#[cfg(target_os = "macos")]
enum LocalFile {
    Path(String),
    Unresolved,
    NotAFile,
}

#[cfg(target_os = "macos")]
fn local_file(raw: &objc2_foundation::NSString) -> LocalFile {
    let Some(url) = objc2_foundation::NSURL::URLWithString(raw) else {
        return LocalFile::NotAFile;
    };
    let host = url.host().map(|host| host.to_string());
    let local = host.is_none_or(|host| host.is_empty() || host.eq_ignore_ascii_case("localhost"));
    if !url.isFileURL() || !local {
        return LocalFile::NotAFile;
    }
    let path = url
        .filePathURL()
        .and_then(|path_url| path_url.path())
        .map(|path| path.to_string());
    match path {
        Some(path) if path.starts_with('/') => LocalFile::Path(path),
        _ if url.isFileReferenceURL() => LocalFile::Unresolved,
        _ => LocalFile::NotAFile,
    }
}

#[cfg(test)]
mod image_tests {
    use super::*;

    const NAME: &str = "clipboard-20261120-090507.png";

    #[test]
    fn a_staged_image_is_the_only_file_of_a_fresh_terax_folder() {
        let png: Vec<u8> = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0xff].repeat(50);
        let first = stage_clipboard_image(&png, NAME).unwrap();
        let second = stage_clipboard_image(&png, NAME).unwrap();
        let path = std::path::Path::new(&first);
        let dir = path.parent().unwrap();
        let cleanup = || {
            for staged in [&first, &second] {
                let _ = std::fs::remove_dir_all(std::path::Path::new(staged).parent().unwrap());
            }
        };

        assert!(path.is_absolute(), "{first}");
        assert_ne!(first, second, "each paste gets its own folder");
        let folder = dir.file_name().unwrap().to_string_lossy().into_owned();
        assert!(folder.starts_with("terax-clipboard-"), "{folder}");
        let names: Vec<_> = std::fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(names, [NAME]);
        assert_eq!(std::fs::read(path).unwrap(), png);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o700);
        }
        let registry = crate::modules::workspace::WorkspaceRegistry::default();
        let checked = crate::modules::fs::copy::check_source(path, &registry);
        let guard = crate::modules::fs::guard::check_read_str(&first);
        let strict = crate::modules::fs::copy::secret_source(path);
        cleanup();
        assert!(checked.is_ok(), "the copy guard refused {first}");
        assert!(guard.is_ok(), "the secret deny-list refused {first}");
        assert_eq!(strict, Ok(()), "the terminal upload refused {first}");
    }

    #[test]
    fn an_image_name_must_stay_a_plain_png_name() {
        assert!(check_image_name(NAME).is_ok());
        for bad in [
            "",
            "../x.png",
            "a/b.png",
            "a\\b.png",
            ".png",
            ".hidden.png",
            "shot.txt",
            "shot.png\0",
        ] {
            assert!(check_image_name(bad).is_err(), "{bad:?}");
            assert!(stage_clipboard_image(b"x", bad).is_err(), "{bad:?}");
        }
        assert!(check_image_name(&format!("{}.png", "a".repeat(251))).is_ok());
        assert!(check_image_name(&format!("{}.png", "a".repeat(252))).is_err());
    }

    const DAY: std::time::Duration = std::time::Duration::from_secs(24 * 60 * 60);

    // Opening a folder as a file to stamp its mtime is POSIX-only.
    #[cfg(unix)]
    fn age(path: &std::path::Path, by: std::time::Duration) {
        let past = std::time::SystemTime::now() - by;
        std::fs::File::open(path).unwrap().set_modified(past).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn the_sweep_removes_only_day_old_terax_clipboard_folders() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path();
        let old = root.join("terax-clipboard-old");
        let fresh = root.join("terax-clipboard-fresh");
        let foreign = root.join("other-clipboard-old");
        let file = root.join("terax-clipboard-file.png");
        for dir in [&old, &fresh, &foreign] {
            std::fs::create_dir(dir).unwrap();
            std::fs::write(dir.join(NAME), b"x").unwrap();
        }
        std::fs::write(&file, b"x").unwrap();
        for stale in [&old, &foreign, &file] {
            age(stale, 2 * DAY);
        }

        sweep_staged_images(root, std::time::SystemTime::now(), DAY);

        assert!(!old.exists(), "a day-old staging folder is removed");
        assert!(fresh.join(NAME).exists(), "a fresh staging folder stays");
        assert!(foreign.join(NAME).exists(), "another prefix stays");
        assert!(file.exists(), "only folders are swept");
    }

    #[cfg(unix)]
    #[test]
    fn the_sweep_never_follows_a_linked_staging_folder() {
        let temp = tempfile::tempdir().unwrap();
        let elsewhere = tempfile::tempdir().unwrap();
        let target = elsewhere.path().join("terax-clipboard-target");
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join(NAME), b"keep").unwrap();
        age(&target, 2 * DAY);
        let link = temp.path().join("terax-clipboard-link");
        std::os::unix::fs::symlink(&target, &link).unwrap();

        let later = std::time::SystemTime::now() + 30 * DAY;
        sweep_staged_images(temp.path(), later, DAY);

        assert!(std::fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
        assert_eq!(std::fs::read(target.join(NAME)).unwrap(), b"keep");
    }

    #[test]
    fn the_sweep_ignores_a_missing_temp_folder() {
        let temp = tempfile::tempdir().unwrap();
        let missing = temp.path().join("missing");
        sweep_staged_images(&missing, std::time::SystemTime::now(), DAY);
        assert!(!missing.exists());
    }

    #[test]
    fn file_urls_on_the_clipboard_mean_no_image() {
        assert_eq!(image_flavor(true, true, true), None);
        assert_eq!(image_flavor(true, false, false), None);
        assert_eq!(image_flavor(false, true, true), Some(ImageFlavor::Png));
        assert_eq!(image_flavor(false, false, true), Some(ImageFlavor::Tiff));
        assert_eq!(image_flavor(false, false, false), None);
    }

    #[cfg(not(target_os = "macos"))]
    #[test]
    fn reading_a_clipboard_image_is_macos_only() {
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();
        let result = runtime.block_on(fs_clipboard_image(NAME.to_string()));
        assert_eq!(result.unwrap_err(), "clipboard image paste is only supported on macOS");
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use objc2::rc::Retained;
    use objc2::runtime::ProtocolObject;
    use objc2_app_kit::{
        NSPasteboard, NSPasteboardItem, NSPasteboardTypeFileURL, NSPasteboardTypeString,
        NSPasteboardWriting,
    };
    use objc2_foundation::{NSArray, NSString, NSURL};

    fn url_item(url: &NSURL) -> Retained<NSPasteboardItem> {
        let item = NSPasteboardItem::new();
        let raw = url.absoluteString().expect("absolute url");
        assert!(item.setString_forType(&raw, unsafe { NSPasteboardTypeFileURL }));
        item
    }

    fn write(pasteboard: &NSPasteboard, items: &[Retained<NSPasteboardItem>]) {
        pasteboard.clearContents();
        let objects: Vec<&ProtocolObject<dyn NSPasteboardWriting>> = items
            .iter()
            .map(|i| ProtocolObject::from_ref(&**i))
            .collect();
        assert!(pasteboard.writeObjects(&NSArray::from_slice(&objects)));
    }

    // A uniquely named private pasteboard: the user's general clipboard is
    // never read or written by this test.
    #[test]
    fn reads_decoded_file_paths_from_a_private_pasteboard() {
        let dir = tempfile::tempdir().unwrap();
        let root = std::fs::canonicalize(dir.path()).unwrap();
        let files = [root.join("a b.txt"), root.join("50%#.txt")];
        let folder = root.join("Ordner ä");
        let referenced = root.join("ref.txt");
        for f in files.iter().chain([&referenced]) {
            std::fs::write(f, b"x").unwrap();
        }
        std::fs::create_dir(&folder).unwrap();

        let ns = |p: &std::path::Path| NSString::from_str(&p.to_string_lossy());
        let mut items: Vec<_> = files
            .iter()
            .map(|f| url_item(&NSURL::fileURLWithPath(&ns(f))))
            .collect();
        items.push(url_item(&NSURL::fileURLWithPath_isDirectory(
            &ns(&folder),
            true,
        )));
        // Finder writes file-reference URLs; they resolve to the name as stored.
        let reference_to = |p: &std::path::Path| {
            let reference = NSURL::fileURLWithPath(&ns(p))
                .fileReferenceURL()
                .expect("file reference url");
            assert!(reference
                .absoluteString()
                .unwrap()
                .to_string()
                .starts_with("file:///.file/id="));
            url_item(&reference)
        };
        items.push(reference_to(&folder));
        items.push(reference_to(&referenced));
        let deleted = root.join("deleted.txt");
        std::fs::write(&deleted, b"x").unwrap();
        items.push(reference_to(&deleted));
        std::fs::remove_file(&deleted).unwrap();
        items.extend(not_files());

        let pasteboard = NSPasteboard::pasteboardWithUniqueName();
        write(&pasteboard, &items);
        let expected: Vec<String> = files
            .iter()
            .chain([&folder, &folder, &referenced])
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        let ClipboardFiles {
            paths: got,
            unresolved,
        } = read_files(&pasteboard);
        assert_eq!(got.len(), expected.len(), "{got:?}");
        assert_eq!(unresolved, 1, "only the deleted file");
        // fileURLWithPath spells the folder decomposed (NFD), so that item is
        // compared by file identity; every other item must match exactly.
        use std::os::unix::fs::MetadataExt;
        let id = |p: &str| {
            let m = std::fs::metadata(p).unwrap();
            (m.dev(), m.ino())
        };
        for (i, (g, e)) in got.iter().zip(&expected).enumerate() {
            assert_eq!(id(g), id(e), "item {i}: {g:?} vs {e:?}");
            if i != 2 {
                assert_eq!(g, e, "item {i}");
            }
        }

        pasteboard.clearContents();
        assert_eq!(read_files(&pasteboard), ClipboardFiles::default());
        write(&pasteboard, &not_files());
        assert_eq!(
            read_files(&pasteboard),
            ClipboardFiles::default(),
            "no file and nothing unresolved reads as an empty clipboard"
        );
        let _: () = unsafe { objc2::msg_send![&*pasteboard, releaseGlobally] };
    }

    fn not_files() -> Vec<Retained<NSPasteboardItem>> {
        let mut items: Vec<_> = [
            "https://example.com/a.txt",
            "file://fileserver/share/a.txt",
            "file:",
            "not a url",
        ]
        .iter()
        .map(|raw| {
            let item = NSPasteboardItem::new();
            let raw = NSString::from_str(raw);
            assert!(item.setString_forType(&raw, unsafe { NSPasteboardTypeFileURL }));
            item
        })
        .collect();
        let text = NSPasteboardItem::new();
        assert!(
            text.setString_forType(&NSString::from_str("hello"), unsafe {
                NSPasteboardTypeString
            })
        );
        items.push(text);
        items
    }

    #[test]
    fn a_silent_reader_times_out_and_a_failed_one_says_so() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        let budget = std::time::Duration::from_millis(20);
        runtime.block_on(async {
            let silent = std::future::pending::<Result<ClipboardFiles, ()>>();
            assert_eq!(
                receive_read(silent, budget).await.unwrap_err(),
                "clipboard read timed out or was cancelled"
            );
            let panicked = tokio::task::spawn_blocking(|| -> ClipboardFiles {
                panic!("the pasteboard reader panicked")
            });
            let roomy = std::time::Duration::from_secs(5);
            assert_eq!(
                receive_read(panicked, roomy).await.unwrap_err(),
                "clipboard read failed"
            );
            let files = ClipboardFiles {
                paths: vec!["/a".to_string()],
                unresolved: 1,
            };
            let ready = std::future::ready(Ok::<_, ()>(files));
            let got = receive_read(ready, budget).await.unwrap();
            assert_eq!((got.paths, got.unresolved), (vec!["/a".to_string()], 1));
        });
    }
}
