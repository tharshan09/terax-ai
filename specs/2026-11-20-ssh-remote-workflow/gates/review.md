# Post-Implement Review Report

**Feature:** SSH Remote Workflow, Welle 1 (Upload von Zwischenablage-Bildern und gezogenen Dateien in SSH-Terminals)
**Branch:** ssh-remote-workflow
**Default-Branch:** main (Vergleichsbasis origin/main)
**Datum:** 2026-11-20
**Perspektive:** quality+alignment (Teil A + Teil B)
**Prüfmenge:** `git diff origin/main...ssh-remote-workflow -- src src-tauri` (20 Dateien, alle vollständig gelesen). Kontext: `slim-spec.md`, `slop-dispositions.md`, `discovery.md` (Ausschnitte), `TERAX.md`.

---

## Summary

**Verdict:** FAILED

### Part A: Code Quality

| Kriterium | Findings |
|-----------|----------|
| A.1 Logic Errors | 2 |
| A.2 Error Handling | 0 |
| A.3 Security | 0 |
| A.4 Anti-Patterns | 1 |
| **Subtotal** | **3** |

### Part B: Codebase Alignment

| Kriterium | Findings |
|-----------|----------|
| B.1 Duplicate Solution Paths | 1 |
| B.2 Abstraction Reuse | 0 |
| B.3 Schema Consistency | 0 |
| B.4 Dead Code / Unused Imports | 1 |
| B.5 Error Handling Divergence | 0 |
| B.6 Configuration Drift | 0 |
| B.7 Interface Inconsistency | 0 |
| B.8 Dependency Direction | 0 |
| B.9 Security Pattern Consistency | 0 |
| B.10 Performance Pattern Consistency | 0 |
| **Subtotal** | **2** |

| **Total** | **5** |

Befund-Klassen: 1 `decision`, 2 `fix`, 1 `obligation`, 1 `note`. Alle Befunde: `decision = pending_review`.

---

## Findings

### RV-1: Bereitgestellte Zwischenablage-Bilder bleiben lokal dauerhaft liegen

**Kategorie:** A.4 (Resource Leak) · **Klasse:** decision · **ID:** A.4-1

**Problem:**
`stage_clipboard_image` legt je Cmd+V einen neuen Ordner `terax-clipboard-*` im Temp-Verzeichnis an, schreibt das PNG hinein und gibt die Löschung mit `dir.keep()` auf. Kein Code im Diff oder Bestand entfernt diese Ordner wieder: `terax-clipboard` kommt nur als Präfix (`clipboard.rs:111`) und im Test (`clipboard.rs:203`) vor. `transfer` in `uploadStore.ts:72-93` lädt die Datei per `fs_copy` hoch und lässt die lokale Quelle unangetastet. Zusätzlich: läuft `receive_read` in das 5-s-Budget (`clipboard.rs:42`, `:59-63`), arbeitet der `spawn_blocking`-Task weiter und legt die Datei trotzdem ab, ohne dass sie je hochgeladen wird. Jeder hochgeladene Screenshot bleibt so als Kopie (Inhalt potenziell vertraulich, Ordner 0700) im lokalen Temp-Verzeichnis, bis eine Bereinigung durch das Betriebssystem greift. Discovery und Spec regeln die Aufbewahrung nur auf dem Server (FL-5, BR-8: 7 Tage), nicht für die lokale Kopie.

**Neuer Code:** `src-tauri/src/modules/fs/clipboard.rs:118-127`, `src/modules/terminal/lib/uploadStore.ts:154-167`
**Bestehendes Pattern:** `src-tauri/src/modules/ssh.rs:479-497` (`_sweep_uploads`, im selben Diff) räumt die Server-Kopien nach 7 Tagen; für die lokale Bereitstellung fehlt ein Gegenstück.

**Erwartete Beobachtung:** Nach k Screenshot-Uploads per Cmd+V in einem SSH-Pane zeigt `ls "$TMPDIR" | grep terax-clipboard-` k Ordner mit je einer `clipboard-*.png`, auch nach Ende der Uploads und nach Neustart von Terax.

**Empfehlung:**
PM entscheidet die Aufbewahrung der lokalen Kopie. Naheliegend: beim nächsten `fs_clipboard_image` alle `terax-clipboard-*`-Ordner in `std::env::temp_dir()` löschen, die älter als eine kurze Frist sind (analog `_sweep_uploads`, nur Ordner mit genau diesem Präfix und 0700, ohne Symlinks), statt eines allgemeinen Lösch-Befehls über IPC.

---

### RV-2: Hinweis „Uploading 1 file...“ erscheint auch, wenn kein Bild in der Zwischenablage ist

**Kategorie:** A.1 · **Klasse:** fix · **ID:** A.1-1

**Problem:**
`interceptTerminalPaste` reicht jeden Paste ohne `text/plain` an `uploadClipboardImage` weiter (`uploadStore.ts:212-215`, bewusst mit `hasImage: true`). `uploadClipboardImage` reiht den Auftrag sofort mit `files: [name]` ein (`uploadStore.ts:159-166`), bevor `fs_clipboard_image` geantwortet hat. Die Warteschlange zählt damit eine Datei, und `UploadHint` zeigt `Uploading 1 file...`, bis die Antwort `null` eintrifft (bei einem trägen Pasteboard-Anbieter bis zu `READ_BUDGET` = 5 s, `clipboard.rs:52`). Der Test „does nothing visible when the clipboard holds no image“ (`uploadStore.test.ts:309-317`) prüft nur den Endzustand (`pending(31)` wird 0); unmittelbar nach `await uploadClipboardImage(...)` ist `pending(31)` 1. Die Testbezeichnung belegt die Aussage also nicht.

**Neuer Code:** `src/modules/terminal/lib/uploadStore.ts:154-167`

**Erwartete Beobachtung:** In einem SSH-Pane mit leerer Zwischenablage (oder nur Nicht-Bild-Inhalt ohne Text) blitzt nach Cmd+V unten rechts `Uploading 1 file...` auf. Im Test: `expect(pending(31)).toBe(0)` direkt nach `await uploadClipboardImage(31, DEVBOX)` schlägt fehl.

**Empfehlung:**
`prepared` in `uploadClipboardImage` erst nach der Antwort von `fs_clipboard_image` auflösen lassen und bei `null` `null` liefern (wie `prepareDrop` bei leerer Auswahl); die `intake`-Kette in `queueInOrder` hält die Reihenfolge weiterhin. Test um eine Prüfung des Zwischenzustands ergänzen.

---

### RV-3: Finder-Dateikopie plus Cmd+V im SSH-Pane ist ungeprüft und kann ein Datei-Icon hochladen

**Kategorie:** A.1 · **Klasse:** obligation · **ID:** A.1-2

**Problem:**
Der Upload-Einstieg wertet jeden Paste ohne `text/plain` als Bild-Kandidaten (`uploadStore.ts:204-215`). `read_png` nimmt jede PNG- oder TIFF-Darstellung des Pasteboards (`clipboard.rs:68-85`) und prüft nicht, ob das Pasteboard Datei-Verweise trägt; `read_files` (`clipboard.rs:132-151`) kennt diese Finder-Verweise, wird hier aber nicht herangezogen. Liefert WebKit bei einer Finder-Kopie einer Datei kein `text/plain` an das paste-Ereignis und legt der Finder zusätzlich ein Bild (Datei-Icon) ab, lädt Cmd+V im SSH-Pane das Icon als `clipboard-*.png` hoch und fügt dessen Server-Pfad ein. Ob beide Bedingungen auf macOS zutreffen, ist auf diesem Linux-Host nicht beobachtbar; der Code-Pfad dafür ist offen. Auf `main` führte derselbe Paste zu einem leeren xterm-Paste.

**Neuer Code:** `src/modules/terminal/lib/uploadStore.ts:204-215`, `src-tauri/src/modules/fs/clipboard.rs:68-85`

**Erwartete Beobachtung (QA, macOS-App):** Datei im Finder mit Cmd+C kopieren, im SSH-Pane Cmd+V. Tritt das Risiko ein, erscheint `Uploading 1 file...` und danach `/home/u/.terax/uploads/clipboard-JJJJMMTT-HHMMSS.png ` mit dem Datei-Icon.

**Empfehlung:**
Fall in die QA-Prüfung von Slice 3 AC-8 aufnehmen. Reproduziert er sich, in `read_png` `None` liefern, sobald das Pasteboard `NSPasteboardTypeFileURL`-Einträge trägt (gleiche Abfrage wie in `read_files`).

---

### RV-4: Zwei Quellen für „ist dieses Pane SSH“ in useTerminalSession

**Kategorie:** B.1 · **Klasse:** note · **ID:** B.1-1

**Problem:**
`leafWorkspace` liest `spawnEnv` und ist laut Kommentar „The one source for "is this pane SSH"“ (`useTerminalSession.ts:219-224`). Im selben Modul entscheidet `isSshDisconnect(s.workspace, code)` (`useTerminalSession.ts:661`) weiterhin über `s.workspace`. Bei einem Tab ohne eigene Umgebung im SSH-Workspace ist `s.workspace` leer (`useTabs.ts:43-50`: „a workspace-less tab spawns on `currentWorkspaceEnv()`“; Slop #2). Dasselbe Pane gilt damit für Uploads als SSH, für die Verbindungsabbruch-Erkennung nicht: ein Abbruch (ssh exit 255) läuft dort als normales Ende (`onExit`), ohne Reconnect-Hinweis. Das Verhalten bestand schon auf `main`; Slop #2 beschränkt Welle 1 bewusst auf die neue Abfrage. Der Kommentar beschreibt den Ist-Zustand des Moduls aber zu weit.

**Neuer Code:** `src/modules/terminal/lib/useTerminalSession.ts:219-224`
**Bestehendes Pattern:** `src/modules/terminal/lib/useTerminalSession.ts:661`, `src/modules/terminal/lib/sshReconnect.ts:15-20`

**Erwartete Beobachtung:** Einfacher neuer Tab im SSH-Workspace, Netz trennen: das Pane zeigt nicht „SSH connection lost ... Press Enter to reconnect“, ein Upload im selben Pane läuft dagegen über SSH.

**Empfehlung:**
Kommentar auf den tatsächlichen Geltungsbereich eingrenzen (Quelle, die der Upload-Pfad liest) oder in einer Folgewelle `isSshDisconnect(s.spawnEnv ?? s.workspace, code)` nutzen; letzteres ändert Nutzerverhalten und ist eine eigene Entscheidung.

---

### RV-5: Ungenutzte Konstante UPLOAD_DIR mit Tilde-Pfad

**Kategorie:** B.4 · **Klasse:** fix · **ID:** B.4-1

**Problem:**
`export const UPLOAD_DIR = "~/.terax/uploads";` wird nirgends importiert oder intern verwendet (Suche über `src` und `src-tauri`: nur die Definition). `pnpm knip` meldet sie als ungenutzten Export (`UPLOAD_DIR src/modules/terminal/lib/terminalUpload.ts:6:14`). Der echte Ordner kommt absolut aus `prep_uploads` (`ssh.rs:460-476`) und wird in Rust gegen `UPLOAD_DIR_TAIL` geprüft (`ssh.rs:1561`, `:1580`). Die Tilde-Form widerspricht Stolperstein 1 (ein `~`-Pfad darf nicht eingefügt werden) und lädt zur Fehlverwendung ein.

**Neuer Code:** `src/modules/terminal/lib/terminalUpload.ts:6`
**Bestehendes Pattern:** Ordnername und Absolutheit liegen in `src-tauri/src/modules/ssh.rs:460-476` und `:1561-1585`.

**Erwartete Beobachtung:** `grep -rn UPLOAD_DIR src` findet nur `terminalUpload.ts:6` (plus `UPLOAD_DIR_TAIL` in Rust).

**Empfehlung:**
Konstante löschen.

---

## Prüfaufträge des Aufrufers (Ergebnis ohne weiteren Befund)

### 1. macOS-Zweig in `clipboard.rs` (nie kompiliert)

Statisch geprüft gegen den Quelltext der gesperrten Versionen aus `Cargo.lock` (objc2-app-kit 0.3.2, objc2-foundation 0.3.2, objc2 0.6.5; Quelltext von crates.io geladen). Ergebnis: kein Kompilier- und kein offensichtlicher Laufzeitfehler.

| Stelle | Prüfung | Beleg (Quelltext der Abhängigkeit) |
|---|---|---|
| `clipboard.rs:72`, `:75` `pasteboard.dataForType(unsafe { NSPasteboardTypePNG / TIFF })` | Methode ist safe, nimmt `&NSPasteboardType`, liefert `Option<Retained<NSData>>`; Statics brauchen `unsafe` wie `NSPasteboardTypeFileURL` im Bestand (`clipboard.rs:139`) | objc2-app-kit `src/generated/NSPasteboard.rs:457-459`, `:26`, `:31`; Re-Export `src/generated/mod.rs:5445`, `:5457` |
| `clipboard.rs:73`, `:84` `png.to_vec()` | safe, Feature `NSData` aktiv | objc2-foundation `src/data.rs:108` |
| `clipboard.rs:76` `NSBitmapImageRep::imageRepWithData(&tiff)` | safe, `&Retained<NSData>` wird zu `&NSData` deref-koerziert; Klasse ohne `MainThreadOnly`, also auf dem Blocking-Worker zulässig | objc2-app-kit `src/generated/NSBitmapImageRep.rs:217-222`, `:318-320`; Re-Export `mod.rs:2641-2642` (braucht `NSBitmapImageRep` + `NSImageRep`, beide gesetzt) |
| `clipboard.rs:77-80` `NSDictionary::<NSString, AnyObject>::new()` | `new` existiert für `KeyType: Message, ObjectType: Message`; `AnyObject` ist `Message` | objc2-foundation `src/generated/NSDictionary.rs:161-166`; objc2 `src/runtime/mod.rs:1233` |
| `clipboard.rs:81-83` `representationUsingType_properties(NSBitmapImageFileType::PNG, &properties)` | `unsafe fn`, Schlüsseltyp `NSBitmapImageRepPropertyKey = NSString`, Konstante `PNG` vorhanden | objc2-app-kit `NSBitmapImageRep.rs:556-563`, `:140`, `:65` |
| `clipboard.rs:37-39` `autoreleasepool(|_| read_png(...))` | Signatur `fn autoreleasepool<T, F>(f: F) -> T`; Rückgabe `Option<Vec<u8>>`, kein `Retained` verlässt den Pool | objc2 `src/rc/autorelease.rs:440-443` |
| `clipboard.rs:36-42` `spawn_blocking` + `receive_read(...).await?` | `JoinHandle<Result<Option<String>, String>>` ergibt `Result<Result<..>, tauri::Error>`; generisches `receive_read<T, E>` plus `?` ergibt den Rückgabetyp | Code |
| `Cargo.toml:66-67` Features | objc2-app-kit aktiviert per Default alle Features (`Cargo.toml` der Crate, `default = [...]` ab Zeile 2017); die Ergänzungen sind korrekt, aber ohne Wirkung | objc2-app-kit `Cargo.toml:2017` |
| `clipboard.rs:110-118` `tempfile::Builder::permissions` + `tempdir()` | wirkt auch für Ordner (`DirBuilder::mode`); Kommentar zu `0777 & !umask` stimmt | tempfile 3.27.0 `src/dir/imp/unix.rs:6-17`, `src/lib.rs:407-409` |
| `clipboard.rs:120` Kanonisierung | `/var` zu `/private/var`; Deny-Liste sperrt `/private/var/folders` nicht | `src-tauri/src/modules/fs/guard.rs:64-100` |

Grenze: Der Zweig wird erstmals im CI-Job `rust-test (macos-latest)` (`.github/workflows/ci.yml:106-131`, `cargo check --all-targets` + `cargo nextest`) übersetzt; dort läuft kein `clippy -D warnings`.

### 2. `prep_uploads` im Python-Helper

- Löschen außerhalb von `~/.terax/uploads`: `_sweep_uploads` listet nur Einträge dieses Ordners, `stat(follow_symlinks=False)`, `os.unlink` entfernt bei Links nur den Link (Test `the_sweep_removes_only_week_old_entries_of_the_upload_dir`), `rmtree` nur für Ordner mit Staging-Namen (`_staging`, `ssh.rs:273-276`), die vorher per lstat als echter Ordner erkannt wurden; Pythons `rmtree` folgt einer Wurzel als Symlink nicht. Ein Symlink als `uploads` wird abgelehnt (`ssh.rs:470-472`, Test `a_linked_upload_dir_is_refused_and_its_target_left_alone`). Ein Symlink als `~/.terax` wird nicht abgelehnt; der Sweep bleibt dann trotzdem im tatsächlichen `uploads`-Ordner hinter dem Link.
- Races: Prüfung (`os.lstat`) und Nutzung (`chmod`, `scandir`) laufen pfadbasiert. Ein Austausch dazwischen setzt Schreibrecht auf `~/.terax` voraus; legt der Helper den Ordner an, ist er 0700 (nur das Konto selbst und root). Ein schon vorhandenes `~/.terax` wird nicht verengt. Im Vertrauensmodell „trust-the-host-account“ (TERAX.md, git-Abschnitt) kein Befund; der übrige Helper arbeitet ebenso pfadbasiert (`ssh.rs:516`, `:668`).
- Injection: `host` wird zweimal geprüft (`ssh.rs:1573`, `:1132`, Regel `ssh.rs:79-87`) und als eigenes argv-Element an `ssh` gegeben; die Anfrage geht als JSON über stdin; `prep_uploads` liest keine Felder aus der Anfrage. Die Rust-Seite akzeptiert nur Antworten mit führendem `/` und Endung `/.terax/uploads` (`ssh.rs:1578-1585`). Kein Befund.
- Mtime-Falle geprüft: `write_bytes` setzt keine Quell-mtime (`ssh.rs:522-547`, kein `utime`), frisch hochgeladene alte Dateien werden also nicht beim nächsten Upload weggeräumt.

### 3. Capture-Listener und `pasteIntoLeafWhenBound` in `rendererPool.ts`

- xterm 6 registriert `paste` auf `textarea` und `element` in der Bubble-Phase (`node_modules/@xterm/xterm/lib/xterm.mjs`, `this._register(L(this.textarea,"paste",e)),this._register(L(this.element,"paste",e))`), beide liegen im `host`; der Capture-Listener auf `host` läuft davor. Andere `paste`-Listener gibt es in `src` nicht.
- Text wird nicht verschluckt: lokale/WSL-Panes und SSH-Panes mit nicht leerem `text/plain` geben `false` zurück, xterm fügt einmal ein (`uploadStore.ts:210-213`, Tests `leaves local and WSL panes...`, `lets any text win...`). Kein doppeltes Einfügen: bei `true` stoppen `preventDefault` + `stopPropagation` in der Capture-Phase den xterm-Handler, und auf macOS behandelt der Key-Handler Cmd+V nicht (`rendererPool.ts:432-448`). Verschluckt wird nur ein Paste ohne Text (siehe RV-2, RV-3).
- `pasteIntoLeafWhenBound`: Zustellung nur, wenn der Slot im Rückruf noch dasselbe Pane trägt (`rendererPool.ts:209`), sonst Rückstellung nur für lebende Panes (`:210`); `disposeLeafSlot` löscht offene Texte (`:1209`); Pane-IDs werden nicht wiederverwendet (`useTabs.ts:563`, `:586`, fortlaufend). Der Snapshot enthält den Bracketed-Paste-Modus (SerializeAddon schreibt `\x1b[?2004h`), die Aussage des Kommentars `rendererPool.ts:202-203` stimmt.

### 4. `uploadStore.ts` und `useTerminalSession.ts`

- Geschlossenes Pane: vor Ordner-Vorbereitung, vor `fs_copy` und vor der Auswertung wird `paneOpen` geprüft (`uploadStore.ts:78`, `:82`, `:89`, `:91`); `runPane` räumt Warteschlange und Aufgaben (`:117-120`); `prepareDrop` und `queueInOrder` starten für geschlossene Panes nichts (`:143`, `:189`).
- Reihenfolge: `intake` reiht Auslösungen je Pane in Auslösereihenfolge ein, nur der Kopf läuft (`terminalUpload.ts:69-86`); Rückstellungen in `rendererPool` hängen in Reihenfolge an.
- Lokale/WSL-Panes: `openPtyForSession` übergibt `s.workspace ?? currentWorkspaceEnv()` im selben Takt wie vorher `openPty` (`pty-bridge.ts:52`); Drop in lokale/WSL-Panes bleibt `pasteIntoLeaf` (`useTerminalFileDrop.ts:51-53`).

---

## Weitere Beobachtungen (außerhalb der Kriterien, nicht gezählt)

- Für Slice 3 AC-1 (`leafWorkspace` nach Workspace-Wechsel) und AC-3 (Zustellung ohne Slot) gibt es keinen Test, der die Invariante festhält; `leafWorkspace`, `spawnEnv` und `pasteIntoLeafWhenBound` kommen in keiner Testdatei vor. TERAX.md, Abschnitt Quality bar, verlangt für Änderungen an Terminal/Shell-Spawn einen solchen Test.
- TERAX.md (Architektur-Liste der Befehle) nennt `fs_clipboard_image` und `ssh_prepare_upload_dir` nicht; der Abschnitt zu `fs_copy` erwähnt den Terminal-Upload nicht. Datei liegt außerhalb der Prüfmenge.

---

## Changed Files

| File | Lines Changed | Findings |
|------|---------------|----------|
| src-tauri/Cargo.toml | +2 -2 | 0 |
| src-tauri/src/lib.rs | +2 -0 | 0 |
| src-tauri/src/modules/fs/clipboard.rs | +166 -8 | 2 (RV-1, RV-3) |
| src-tauri/src/modules/ssh.rs | +276 -1 | 0 |
| src/lib/copyFailure.test.ts | +31 -0 | 0 |
| src/lib/copyFailure.ts | +18 -0 | 0 |
| src/modules/ai/tools/uploadBoundary.test.ts | +64 -0 | 0 |
| src/modules/explorer/lib/clipboardPaste.ts | +5 -13 | 0 |
| src/modules/terminal/PaneTreeView.tsx | +2 -0 | 0 |
| src/modules/terminal/UploadHint.test.tsx | +53 -0 | 0 |
| src/modules/terminal/UploadHint.tsx | +24 -0 | 0 |
| src/modules/terminal/lib/quoteShellPath.test.ts | +26 -0 | 0 |
| src/modules/terminal/lib/quoteShellPath.ts | +20 -4 | 0 |
| src/modules/terminal/lib/rendererPool.ts | +53 -0 | 0 |
| src/modules/terminal/lib/terminalUpload.test.ts | +221 -0 | 0 |
| src/modules/terminal/lib/terminalUpload.ts | +160 -0 | 1 (RV-5) |
| src/modules/terminal/lib/uploadStore.test.ts | +318 -0 | 0 (Beleg in RV-2) |
| src/modules/terminal/lib/uploadStore.ts | +216 -0 | 2 (RV-2, RV-3) |
| src/modules/terminal/lib/useTerminalFileDrop.ts | +7 -4 | 0 |
| src/modules/terminal/lib/useTerminalSession.ts | +24 -2 | 1 (RV-4) |

Zeilenzahlen aus `git diff --numstat`.

## Prüfmenge

- **Geprüft:** alle 20 Dateien oben gegen A.1-A.4 und B.1-B.10.
- **Nur teilweise geprüft:** `src-tauri/src/modules/fs/clipboard.rs` (macOS-Zweig statisch gegen Crate-Quelltext, nicht kompiliert, nicht ausgeführt; Linux-Host ohne cargo und ohne macOS). `src/modules/terminal/lib/rendererPool.ts` und `uploadStore.ts` (Inhalt des WebKit-paste-Ereignisses auf macOS nicht beobachtbar, nur der Code-Pfad).
- **Nicht ausgeführt:** Tests (laut Aufrufer grün: vitest 1127, cargo test 577 im Linux-Container). Ausgeführt wurde nur `pnpm knip` als Beleg für RV-5.
