/// File and folder paths the OS clipboard holds (Finder copy). Only file URLs
/// are read, never text or images, and only on an explicit paste.
#[tauri::command]
pub async fn fs_clipboard_paths(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        // AppKit expects pasteboard access on the main thread; the wait for it
        // runs on the blocking pool so neither the main thread nor a worker stalls.
        let (tx, rx) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let pasteboard = objc2_app_kit::NSPasteboard::generalPasteboard();
            let _ = tx.send(read_file_paths(&pasteboard));
        })
        .map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || receive_paths(&rx, MAIN_THREAD_BUDGET))
            .await
            .map_err(|e| format!("fs_clipboard_paths task failed: {e}"))?
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
fn receive_paths(
    rx: &std::sync::mpsc::Receiver<Vec<String>>,
    budget: std::time::Duration,
) -> Result<Vec<String>, String> {
    rx.recv_timeout(budget)
        .map_err(|_| "clipboard read timed out or was cancelled".to_string())
}

/// Absolute paths of every pasteboard item carrying a file URL. Finder writes
/// file-reference URLs (`file:///.file/id=…`); `filePathURL` resolves them.
#[cfg(target_os = "macos")]
fn read_file_paths(pasteboard: &objc2_app_kit::NSPasteboard) -> Vec<String> {
    use objc2_app_kit::NSPasteboardTypeFileURL;
    use objc2_foundation::NSURL;

    let Some(items) = pasteboard.pasteboardItems() else {
        return Vec::new();
    };
    let file_type = unsafe { NSPasteboardTypeFileURL };
    items
        .iter()
        .filter_map(|item| {
            let raw = item.stringForType(file_type)?;
            let path = NSURL::URLWithString(&raw)?
                .filePathURL()?
                .path()?
                .to_string();
            (!path.is_empty()).then(|| super::to_canon(path))
        })
        .collect()
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
        let reference = NSURL::fileURLWithPath(&ns(&referenced))
            .fileReferenceURL()
            .expect("file reference url");
        assert!(reference
            .absoluteString()
            .unwrap()
            .to_string()
            .starts_with("file:///.file/id="));
        items.push(url_item(&reference));
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
            .chain([&folder, &referenced])
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        assert_eq!(read_file_paths(&pasteboard), expected);

        pasteboard.clearContents();
        assert!(read_file_paths(&pasteboard).is_empty());
        let _: () = unsafe { objc2::msg_send![&*pasteboard, releaseGlobally] };
    }

    #[test]
    fn a_silent_or_gone_main_thread_fails_with_the_timeout_text() {
        let message = "clipboard read timed out or was cancelled";
        let (tx, rx) = std::sync::mpsc::channel::<Vec<String>>();
        let budget = std::time::Duration::from_millis(20);
        assert_eq!(receive_paths(&rx, budget).unwrap_err(), message);
        drop(tx);
        assert_eq!(receive_paths(&rx, budget).unwrap_err(), message);
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(vec!["/a".to_string()]).unwrap();
        assert_eq!(receive_paths(&rx, budget).unwrap(), ["/a"]);
    }
}
