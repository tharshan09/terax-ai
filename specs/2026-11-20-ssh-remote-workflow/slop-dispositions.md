# Slop-Dispositionen: Welle 1 (Upload in SSH-Terminals)

Vor-Scan vom 2026-11-20, drei Funde, alle vom PM entschieden. Unterdrückt via Registry: 0 (keine Registry vorhanden).

| # | class | subject | sites | existing_owner | decision | Begründung | Folge (Deliverable) |
|---|-------|---------|-------|----------------|----------|------------|---------------------|
| 1 | k1_dual_mechanism | Lokale Datei auf einen SSH-Host hochladen | `src-tauri/src/modules/fs/copy.rs:73`, `:101`, `:181`, `:357`; `src-tauri/src/modules/ssh.rs:1694`, `:1813`; `src/modules/explorer/lib/useExplorerFileDrop.ts:79`; `src/modules/explorer/lib/clipboardPaste.ts:171`; `src/modules/terminal/lib/useTerminalFileDrop.ts:49` | Tauri-Befehl `fs_copy` mit SSH-Zweig `ssh::copy` | consolidate | Der bestehende Weg prüft die Quelle gegen die Sperrliste für Geheimnis-Pfade, stellt ohne Überschreiben bereit und liefert je Datei ein Ergebnis. Ein zweiter Weg hätte diese Sicherungen nicht. | Terminal-Uploads (Drop und Zwischenablage-Bild) laufen über `fs_copy` mit `renameOnConflict: true`. Das Zwischenablage-Bild wird als lokale Datei durch denselben Weg geschickt. Kein zweiter Upload-Befehl, kein eigener Byte-Schreibweg. Eine gesperrte Quelle (z. B. `~/.ssh/id_rsa`) wird mit Meldung abgelehnt. |
| 2 | k4_pattern_fork | Workspace-Art (lokal, WSL, SSH) eines Terminal-Panes bestimmen | `src/modules/workspace/env.ts:49`; `src/modules/terminal/lib/pty-bridge.ts:51`; `src/modules/terminal/lib/useTerminalSession.ts:78`; `src/modules/tabs/lib/useTabs.ts:46`, `:277`, `:766` | Drei Quellen, keine verbindlich | consolidate | BR-1 braucht je Pane eine verlässliche Angabe. Bei einem einfachen neuen Tab in einem SSH-Workspace ist die Angabe an der Session leer, obwohl der Prozess per SSH läuft. | Die beim Start des Terminals tatsächlich verwendete Umgebung wird an der Session festgehalten; eine Abfrage je Pane (neben der bestehenden cwd-Abfrage) ist die einzige Quelle, die Welle 1 liest. Die übrigen Nutzungsstellen der globalen Umgebung bleiben unverändert. Keine Lint-Regel in diesem Lauf. |
| 3 | k2_knowledge_copy | Auswertung eines Kopier-Ergebnisses (`created`, `failed`, `aborted`, `maybePlaced`) zu Meldungen | `src/modules/explorer/lib/clipboardPaste.ts:111`, `:119`; `src/modules/explorer/lib/useExplorerFileDrop.ts:86` | `reportCopyFailures` im Explorer | consolidate | Die Vorrang-Regel (Verbindungsabbruch vor Einzelfehler, `maybePlaced` gesondert) steht nur im Explorer. Eine zweite Auswertung würde sie verlieren. | Die Ableitung des Fehlergrunds wird eine gemeinsame, reine Funktion, die Explorer und Terminal nutzen. Die Terminal-Texte bleiben die aus der Discovery (EP-1 bis EP-4). Bestehende Explorer-Tests bleiben grün. |

## Stolpersteine aus dem Vor-Scan (keine Slop-Klasse, Eingabe für ACs und Implementierung)

| # | Thema | Befund | Stelle |
|---|-------|--------|--------|
| 1 | Pfade mit `~` | `ssh::copy` gibt den Zielpfad so zurück, wie der Zielordner übergeben wurde. Ein `~/...`-Pfad würde beim Einfügen in Anführungszeichen gesetzt und von der Shell nicht mehr aufgelöst. Der Zielordner muss vorher absolut gemacht werden. | `copy.rs:135`, `quoteShellPath.ts:5`, `ssh.rs:1349` |
| 2 | Anführungsstil | `quoteShellPath` wählt den Stil nach dem Client-Betriebssystem. Für SSH-Terminals ist der Server immer POSIX. | `quoteShellPath.ts:9` |
| 3 | Rechte (BR-6) | Der Upload übernimmt die Rechte der Quelldatei. Zugriff nur für das eigene Konto muss über den Ordner kommen (0700). | `ssh.rs:1599`, `ssh.rs:436-448` |
| 4 | Große Dateien | Der Upload liest die ganze Datei in den Speicher und schickt sie in einer Anfrage; das Zeitbudget skaliert mit 64 KiB/s. Für 100 MB zu prüfen. | `ssh.rs:1639-1640`, `ssh.rs:840` |
| 5 | Cmd+V auf macOS | Terax behandelt die Taste dort nicht selbst; xterm verarbeitet das Paste-Ereignis. Der Bild-Upload braucht einen eigenen Einstieg. `fs_clipboard_paths` liest nur Datei-Verweise, keine Bilddaten. | `rendererPool.ts:355`, `:381-386`; `fs/clipboard.rs:9-11` |
| 6 | Einfügen nach dem Upload (BR-4, EP-5) | `pasteIntoLeaf` gibt `false` zurück, wenn das Pane gerade keinen Renderer-Slot hat (verstecktes, untätiges Pane). Ein Upload, der im Hintergrund endet, darf den Pfad nicht stillschweigend verlieren. | `rendererPool.ts:178-183`, TERAX.md Abschnitt terminal |
| 7 | BR-9 | `fs_copy` gehört nicht zu den Werkzeugen des Terax-Agenten. Welle 1 gibt keinen Upload-Befehl als Agent-Werkzeug frei. | TERAX.md Abschnitt AI Tools |
| 8 | Bestand, nicht anfassen | Die Umrechnung der Pixeldichte beim Treffer-Test steht doppelt in Terminal- und Explorer-Drop. Bestehende Doppelung, nicht Teil dieses Laufs. | `useTerminalFileDrop.ts:9-22`, `useExplorerFileDrop.ts:25-37` |

## Bestätigung des Ist-Zustands

Aus dem Code bestätigt (nicht in der App nachgestellt): `useTerminalFileDrop.ts:44-50` ruft beim Drop `pasteIntoLeaf(leafId, formatDroppedPaths(p.paths))` mit den lokalen Pfaden auf und prüft weder Workspace noch Session. In SSH-Terminals landet heute der Mac-Pfad.
