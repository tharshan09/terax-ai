# Slim Spec: SSH Remote Workflow, Welle 1 (Upload in SSH-Terminals)

**Discovery:** specs/2026-11-20-ssh-remote-workflow/discovery.md
**Architecture:** --
**Clickdummy:** --
**Slop-Dispositions:** specs/2026-11-20-ssh-remote-workflow/slop-dispositions.md

Scope dieses Laufs: nur Discovery-Slice 1 (Welle 1). Er ist hier in drei Bau-Slices geschnitten. Upload-Ordner auf dem Server: `~/.terax/uploads`, vor jeder Verwendung zu einem absoluten Pfad aufgelöst (Beispiele unten mit Home `/home/u`). 100 MB = 104857600 Bytes. `[Pruefweg: QA]` = nur in der laufenden macOS-App beobachtbar (CI auf dem macOS-Runner plus Handprüfung).

---

## Test-Strategy

| Key | Value |
|-----|-------|
| **Stack** | `TypeScript + Rust (Tauri 2, React 19, pnpm)` |
| **Test Command** | `pnpm test` (vitest); Rust: `docker run --rm --user $(id -u):$(id -g) -e HOME=/tmp -v "$PWD":/work -v terax-cargo:/cargo -v terax-target:/target -w /work/src-tauri terax-rust:local cargo test --locked` |
| **E2E Command** | `--` |
| **Start Command** | `--` |
| **Health Endpoint** | `--` |
| **Mocking Strategy** | `no_mocks` |

---

## Dependencies

```
Slice 1: Reine Upload-Regeln -> (none)
Slice 2: Backend Upload-Ordner und Zwischenablage-Bild -> (none)
Slice 3: Terminal-Anbindung und Hinweis -> Slice 1, Slice 2
```

---

## Slice 1: Upload-Regeln als reine Funktionen festlegen

**Goal:** Alle Entscheidungen von Welle 1 (wann hochgeladen wird, Namen, Grenze, Reihenfolge, Einfügetext, Meldungen) als reine, ohne Tauri testbare Funktionen; gemeinsame Fehlergrund-Ableitung für Explorer und Terminal.
**Depends on:** --

### Acceptance Criteria

- **AC-1:** GIVEN Pane-Umgebung `{kind:"ssh"}` und eine Zwischenablage nur mit Bild
  WHEN die Einfüge-Entscheidung für Cmd+V berechnet wird
  THEN ist das Ergebnis `upload`
  AND bei Bild plus nicht leerem Text ist es `text`, bei nur Text `text`
  AND bei Umgebung `local` oder `wsl` ist es mit und ohne Bild das heutige Einfügen (kein `upload`)
  [Source: BR-1, BR-2, EP-6, TG-1]

- **AC-2:** GIVEN die Ortszeit 2026-11-20 09:05:07
  WHEN der Dateiname für ein Zwischenablage-Bild gebildet wird
  THEN lautet er `clipboard-20261120-090507.png`
  [Source: DF-1]

- **AC-3:** GIVEN eine Ablage aus `a.png` (104857600 Bytes), Ordner `fotos`, `big.mov` (104857601 Bytes), `b.pdf` (10 Bytes)
  WHEN die Ablage vor der Übertragung geprüft wird
  THEN sind zum Hochladen genau `a.png`, `b.pdf` in dieser Reihenfolge vorgesehen
  AND die Meldungen lauten `big.mov is larger than 100 MB and was not uploaded.` und `Folders can't be uploaded to a terminal. Use the explorer.`
  [Source: BR-5, DF-3, EP-1, EP-4]

- **AC-4:** GIVEN die Server-Pfade `/home/u/.terax/uploads/a.png` und `/home/u/.terax/uploads/my shot.png` in Ablage-Reihenfolge, Client-Betriebssystem Windows
  WHEN der Einfügetext für das SSH-Terminal gebildet wird
  THEN lautet er genau `/home/u/.terax/uploads/a.png '/home/u/.terax/uploads/my shot.png' ` (POSIX-Anführung, ein Leerzeichen am Ende, eine Einfügung)
  AND das Anführen lokaler Pfade bleibt wie heute (bestehende Tests von `quoteShellPath` bleiben grün)
  [Source: FL-2, FL-4, BR-3, BR-4]

- **AC-5:** GIVEN Pane 7 mit laufendem Upload von 1 Datei und Pane 8 ohne Upload
  WHEN in Pane 7 zwei weitere Dateien eingereiht werden
  THEN liefert der Hinweistext für Pane 7 `Uploading 3 files...`, für Pane 8 keinen Hinweis
  AND bei genau 1 offener Datei lautet er `Uploading 1 file...`, bei 0 offenen ist der Hinweis verborgen
  AND die Pfade der ersten Auslösung werden vor denen der zweiten eingefügt
  [Source: ST-1, ST-2, TR-1, TR-2, TR-3, BR-7, UI-1, TG-3]

- **AC-6:** GIVEN ein Kopier-Ergebnis mit `created: [a.png]` und `failed: [b.png "Permission denied", c.zip maybePlaced]`
  WHEN es für das Terminal ausgewertet wird
  THEN wird nur der Pfad von `a.png` eingefügt
  AND der Toast lautet `Upload failed: b.png: Permission denied` mit Beschreibung `Not uploaded: b.png, c.zip`
  AND bei gesetztem `aborted: "connection lost"` lautet er `Upload failed: connection lost` (Abbruch vor Einzelfehler); ohne `created` wird nichts eingefügt
  [Source: EP-2, EP-3, UI-2]

- **AC-7:** GIVEN ein Pane, das vor dem Ende seines Uploads geschlossen wurde
  WHEN das Ergebnis eintrifft
  THEN ergibt die Auswertung weder Einfügetext noch Toast
  [Source: EP-5]

- **AC-8:** GIVEN die bestehenden Explorer-Fälle von `reportCopyFailures`
  WHEN Explorer und Terminal den Fehlergrund aus derselben gemeinsamen Funktion beziehen
  THEN bleiben die Explorer-Texte unverändert (z. B. `Could not copy 2 items`) und `clipboardPaste.test.ts` bleibt grün
  [Source: --]

### Deliverables

- [ ] `src/modules/terminal/lib/terminalUpload.ts` -- neu: Einfüge-Entscheidung, Bildname, Ablage-Prüfung, Warteschlange je Pane, Einfügetext, Terminal-Meldungen
- [ ] `src/modules/terminal/lib/quoteShellPath.ts` -- POSIX-Anführung unabhängig vom Client-Betriebssystem wählbar (Stolperstein 2)
- [ ] `src/lib/copyFailure.ts` -- neu: gemeinsame, reine Ableitung des Fehlergrunds aus einem Kopier-Ergebnis (Slop #3, consolidate)
- [ ] `src/modules/explorer/lib/clipboardPaste.ts` -- `reportCopyFailures` nutzt die gemeinsame Ableitung

---

## Slice 2: Upload-Ordner und Zwischenablage-Bild im Backend bereitstellen

**Goal:** Der Server-Upload-Ordner wird absolut aufgelöst, nur für das eigene Konto zugänglich angelegt und aufgeräumt; ein Bild aus der Mac-Zwischenablage wird als lokale PNG-Datei bereitgestellt, damit es denselben `fs_copy`-Weg nimmt (Slop #1). Kein eigener Upload- oder Byte-Schreibbefehl.
**Depends on:** --

### Acceptance Criteria

- **AC-1:** GIVEN ein Server-Konto mit Home `/home/u` ohne `~/.terax/uploads`
  WHEN der Upload-Ordner vorbereitet wird
  THEN existiert `/home/u/.terax/uploads` mit Modus `0700`
  AND der zurückgegebene Pfad ist `/home/u/.terax/uploads` (beginnt mit `/`, enthält kein `~`)
  [Source: BR-6]

- **AC-2:** GIVEN `/home/u/.terax/uploads` existiert mit Modus `0755` und einer 1 Tag alten Datei
  WHEN der Upload-Ordner vorbereitet wird
  THEN hat der Ordner Modus `0700` und die Datei ist unverändert vorhanden
  [Source: BR-6]

- **AC-3:** GIVEN im Upload-Ordner `alt.png` (8 Tage alt) und `neu.png` (6 Tage alt), außerdem `/home/u/.terax/alt.txt` und `/home/u/projekt/alt.txt` (je 8 Tage alt)
  WHEN der Upload-Ordner vorbereitet wird
  THEN ist nur `alt.png` gelöscht; die drei anderen Dateien bestehen
  AND der Aufruf gibt dazu keine Meldung zurück
  [Source: FL-5, BR-8, DF-4]

- **AC-4:** GIVEN ein Home, in dem `.terax` nicht angelegt werden darf
  WHEN der Upload-Ordner vorbereitet wird
  THEN endet der Aufruf mit einem Fehler, dessen Text den Grund des Servers enthält (z. B. `Permission denied`)
  [Source: EP-2]

- **AC-5:** GIVEN PNG-Bytes und der Name `clipboard-20261120-090507.png`
  WHEN das Bild als lokale Datei bereitgestellt wird (plattformneutraler Teil)
  THEN liegt in einem neu angelegten Terax-Temp-Ordner genau eine Datei dieses Namens mit identischen Bytes
  AND der zurückgegebene Pfad ist absolut und wird von der Sperrliste für Geheimnis-Pfade nicht abgelehnt
  [Source: DF-1, TG-1]

- **AC-6:** GIVEN ein Linux-Build
  WHEN der Befehl zum Lesen eines Zwischenablage-Bilds aufgerufen wird
  THEN endet er mit dem Fehler `clipboard image paste is only supported on macOS`
  [Source: --]

- **AC-7:** GIVEN auf dem Mac ein Screenshot in der Zwischenablage
  WHEN der Befehl zum Lesen eines Zwischenablage-Bilds aufgerufen wird
  THEN liefert er binnen 5 s den Pfad einer PNG-Datei mit diesem Bild
  AND bei einer Zwischenablage ohne Bild liefert er "kein Bild" ohne Datei
  [Source: TG-1, BR-2] [Pruefweg: QA]

### Deliverables

- [ ] `src-tauri/src/modules/ssh.rs` -- Upload-Ordner vorbereiten: absolut auflösen, `0700`, Aufräumen älter als 7 Tage nur in diesem Ordner (Stolpersteine 1, 3)
- [ ] `src-tauri/src/modules/fs/clipboard.rs` -- Befehl: Bild aus der Mac-Zwischenablage als lokale PNG bereitstellen (`#[cfg(target_os = "macos")]`, sonst Fehler)
- [ ] `src-tauri/src/lib.rs` -- die zwei neuen Befehle registrieren
- [ ] `src-tauri/Cargo.toml` -- nötige `objc2-app-kit`-Features für Bilddaten der Zwischenablage

---

## Slice 3: Upload an SSH-Terminals anbinden und Hinweis zeigen

**Goal:** Drop und Cmd+V in SSH-Terminals laden über `fs_copy` (`renameOnConflict: true`) in den Upload-Ordner und fügen den Server-Pfad ein; die Workspace-Art kommt aus der Session des Panes (Slop #2); Hinweis UI-1 je Pane.
**Depends on:** Slice 1, Slice 2

### Acceptance Criteria

- **AC-1:** GIVEN ein SSH-Workspace `devbox`, darin ein Pane aus einem einfachen neuen Tab (ohne eigene Umgebungsangabe gestartet)
  WHEN die Umgebung dieses Panes abgefragt wird, auch nachdem der aktive Workspace auf lokal gewechselt hat
  THEN lautet sie `{kind:"ssh", host:"devbox"}`; ein lokal gestartetes Pane liefert `{kind:"local"}`
  [Source: BR-1]

- **AC-2:** GIVEN Pane 7 hat 2 offene Uploads, Pane 8 keinen
  WHEN die Pane-Ansicht rendert
  THEN zeigt Pane 7 unten rechts genau ein Element `terminal-upload-hint` mit `Uploading 2 files...`, das keine Zeigerereignisse annimmt; Pane 8 zeigt keins
  [Source: UI-1, ST-2, TG-3]

- **AC-3:** GIVEN ein Upload endet, während sein Pane keinen Renderer-Slot hat
  WHEN der Einfügetext zugestellt wird
  THEN erreicht er die Eingabe dieses Panes trotzdem (kein stilles Verwerfen bei fehlendem Slot)
  [Source: BR-4]

- **AC-4:** GIVEN die vom Terax-Agenten angebotenen Werkzeuge
  WHEN die Werkzeugliste gebaut wird
  THEN ist ihre Namensliste gegenüber vorher unverändert und kein Werkzeug ruft `fs_copy`, die Ordner-Vorbereitung oder das Zwischenablage-Bild auf
  [Source: BR-9]

- **AC-5:** GIVEN ein SSH-Terminal mit Claude Code und ein Screenshot in der Zwischenablage
  WHEN der User Cmd+V drückt und weiter tippt
  THEN erscheint `Uploading 1 file...`, die Eingabe bleibt frei; danach verschwindet der Hinweis, Claude Code zeigt `[Image #1]` und der Upload-Ordner enthält `clipboard-JJJJMMTT-HHMMSS.png`
  [Source: FL-1, FL-2, TR-1, TR-2, TG-1] [Pruefweg: QA]

- **AC-6:** GIVEN ein SSH-Terminal, `shot.png` liegt schon im Upload-Ordner
  WHEN der User `shot.png` und `b.pdf` aus dem Finder darauf zieht
  THEN erscheint das Drop-Overlay wie heute, dann `Uploading 2 files...`; danach wird genau `'/home/u/.terax/uploads/shot copy.png' /home/u/.terax/uploads/b.pdf ` eingefügt, kein Mac-Pfad; das alte `shot.png` ist unverändert
  [Source: FL-3, FL-4, BR-3, DF-2, TG-2] [Pruefweg: QA]

- **AC-7:** GIVEN ein SSH-Terminal
  WHEN der User einen Ordner plus eine Datei, eine 101-MB-Datei, oder `~/.ssh/id_rsa` darauf zieht, oder die Verbindung während eines Uploads trennt
  THEN zeigt ein Toast den Text nach EP-4, EP-1 bzw. `Upload failed: {reason}`; nur gelungene Dateien werden eingefügt; der Hinweis verschwindet
  AND eine 100-MB-Datei wird vollständig hochgeladen und eingefügt (Stolperstein 4)
  [Source: EP-1, EP-2, EP-4, DF-3, UI-2] [Pruefweg: QA]

- **AC-8:** GIVEN ein lokales Terminal und ein SSH-Terminal, Zwischenablage mit Bild und Text
  WHEN der User im lokalen Terminal eine Datei zieht oder Cmd+V drückt, bzw. im SSH-Terminal Cmd+V drückt
  THEN wird lokal wie heute der Mac-Pfad bzw. der Text eingefügt; im SSH-Terminal der Text; in keinem Fall erscheint ein Hinweis oder entsteht eine Server-Datei
  [Source: BR-1, BR-2, EP-6] [Pruefweg: QA]

### Deliverables

- [ ] `src/modules/terminal/lib/useTerminalSession.ts` -- beim Start verwendete Umgebung an der Session halten, Abfrage je Pane neben `leafCwd` (Slop #2, consolidate)
- [ ] `src/modules/terminal/lib/uploadStore.ts` -- neu: Ablauf je Pane (Ordner vorbereiten, `fs_copy`, Einfügen, Toast) und offene Anzahl für UI-1 (Slop #1, consolidate)
- [ ] `src/modules/terminal/lib/useTerminalFileDrop.ts` -- SSH-Zweig beim Drop; lokal unverändert
- [ ] `src/modules/terminal/lib/rendererPool.ts` -- eigener Cmd+V-Einstieg für Bilder in SSH-Panes (Stolperstein 5); Zustellung ohne Slot (Stolperstein 6)
- [ ] `src/modules/terminal/PaneTreeView.tsx` -- Hinweis-Marke `terminal-upload-hint` je Pane

---

## Traceability

| IDs | Abdeckung |
|-----|-----------|
| FL-1, FL-2, FL-3, FL-4, FL-5 | S1 AC-4; S2 AC-3; S3 AC-5, AC-6 |
| EP-1, EP-2, EP-3, EP-4, EP-5, EP-6 | S1 AC-1, AC-3, AC-6, AC-7; S2 AC-4; S3 AC-7, AC-8 |
| UI-1, UI-2 | S1 AC-5, AC-6; S3 AC-2, AC-7 |
| ST-1, ST-2, TR-1, TR-2, TR-3 | S1 AC-5; S3 AC-2, AC-5 |
| BR-1 bis BR-9 | S1 AC-1, AC-3, AC-4, AC-5; S2 AC-1, AC-2, AC-3; S3 AC-1, AC-3, AC-4, AC-8 |
| DF-1, DF-2, DF-3, DF-4 | S1 AC-2, AC-3; S2 AC-3, AC-5; S3 AC-6, AC-7 |
| TG-1, TG-2, TG-3 | S1 AC-1, AC-5; S2 AC-5, AC-7; S3 AC-2, AC-5, AC-6 |
| Slop #1, #2, #3 (consolidate) | S2 Goal, S3 AC-7 und Deliverables; S3 AC-1; S1 AC-8 |
| FL-6 bis FL-14, EP-7 bis EP-11, UI-3 bis UI-10, ST-3 bis ST-8, TR-4 bis TR-13, TR-16, BR-10 bis BR-19, DF-5 bis DF-7, TG-4 bis TG-11 | nach Merge (Welle 2) |
| FL-15 bis FL-18, EP-12, EP-13, UI-11 bis UI-13, ST-9, TR-14, TR-15, BR-20 bis BR-24, DF-8, TG-12, TG-13 | nach Merge (Welle 3) |
