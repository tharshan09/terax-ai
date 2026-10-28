/// The clipboard's files. A file URL that no longer leads to a file (its
/// original was deleted) is counted, so the paste can report it as failed.
#[derive(Debug, Default, PartialEq, serde::Serialize)]
pub struct ClipboardFiles {
    pub paths: Vec<String>,
    pub unresolved: usize,
}

/// File and folder paths the OS clipboard holds (Finder copy). Only file URLs
/// are read, never text or images, and only on an explicit paste.
#[tauri::command]
pub async fn fs_clipboard_paths(app: tauri::AppHandle) -> Result<ClipboardFiles, String> {
    #[cfg(target_os = "macos")]
    {
        // AppKit expects pasteboard access on the main thread; awaiting its
        // answer parks only this task, no thread.
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.run_on_main_thread(move || {
            let pasteboard = objc2_app_kit::NSPasteboard::generalPasteboard();
            let _ = tx.send(read_files(&pasteboard));
        })
        .map_err(|e| e.to_string())?;
        receive_paths(rx, MAIN_THREAD_BUDGET).await
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("clipboard file paste is only supported on macOS".into())
    }
}

#[cfg(target_os = "macos")]
const MAIN_THREAD_BUDGET: std::time::Duration = std::time::Duration::from_secs(5);

#[cfg(target_os = "macos")]
async fn receive_paths(
    rx: tokio::sync::oneshot::Receiver<ClipboardFiles>,
    budget: std::time::Duration,
) -> Result<ClipboardFiles, String> {
    match tokio::time::timeout(budget, rx).await {
        Ok(Ok(files)) => Ok(files),
        _ => Err("clipboard read timed out or was cancelled".to_string()),
    }
}

/// Every pasteboard item carrying a file URL, as an absolute path or counted
/// as unresolved. Finder writes file-reference URLs (`file:///.file/id=…`).
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
        match file_path(&raw) {
            Some(path) => files.paths.push(super::to_canon(path)),
            None => files.unresolved += 1,
        }
    }
    files
}

#[cfg(target_os = "macos")]
fn file_path(raw: &objc2_foundation::NSString) -> Option<String> {
    let path = objc2_foundation::NSURL::URLWithString(raw)?
        .filePathURL()?
        .path()?
        .to_string();
    (!path.is_empty()).then_some(path)
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
        let web = NSPasteboardItem::new();
        let not_a_file = NSString::from_str("https://example.com/a.txt");
        assert!(web.setString_forType(&not_a_file, unsafe { NSPasteboardTypeFileURL }));
        items.push(web);
        let text = NSPasteboardItem::new();
        assert!(
            text.setString_forType(&NSString::from_str("hello"), unsafe {
                NSPasteboardTypeString
            })
        );
        items.push(text);

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
        assert_eq!(unresolved, 2, "the deleted file and the web URL");
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
        let _: () = unsafe { objc2::msg_send![&*pasteboard, releaseGlobally] };
    }

    #[test]
    fn a_silent_or_gone_main_thread_fails_with_the_timeout_text() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_time()
            .build()
            .unwrap();
        let message = "clipboard read timed out or was cancelled";
        let budget = std::time::Duration::from_millis(20);
        runtime.block_on(async {
            let (silent, rx) = tokio::sync::oneshot::channel::<ClipboardFiles>();
            assert_eq!(receive_paths(rx, budget).await.unwrap_err(), message);
            drop(silent);
            let (gone, rx) = tokio::sync::oneshot::channel::<ClipboardFiles>();
            drop(gone);
            assert_eq!(receive_paths(rx, budget).await.unwrap_err(), message);
            let (tx, rx) = tokio::sync::oneshot::channel();
            let files = ClipboardFiles {
                paths: vec!["/a".to_string()],
                unresolved: 1,
            };
            tx.send(files).unwrap();
            let got = receive_paths(rx, budget).await.unwrap();
            assert_eq!((got.paths, got.unresolved), (vec!["/a".to_string()], 1));
        });
    }
}
