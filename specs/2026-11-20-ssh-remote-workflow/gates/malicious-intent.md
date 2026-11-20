# Malicious Intent Scan (L2)

**Feature:** 2026-11-20-ssh-remote-workflow · **Branch:** ssh-remote-workflow · **Date:** 2026-11-20 · **Scan Mode:** L2_semantic

Diff: `git diff origin/main...ssh-remote-workflow` (7 Commits, 37c463f bis 9a8352b)

## Summary
**Verdict:** PASS
**Findings:** 1 (0 HIGH, 0 MEDIUM, 1 LOW advisory) · **Files Scanned:** 27

| Lens | Status | Findings |
|---|---|---|
| Code Execution (MI-01/02/07/08) | PASS | 1 (LOW) |
| Data Exfiltration (MI-03/04/06) | PASS | 0 |
| Supply Chain (MI-05/09/10) | PASS | 0 |

## Geprüft und unauffällig

- **Eingebettetes Python-Hilfsprogramm (`src-tauri/src/modules/ssh.rs`, `prep_uploads` / `_sweep_uploads`):** Der Pfad ist fest `~/.terax/uploads` (kein Wert aus der Anfrage). Ordner werden mit 0700 angelegt, danach `chmod 0700`. Ein Symlink an der Stelle des Upload-Ordners wird über `lstat` abgelehnt, bevor gelöscht wird. Die Löschung nimmt nur direkte Einträge, die älter als 7 Tage sind; `stat(follow_symlinks=False)` sorgt dafür, dass Symlink-Ziele nicht angefasst werden. Ordner werden nur gelöscht, wenn ihr Name zum bestehenden Staging-Präfix passt (`_staging`). Neu ist nur der Import `time`. Es gibt kein `eval`/`exec`, keinen Netzwerkzugriff und keinen Prozessstart. Das neue `import time` steckt in einer bestehenden Python-Konstante, die über den bestehenden `run_remote_json`-Weg läuft; einen neuen Ausführungsweg gibt es nicht.
- **`ssh_prepare_upload_dir`:** `validate_ssh_host(host)` schützt gegen Option-Injection (der Test prüft `-oProxyCommand=x`). Die Antwort wird nur angenommen, wenn sie absolut ist und auf `/.terax/uploads` endet.
- **Zwischenablage-Bild (`src-tauri/src/modules/fs/clipboard.rs`):** liest nur PNG/TIFF aus dem macOS-Pasteboard. Der Dateiname aus der IPC wird geprüft (kein `/`, `\`, `\0`, kein führender Punkt, Endung `.png`, höchstens 255 Bytes). Das Bild wird in einen frischen 0700-Tempordner geschrieben (`create_new`). Daten verlassen den Rechner nur über das bestehende `fs_copy` zum SSH-Host, den der Nutzer selbst verbunden hat, und nur nach einer Nutzeraktion (Cmd+V ohne Text oder Datei-Drop). Ein Test (`uploadBoundary.test.ts`) stellt sicher, dass der KI-Agent kein Werkzeug für Upload oder Zwischenablage-Bild bekommt (BR-9).
- **Frontend (`uploadStore.ts`, `terminalUpload.ts`, `rendererPool.ts`, `useTerminalSession.ts`):** Ziel ist immer `task.env.host` der SSH-Sitzung des Panes. Es gibt keine fest eingetragenen oder fremden Endpunkte und kein `fetch`/WebSocket. Die 100-MB-Grenze und der Ausschluss von Ordnern greifen vor der Übertragung.
- **Supply Chain:** `Cargo.toml` schaltet nur zusätzliche Features (`NSData`, `NSDictionary`, `NSBitmapImageRep`, `NSImageRep`) bei schon vorhandenen Crates `objc2-foundation`/`objc2-app-kit` frei. Es gibt keine neuen Abhängigkeiten, keine Lockfile-Änderung, keine Install-Hooks und keine CI-Workflows.
- **Spec-/Evidence-Dateien:** enthalten keine Prompt-Injection-Marker, keine Secrets und keine ausführbaren Inhalte.

## Findings

### MIS-1: Vom Server gelieferte Pfade werden ins Terminal eingefügt
**Pattern:** MI-07 (Process Spawning, indirekt über Terminal-Eingabe) · **Lens:** Code Execution · **Severity:** LOW · **Confidence:** LOW · **OWASP:** ASI05, LLM05
**Location:** `src/modules/terminal/lib/terminalUpload.ts:58` (`uploadPasteText`), `src/modules/terminal/lib/uploadStore.ts:95` (`deliver`)
**Matched content:**
```ts
return formatDroppedPaths(serverPaths, "posix");
```
**Analysis:** `result.created` sind die Zielpfade, die `fs_copy` über das Hilfsprogramm vom Server zurückbekommt. Sie werden per `term.paste` (bracketed paste) in die SSH-Shell eingefügt. Ein kompromittierter Server könnte darüber Pfade mit Sonderzeichen liefern. `quotePosix` setzt aber alles außerhalb von `[A-Za-z0-9_@%+=:,./-]` in einfache Anführungszeichen und maskiert `'` korrekt. Bracketed paste führt nichts von selbst aus. Wer den Server kontrolliert, hat die Shell ohnehin schon. Es ist kein Angriff aus dem Diff heraus erkennbar, nur defensive Härtung.
**Taint chain:** Remote-Hilfsprogramm-Antwort -> `CopyResult.created` -> `quoteShellPath(…, "posix")` -> `term.paste`
**Recommendation:** Optional: Nur Pfade einfügen, die mit dem zuvor bestätigten `destDir` beginnen.

## Notes
- LOW-Findings sind nur Hinweise und lösen kein FAIL aus.
- L1 (GitHub Action, Regex) ergänzt diesen Scan; beide Ebenen laufen parallel.
- Der macOS-Zweig von `read_png`/`fs_clipboard_image` wurde laut Evidence nicht unter Linux kompiliert. Das ist ein QA-Thema, kein Sicherheitsbefund.
