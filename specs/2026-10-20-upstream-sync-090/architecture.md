# Feature: Upstream-Sync Runde 4 (crynta v0.9.0, ohne Ghostty)

**Epic:** –
**Status:** Ready
**Discovery:** `discovery.md` (same folder)
**Derived from:** Discovery constraints, NFRs, and risks

---

## Problem & Solution

> No requirement IDs — context

**Problem:**
- Upstream v0.9.0 bringt 122 neue Commits; Kern ist der Austausch von xterm.js durch ein Ghostty-Terminal (WASM + WebGPU) mit neuem PTY-Transport.
- Genau diese Schicht trägt ~5,5k Zeilen Fork-Anpassungen (tmux pro Pane, SSH-Reconnect, Cmd+Klick-Pfade, OSC-52-Policy, Pane-Dimmen, Renderer-Pool); Ghostty wäre ein Neuaufbau in 5-7 Wellen mit 105 Konfliktdateien.
- Ghostty ist upstream auf macOS unreif (#1372, #1365, #1364, #1362) und verliert in WebKit ab dem 9. Terminal den schnellen WASM-Speicher; der User arbeitet mit >10 Claude-Code-Sessions.
- Daneben enthält 0.9.0 eigenständige Verbesserungen: offene SSRF-Lücke im AI-HTTP-Proxy, ⌘S-Zuverlässigkeit, Media-Previews, Einfügen aus dem Finder, Leerlauf- und Start-Perf.

**Solution:**
- Ghostty mit Wiedervorlage-Kriterien parken (BR-14).
- Eine Sync-Welle mit Kern-Picks, Finder-Einfügen (lokal + SSH, Finder-Benennung) und vier Perf-Stücken in Fork-tauglicher Variante; Version 0.8.7.

**Business Value:**
- Sicherheitslücke geschlossen (SSRF über IPv6-verpackte Loopback-/Metadaten-Adressen).
- Weniger Leerlauf-CPU und schnellerer Start bei vielen parallelen Agent-Sessions.
- Dateien aus dem Finder per ⌘V in den Workspace, auch remote.
- Fork bleibt auf dem bewährten Terminal, bis Ghostty reif ist.

---

## Scope & Boundaries

> No requirement IDs — context

| In Scope |
|----------|
| Clean Picks: `f885631` (grep-matcher raus), `d3c8fd7` (Inline-Code-Schrift Markdown), `e8f9fcd` (CI-Checkout ohne gespeicherte Credentials, HEAD-Seite behalten) |
| SSRF-Härtung aus `11343a1`, nur der `net/ip.rs`-Teil |
| ⌘S auf App-Ebene (`4cfc202`, Handarbeit) |
| Media-Previews pausieren und ausblenden (`5502f82`, Handarbeit) |
| Dateien aus der OS-Zwischenablage in den Explorer einfügen (`2723dc6`, Handarbeit), lokal und SSH |
| Finder-Benennung bei Namensgleichheit für Einfügen UND bestehenden Finder-Drop |
| Perf aus `f6f0004`: Animationen pausieren (Fork-Variante), Explorer-Watcher nur bei sichtbarem Explorer, `git status` nur für sichtbare Konsumenten, Lazy-Start (AI-SDK, Editor, Icon-Set) mit Build-Budget-Test |
| Test-Commits: `d766567` (iconResolver), `258d119` (applyTheme), `13ded38` (customThemes) |
| Deps auf v0.9.0-Niveau regenerieren (u.a. tauri 2.12, react 19.3, vite 8.3, `dirs` 6→7) |
| Nachtrag 27.10.: `bf7e03d` (JS/TS-Syntax-Hervorhebung nach Deps-Update wiederherstellen, Handarbeit) als Teil von Slice 7 (BR-20) |
| Version 0.8.7 |
| Architektur-Zusatz: zentraler Fenster-Sichtbarkeits-Zustand ersetzt die gleichbedeutenden Einzelkopien (Anti-Slop #1, Q&A #2) |
| Architektur-Zusatz: aus `0a6e511` nur der Hunk „IPv6-Klammern vor dem IP-Parse entfernen“ an `net.rs:90` (Auflösung, aus `0a6e511` `net.rs:97`) und `net.rs:281` (Redirect-Prüfung, Portierung aus Upstream `net/clients.rs:157`), damit die SSRF-Härtung geklammerte IPv6-Literale überhaupt sieht (Q&A #26) |

| Out of Scope |
|--------------|
| Ghostty-Terminal, WebGPU/WebGL-Renderer, PTY-Transport v2 (`0a6e511` außer dem Klammer-Hunk aus Q&A #26, `ddd42a9`, `d2b5f87`, `8463539`, PTY-Teil von `11343a1`), geparkt nach BR-14 |
| Ghostty-Folgefixes: `86a230b`, `c8affd4`, `478ac27`, `5507dfb`, `a30b0fa`, `c69b07e`, `0d9937f` |
| AI-Teile: `f99105d`, `ai_sessions.rs`, AI-Teil von `f6f0004` (content-visibility im Chat) |
| Settings-Webview schließen statt verstecken, Vibrancy-Default aus (`f6f0004`) |
| `fd21291`, `39fa919` (hängen am Watcher-/Index-Umbau aus `0a6e511`), `ff20d93` (natives Text-Clipboard) |
| `e09c030`, `a52d03a`, Windows/Linux-Fixes (`a9c8a92`, `8e013b0`, `c510c96`, `d0b569c`, `815a53b`) |
| Offene Upstream-PRs #1368, #1369, #1370, #1367, #1371 |
| Explorer-Mehrfachauswahl, CLI Control Plane, Nested Git, UI-Redesign |
| Finder-Einfügen von Text/Bildern (nur Dateien und Ordner) |
| Architektur-Zusatz: `reqwest` 0.12→0.13 (kam upstream mit `0a6e511`, Q&A #14); Einfügen aus der Zwischenablage unter Linux/Windows (Q&A #11) |

---

## API Design

### Overview

> No requirement IDs — context

| Aspect | Specification |
|--------|---------------|
| Style | Custom: Tauri-IPC (`invoke` mit JSON-Argumenten, Commands in `src-tauri/src/lib.rs` registriert) plus SSH-Helper-Protokoll (JSON-Request über stdin an das eingebettete `python3`-Programm, `ssh.rs:205-211`; Op-Tabelle `OPS` `ssh.rs:556-561`, Antwort mit Sentinel `__TERAX_JSON__` `ssh.rs:573`) |
| Authentication | Keine Nutzer-Auth. IPC nur aus der eigenen App-WebView. Lokale Schreibziele über die Workspace-Autorisierungs-Registry (`authorize_mutation_dir`, `mutate.rs:234`); SSH: die bestehende Host-Verbindung (ControlMaster) ist die Capability (trust-the-host-account, TERAX.md) |
| Rate Limiting | Kein Zeitfenster-Limit (lokale Desktop-App). Stattdessen: ein Einfügen pro Explorer gleichzeitig (ST-2, SEC-6) und begrenzte Batch-Größe/Ordnertiefe je `fs_copy`-Aufruf (VAL-5) |

### Endpoints

| ID | Method | Path | Request | Response | Auth | Business Logic |
|----|--------|------|---------|----------|------|----------------|
| API-1 | IPC (neu, async) | `fs_clipboard_paths` | `{}` | `string[]` (absolute Pfade, Vorwärts-Slash-Form) | App-WebView | Liest auf dem Main-Thread die Datei-URLs der allgemeinen Zwischenablage (NSPasteboard), löst Finder-Dateireferenz-URLs zu echten Pfaden auf, ignoriert Einträge ohne Datei-URL (DF-1, VAL-6). Leer → `[]` (EP-1). Wartet begrenzt auf den Main-Thread, Überschreitung → Fehler `clipboard read timed out or was cancelled` (EP-3). Andere Plattformen → Fehler `clipboard file paste is only supported on macOS` (Q&A #11) |
| API-2 | IPC (geändert: sync → async) | `fs_copy` | `CopyRequest` | `CopyResult` | App-WebView + Ziel-Jail (lokal) | Kopiert jede Quelle einzeln in `destDir` (BR-4); Namenskonflikt → Finder-Name (BR-1, `renameOnConflict`); jedes Element erscheint erst vollständig (BR-3); Fehler je Element in `failed`, Erfolge in `created` (DF-2). Fehler des ganzen Aufrufs (Ziel nicht freigegeben, kein Ordner, Batch zu groß, SSH weg) → Rejection mit Text (EP-3). `WorkspaceEnv::Ssh` → SVC-3. Läuft außerhalb des Main-Threads (Q&A #9) |
| API-3 | SSH-Helper-Op (neu) | `publish` | `{op:"publish", from, to}` | `true` oder Fehler `already exists: {to}` | bestehende SSH-Verbindung | Verschiebt ein fertiges Staging-Element nach `to`, ohne ein bestehendes Element zu ersetzen: Ordner über exklusive Reservierung des Zielnamens und atomaren Tausch gegen die leere Reservierung, Dateien über exklusives Verlinken plus Entfernen des Staging-Namens; ohne Hardlink-Unterstützung Rückfall auf Prüfen-dann-Umbenennen (Restfenster benannt, Q&A #7) |
| API-4 | IPC (Signatur unverändert) | `ai_http_request`, `ai_http_stream`, `lm_ping` | unverändert | unverändert; Fehler `host not allowed: {host}` bzw. Opt-in-Fehler für private Ziele | App-WebView | Vor dem IP-Parse werden IPv6-Klammern vom Host entfernt (`Url::host_str` behält sie), an beiden Stellen: Auflösung (`net.rs:90`) und Redirect-Prüfung (`net.rs:281`). Danach werden Ziel-Adressen nach VAL-8 klassifiziert, bei der Auflösung (`net.rs:88-117`) und beim Verbindungs-Pinning (`net.rs:158-163`) und bei der Redirect-Prüfung (`net.rs:281-289`, künftig `redirect_decision`, MIG-5); Metadaten bleiben auch mit Opt-in gesperrt (BR-16). Folge: IPv6-Literal-URLs wie `http://[::1]:11434` werden klassifiziert (mit Opt-in erreichbar, Metadaten gesperrt) statt wie heute mit DNS-Fehler abgewiesen (Q&A #26) |

### Data Transfer Objects (DTOs)

> No requirement IDs — covered via API-n

| DTO | Fields | Validation | Notes |
|-----|--------|------------|-------|
| `CopyRequest` | `sources: string[]`, `destDir: string`, `workspace?: WorkspaceEnv`, `renameOnConflict?: boolean` | VAL-1, VAL-2, VAL-5; `renameOnConflict` fehlt → `false` (bisheriges Verweigern) | Drop und Einfügen setzen `true` (BR-2). Pfade als unbegrenzter String: alle bestehenden fs-Commands nehmen `String` (`mutate.rs:207-212`); feste Längen wären falsch (macOS `PATH_MAX` 1024, Linux-Host 4096) |
| `CopyResult` | `created: string[]`, `failed: CopyFailure[]` | `created.length + failed.length` = Zahl der Quellen | `created` in Frontend-Form `destDir/{finalName}` (Vorwärts-Slash, TERAX.md UI conventions), speist UI-6; `failed` speist UI-4 (DF-2) |
| `CopyFailure` | `source: string`, `message: string` | `message` ist der Fehlertext des Elements (z.B. `cannot copy a folder into itself`, `no free copy name`) | Unbegrenzte Strings: OS- und SSH-Fehlertexte haben keine feste Länge (`ssh.rs:570` reicht `str(ex)` durch) |
| `WorkspaceEnv` | bestehend: `{kind:"local"}` / `{kind:"ssh", host}` | bestehend | unverändert, `src-tauri/src/modules/workspace.rs` |
| `PublishRequest` (Helper) | `op: "publish"`, `from: string`, `to: string` | `from` existiert, `to` existiert nicht | nur von SVC-3 erzeugt, nie aus dem Frontend |

---

## Database Schema

> No requirement IDs — context

### Entities

| ID | Table | Purpose | Key Fields |
|----|-------|---------|------------|
| – | N/A (keine Datenbank) | Terax hat keine Datenbank; dieses Feature legt keine neuen persistenten Daten und keine Formatänderung an. Berührte persistente Zustände folgen in den nächsten Zeilen | – |
| – | `localStorage` `terax.sidebar.collapsed` | bestehend; wird beim Mount gelesen (`useSidebarPanel.ts`, `readSidebarCollapsed`) und zusätzlich als React-Zustand gespiegelt (SVC-10, MIG-42); Format `"1"`/`"0"` unverändert | Schlüssel unverändert |
| – | Spaces-Store (`@tauri-apps/plugin-store` `LazyStore`, `spaces/lib/store.ts`) | bestehend; Format unverändert, nur der Schreib-Auslöser „Fenster wird unsichtbar“ kommt künftig aus SVC-7 (MIG-38) | Inhalt und Schlüssel unverändert |
| – | gelesene Präferenzen `showHidden`, `explorerGitDecorations`, `statusbarLayout` (`settings/store.ts`) und Zen-Modus (React-Zustand in `App.tsx`) | nur gelesen für SVC-11 und das Ausblenden des Staging-Ordners (MIG-73), keine Formatänderung | – |

### Schema Details

| Table | Column | Type | Constraints | Index |
|-------|--------|------|-------------|-------|
| N/A | – | – | – | – |

### Relationships

| From | To | Relationship | Cascade |
|------|-----|--------------|---------|
| N/A | – | – | – |

---

## Server Logic

### Services & Processing

| ID | Service | Responsibility | Input | Output | Side Effects |
|----|---------|----------------|-------|--------|--------------|
| SVC-1 | Kopier-Kern lokal (`src-tauri/src/modules/fs/copy.rs`, neu; dünne Command-Hülle `fs_copy` + reine `_impl`-/Batch-Funktionen nach Muster P1) | Batch kopieren: je Element Quelle prüfen (VAL-1, VAL-3, VAL-9), in ein verstecktes Staging-Verzeichnis im Zielordner kopieren, dann ohne Ersetzen unter dem ersten freien Namen veröffentlichen (VAL-4); Symlinks als Symlinks (BR-21) | `CopyRequest` | `CopyResult` | Dateien/Ordner im Ziel; Staging wird bei Fehler entfernt; `log::warn!` mit Quelle/Ziel je Fehler (Konvention `mutate.rs:248`) |
| SVC-2 | Kopier-Benennung (`copy_name`, rein, in `copy.rs`) | Einzige Quelle der Finder-Benennung nach BR-1: Zähler 1 → ` copy`, n → ` copy n`; nur letzte Endung zählt; ohne Endung, Dotfile und Ordner ohne Endungslogik; Kandidaten-Folge bis DF-3 | Name, Zähler, Ordner ja/nein | Kandidaten-Name | keine (rein); genutzt von SVC-1 UND SVC-3 (Anti-Slop #3) |
| SVC-3 | SSH-Upload mit Staging (`ssh::copy`, `ssh.rs:1202`, erweitert) | Je Element: verstecktes Staging-Verzeichnis im Remote-Zielordner anlegen, rekursiv hineinladen (bestehendes `upload_recursive`), Zielnamen-Kandidaten aus SVC-2 nach einmaligem Lesen des Zielordners vorfiltern, über API-3 ohne Ersetzen veröffentlichen, bei Kollision nächster Kandidat; Staging am Ende entfernen | Host, Quellen, Zielordner, `renameOnConflict` | `CopyResult` | Remote-Dateien; je Element mehrere Helper-Aufrufe über den ControlMaster; Staging-Rest bei Verbindungsabbruch möglich (Q&A #7) |
| SVC-4 | Zwischenablage-Leser (`src-tauri/src/modules/fs/clipboard.rs`, neu) | macOS: Datei-URLs aller Pasteboard-Items lesen, Dateireferenz-URLs auflösen, in kanonische Form bringen; Lesekern nimmt das Pasteboard als Parameter (testbar mit privatem Pasteboard); Command-Hülle springt auf den Main-Thread wie `clipboard_write_text` (`lib.rs:132-158`) und wartet begrenzt | – | `string[]` | keine (nur lesen, nur auf User-Aktion) |
| SVC-5 | Einfüge-Ablauf (`src/modules/explorer/lib/clipboardPaste.ts`, neu, nach Upstream-Vorlage) | Reine Funktionen: Zielordner nach BR-5 (`pasteTargetDir`), ⌘V-Erkennung (VAL-7), Fehler-Toast (UI-4); Ablauf: API-1 → leer → UI-3; sonst API-2 mit `renameOnConflict` → UI-4 bei Teilfehlern → Zielordner neu einlesen → `created` zurück, nur wenn Workspace/Wurzel unverändert (EP-4) | Zielordner, Wurzel, `WorkspaceEnv`, `isCurrent`, `refresh` | `string[]` (angelegte Pfade) | Toasts UI-3/UI-4/UI-5; Neu-Einlesen des Zielordners auch nach Gesamtfehler, wenn schon kopiert wurde (EP-3) |
| SVC-6 | Explorer-Integration (`FileExplorer.tsx`, `useExplorerFileDrop.ts`) | Kontextmenü-Eintrag `Paste` (UI-1) und ⌘V (UI-2) mit Busy-Sperre (ST-2) und Ziel nach BR-5; nach Erfolg Zielordner aufklappen und erstes neu angelegtes Element auswählen + in Sicht scrollen (UI-6, Q&A #4); Drop ruft API-2 mit `renameOnConflict` und zeigt Teilfehler über UI-4 (UI-7), Gesamtfehler weiter `Copy failed: {error}` | User-Aktion | – | Auswahl-Zustand, Aufklapp-Zustand, Toasts |
| SVC-7 | Fenster-Sichtbarkeit (`src/lib/windowVisibility.ts`, neu, Owner) | Einziger App-Zustand „Fenster unsichtbar" aus `document.visibilityState` (minimiert, vollständig verdeckt, anderer Space; Fokus zählt nicht, BR-9); Getter, Abo, React-Hook (`useSyncExternalStore`), Attribut `data-window-hidden` am `html`-Element; einmal in `src/main.tsx` installiert | `visibilitychange` | `boolean` + Attribut | Attribut am `html`-Element; Benachrichtigung der Abonnenten bei jedem Wechsel |
| SVC-8 | Media-Wiedergabe-Bindung (`src/modules/editor/lib/mediaPlayback.ts` + `MediaPreview.tsx`, neu) | Video/Audio: Tab inaktiv → pausieren + ausblenden; Fenster unsichtbar → pausieren; solange einer der Zustände gilt, wird jedes Play sofort pausiert; Rückkehr startet nie selbst (BR-12). Klassifikation bleibt `binaryPreviewMode` (`binaryPreview.ts`, REUSE) | Medien-Element, `tabVisible`, `windowHidden` | – | `pause()` am Element, Klasse `hidden` nur bei inaktivem Tab |
| SVC-9 | Bewegungs-Regeln (CSS in `src/styles/globals.css`) | Endlos-Animationen (Spinner, Pulse, Shimmer, Blinken) in Stufen (BR-10); alle CSS-Animationen pausieren unter `html[data-window-hidden]` (BR-9); `prefers-reduced-motion` unverändert | Attribut aus SVC-7 | – | weniger Compositor-Frames; Animationen setzen beim Sichtbarwerden an der Stelle fort |
| SVC-10 | Explorer-Watcher-Registry (`src/modules/explorer/lib/watchRegistry.ts`, neu, Upstream-Vorlage; `useFileTree.ts` erweitert) | Gewünschte Ordner-Menge getrennt von nativer Registrierung: unsichtbar → alle nativen Watches des Explorers freigeben, Menge merken; sichtbar → genau die aktuelle Menge registrieren und alle geladenen Ordner neu einlesen (BR-11). Sichtbar = Sidebar-Ansicht `explorer` UND Sidebar nicht eingeklappt (neuer gespiegelter Zustand `sidebarCollapsed` in `useSidebarPanel.ts`, Q&A #6) | `visible` | – | `fs_watch_add`/`fs_watch_remove` (Rust-Refcount, Editor-Watches bleiben, INV-13); Neu-Einlesen beim Wieder-Sichtbarwerden |
| SVC-11 | Git-Status-Konsumenten (`src/modules/source-control/statusConsumers.ts`, neu; `useSourceControlContext.ts`, `useSourceControl.ts` erweitert) | Reine Ableitung „live": Source-Control-Panel sichtbar, aktiver Git-Tab, Explorer sichtbar mit Git-Farben, Rail-Badge sichtbar (= Sidebar offen), Statusleiste eingeblendet (kein Zen-Modus) mit mindestens einem sichtbaren Git-Widget (`git-branch`, `git-sync`, `git-changes`, `git-staged`, `line-changes`; Liste als Konstante in `statusbar/layout.ts`) (BR-13, Q&A #5). Nicht live → keine automatischen Auffrischungen (Fokus, Kontextwechsel); Übergang zu live → genau eine Auffrischung | Sidebar-Ansicht, eingeklappt, aktiver Tab-Typ, Präferenz Git-Farben, Statusleisten-Layout, Zen-Modus | `live: boolean` | weniger `git status`-Aufrufe; Git-Graph-Kontext vertraut nur einem live gehaltenen Snapshot (Upstream-Muster) |
| SVC-12 | Editor-Speichern auf App-Ebene | Shortcut `editor.save` (Mod+S) in der Registry; Handler ruft `save()` am Handle des aktiven Editor-Tabs, das den bestehenden Speicherweg (`saveRef`, `EditorPane.tsx:142`) nutzt; nur aktiv, wenn der aktive Tab ein Editor ist (wie `editor.undo`) (BR-17, Q&A #20) | Tastendruck | – | Datei geschrieben, `onSaved` wie bisher |
| SVC-13 | IP-Klassifikation (`src-tauri/src/modules/net/ip.rs`, neu: Upstream `11343a1` plus Fork-Erweiterung) | Rein, ohne I/O: IPv4-Klassen wie heute plus Dokumentations-/Reservebereiche; IPv6 mit eingebetteter IPv4 nach der IPv4 klassifiziert, gefährlichste Klasse gewinnt; außerhalb Global Unicast → privat (BR-16, VAL-8). Fork-Erweiterung, ausdrückliche Abweichung von Upstream: auch im Local-Use-NAT64-Präfix `64:ff9b:1::/48` wird die eingebettete IPv4 ausgewertet, und zwar an den RFC-6052-Positionen aller Prefix-Längen, die in den /48-Block passen (48, 56, 64, 96), jeweils unter Überspringen des u-Oktetts (Bits 64-71); es gilt das Maximum aus Private und allen Kandidaten-Klassen, nie Public (Upstream `ip.rs:77-83` kehrt im Kandidatenzweig ohne die Untergrenze aus `:89` zurück, die Fork-Erweiterung setzt sie). Upstream erkennt eingebettete IPv4 nur in `64:ff9b::/96` und stuft `64:ff9b:1::/48` pauschal als privat ein, was mit Opt-in Metadaten-Ziele durchließe (Q&A #27) | `IpAddr` | `IpKind` | keine; alte Funktion in `net.rs` entfällt (Anti-Slop #2) |
| SVC-14 | Icon-Set nachladen (`iconResolver.ts` umgebaut, `iconEngine.ts` + `FileIcon.tsx` neu, Upstream-Vorlage `f6f0004`) | Icon-Daten (`@iconify-json/catppuccin`, `fileIcons.ts`, `folderIcons.ts`) nur per dynamischem `import()` beim ersten Bedarf; bis dahin neutraler Platzhalter, danach Icon mit kurzem Einblenden; Zuordnung Name/Endung → Icon unverändert (INV-20); alle 8 Aufrufer über `FileIcon` (BR-18) | Datei-/Ordnername, aufgeklappt | Icon oder Platzhalter | ein zusätzlicher Chunk-Abruf beim ersten Rendern eines Icons |
| SVC-15 | Build-Budget (`src/app/dist-budget.test.ts`, `scripts/dist-graph.mjs` + `.d.mts`, neu, Upstream-Vorlage) | Baut einmal mit Sourcemaps in ein Temp-Verzeichnis; prüft für beide Fenster den GEBAUTEN Startgraphen (Entry-Skripte, statische Imports, `modulepreload`): kein `@ai-sdk/*`, `ai`, `zod`, `streamdown`, `@codemirror/*`, `@uiw/*`, keine Icon-Daten (`@iconify-json/catppuccin`, `fileIcons.ts`, `folderIcons.ts`); schwere Stacks per dynamischem Import erreichbar (BR-18); genau eine `@lezer/highlight`-Kopie im Build (BR-20). Heute ist das gebaute Startpaket NICHT frei vom AI-SDK (React landet über `manualChunks` in `ai-sdk-shared`, Q&A #29); grün wird der Test erst mit der Chunk-Strategie aus MIG-62 | `vite build` | Testergebnis | Build-Lauf im Test (Dauer, NFR-5) |
| SVC-16 | Deps + Version | Abhängigkeiten auf v0.9.0-Niveau (Integrations-Tabelle), `@lezer/highlight` über `catalog:` gepinnt und per Override vereinheitlicht, Version 0.8.7 in allen vier Quellen (BR-19, BR-20) | Manifeste | Lockfiles | `pnpm-lock.yaml`, `Cargo.lock` neu |
| SVC-17 | CI- und Kleinst-Picks | `persist-credentials: false` an allen vier Checkout-Stellen von `ci.yml`; `grep-matcher` entfernt; Inline-Code im Markdown erbt die Schriftgröße | – | – | keine Laufzeitwirkung außer Markdown-Darstellung |

### Business Logic Flow

> No requirement IDs — covered via SVC-n

```
⌘V / Paste (UI-1, UI-2) → VAL-7 + Busy-Sperre → SVC-5 pasteTargetDir (BR-5)
      → API-1 fs_clipboard_paths ──leer──> UI-3, Ende
      → API-2 fs_copy(renameOnConflict) → VAL-2 Ziel-Jail ──Fehler──> UI-5
            ├─ lokal: je Element VAL-1/3/9 → Staging → SVC-2 Kandidat → No-Replace-Publish
            └─ SSH:   je Element Staging remote → upload → SVC-2 Kandidat → API-3 publish
      → CopyResult → UI-4 (wenn failed) → Zielordner neu einlesen
      → isCurrent? ──nein──> keine Auswahl (EP-4)
      → Zielordner aufklappen + erstes created auswählen (UI-6)

Finder-Drop (UI-7) → dirAt (unverändert) → API-2 fs_copy(renameOnConflict) → UI-4 / Copy failed → Ordner neu einlesen

visibilitychange → SVC-7 → data-window-hidden ──> SVC-9 CSS-Pause
                                              └──> SVC-8 Media pausieren

Sidebar zu/auf, Ansicht, Tab, Zen, Layout → SVC-10 arm/disarm (+ Neu-Einlesen)
                                          → SVC-11 live? → einmal auffrischen / ruhen
```

### Validation Rules

| ID | Field | Rule | Error Message |
|----|-------|------|---------------|
| VAL-1 | `CopyRequest.sources[i]` | Absoluter Pfad mit Dateinamen; sonst scheitert nur dieses Element. Nachweis: Rust-Test je Fall | `copy source must be absolute` / `copy source has no filename` |
| VAL-2 | `CopyRequest.destDir` | Lokal: innerhalb einer freigegebenen Workspace-Wurzel (bestehender Jail `authorize_mutation_dir`) und ein Ordner; SSH: Ordner auf dem Host (trust-the-host). Verstoß lässt den ganzen Aufruf scheitern (EP-3). Nachweis: bestehender Test `copy_rejects_unauthorized_dest` bleibt grün | bestehender Jail-Text; `copy destination is not a directory` |
| VAL-3 | Ordner-Quelle lokal | Liegt das kanonische Ziel in der kanonischen Quelle oder ist es die Quelle selbst, scheitert dieses Element (BR-7). SSH: entfällt, Quelle lokal und Ziel auf dem Host können nicht ineinander liegen. Nachweis: Rust-Test Ordner in sich selbst und in eigenen Unterordner | `cannot copy a folder into itself` |
| VAL-4 | Zielname | Erster freier Kandidat aus SVC-2; nach Erschöpfung des Zählerbereichs aus DF-3 scheitert das Element. Nachweis: Rust-Test der Kandidatenfolge und Grenzfall | `no free copy name` |
| VAL-5 | Batch-Umfang | Zahl der Quellen je Aufruf und Ordnertiefe je Element sind begrenzt (Grenzwerte wie Upstream `copy.rs`, Festlegung über die Gate-1-Auflagen); zu viele Quellen → ganzer Aufruf scheitert, zu tief → nur das Element. Nachweis: Rust-Test an beiden Grenzen | `copy at most {N} items at a time` / `folder nesting exceeds the copy limit` |
| VAL-6 | Zwischenablage-Einträge | Nur Einträge mit Datei-URL zählen; Dateireferenz-URLs werden zu echten Pfaden aufgelöst; leere oder nicht auflösbare Einträge werden übersprungen (DF-1). Nachweis: Rust-Test mit privatem Pasteboard (Datei, Ordner, Text-Eintrag, leer) | – (Ergebnis `[]` → UI-3) |
| VAL-7 | ⌘V im Explorer | Nur Taste V mit ⌘, ohne ⌥/⇧/Ctrl; nur mit Fokus im Explorer-Container und nicht in Eingabefeld/Textarea/contenteditable; nicht während Umbenennen, Anlegen oder Suche; nur mit Workspace-Wurzel (EP-5); nicht während eines laufenden Einfügens (ST-2); auch bei leerem Baum. Nachweis: vitest der reinen Erkennung + e2e (Terminal/Editor behalten ⌘V, BR-8) | – (Event wird nicht behandelt) |
| VAL-8 | Ziel-IP des AI-HTTP-Proxys | Host-Literal wird vor dem Parse von IPv6-Klammern befreit (Auflösung und Redirect-Prüfung, Q&A #26); Klassifikation nach SVC-13 für jede aufgelöste, jede verbundene und jede Redirect-Ziel-Adresse; die Formen aus BR-16 landen in der Klasse ihrer eingebetteten IPv4, `64:ff9b:1::/48` mit der Fork-Erweiterung aus SVC-13 (Q&A #27): dort gilt das Maximum aus Private und allen Kandidaten-Klassen, nie Public; meist Loopback durch Null-Kandidaten (wirkungsgleich mit Private, `net.rs:150-163`). Nachweis: Upstream-Tests aus `11343a1` (geklammerte Literal-Hosts ohne DNS) plus die bestehenden Fork-Assertions (INV-6), Fork-Tests `64:ff9b:1::a9fe:a9fe` → BlockedMetadata und `64:ff9b:1::7f00:1` → Loopback, Test der reinen Funktion `redirect_decision` (MIG-5) mit geklammertem Literal (`http://[::ffff:169.254.169.254]/`): Stop, auch mit Opt-in | `host not allowed: {host}` bzw. bestehender Opt-in-Fehlertext |
| VAL-9 | Quell-Typ | Nur Dateien, Ordner und Symlinks; andere Typen (Socket, FIFO, Gerät) scheitern je Element. Nachweis: Rust-Test mit FIFO | `only files, folders and symbolic links can be copied` |
| VAL-10 | ⌘S | Löst nur aus, wenn der aktive Tab ein Editor-Tab ist; `Mod+Shift+S` bleibt Spaces-Übersicht. Nachweis: Registry-Test `shortcuts.test.ts` + e2e über Test-Bridge (Datei vorher/nachher) | – |

---

## Security

### Authentication & Authorization

| ID | Area | Mechanism | Notes |
|----|------|-----------|-------|
| SEC-1 | IPC-Fläche | Neue/geänderte Commands (API-1, API-2) nur über `invoke` der App-WebView; eigene Commands brauchen keinen Capability-Eintrag (`capabilities/default.json` gilt nur für Plugins) | Keine neue Plugin-Berechtigung, keine Netzwerk-Fläche |
| SEC-2 | Schreibziel | Lokal: Ziel nur innerhalb freigegebener Workspace-Wurzeln (VAL-2, bestehender Jail); Quellen bewusst unbeschränkt, weil der User sie im Finder gewählt hat (BR-6). SSH: Host-Account ist die Grenze (bestehendes Modell) | Drop und Einfügen nutzen denselben Jail, weil beide API-2 rufen (Anti-Slop-Hinweis K1) |

### Data Protection

| ID | Data Type | Protection | Notes |
|----|-----------|------------|-------|
| SEC-3 | Zwischenablage-Inhalt | Nur Datei-URLs werden gelesen, nur auf explizite User-Aktion (⌘V/`Paste`); kein Speichern, kein Logging des Inhalts; Text/Bilder werden nie gelesen | Logs nennen nur Quell-/Zielpfad bei Kopierfehlern (bestehende Konvention) |
| SEC-4 | Bestehende Dateien im Ziel, halbe Kopien | Nie überschreiben: Veröffentlichung ohne Ersetzen (lokal No-Replace-Rename, remote API-3); hängende Symlinks am Ziel zählen als belegt (INV-3). Teilkopien liegen nur im Staging-Ordner `.terax-copy-*`, nie unter dem Zielnamen (BR-3). Das Prädikat `is_staging_name` (MIG-14) ist die einzige Garantie der Staging-Sichtbarkeit; es wirkt an jeder Primitive, mit der die App Dateisystem-Inhalt des Workspace aufzählt: jeder `WalkBuilder` (`tree.rs:47`, `search.rs:103`, `search.rs:298`, `grep.rs:80`, `grep.rs:354`), jedes Verzeichnis-Listing (`tree.rs:167`, `:256`), jede Helper-Listing-Op (`ssh.rs:297`, `:316`, `:484`, `:518`), der Parser-Pfad für ungetrackte Git-Einträge (`parser.rs:62`); unabhängig von `showHidden`, `.hidden(true)` und Ignore-Regeln, lokal und SSH (MIG-73, MIG-74, MIG-75, MIG-76, MIG-19, Q&A #7, #28, #31). Begründung: in `ignore 0.4.32` greift die Hidden-Regel nur ohne Ignore-/Whitelist-Treffer (`dir.rs:490`); das Prädikat wirkt nach dieser Auswertung und verhindert das Betreten (`walk.rs:1162,1177` seriell, `:1904,1927-1934` parallel). Geltungsbereich: Aufzählungen, deren Wurzel außerhalb eines Staging-Ordners liegt; die Wurzel wird nie gefiltert (`walk.rs:1150-1152`); steuert der User einen Pfad darin selbst an (cd im Terminal `useWorkspaceCwd.ts:103-108`, getippter Pfad `pathComplete.ts:36-46`), zeigt die App ihn wie das Terminal. Git: nur ungetrackte Einträge werden gefiltert; Invariante: ein Panel-Commit enthält nie einen Pfad, den das Panel nicht als gestagt zeigt | Ein nach Absturz oder SSH-Abbruch liegengebliebener Staging-Ordner bleibt auf der Platte; keine App-Aufzählung mit Wurzel außerhalb zeigt ihn (Baum, Suche, Inhaltssuche, Unterordner-Menü, Dateiliste, Git-Status), auch nicht bei `showHidden` oder einer Whitelist-Regel in `.gitignore`; sichtbar nur außerhalb (`ls -a`, `git status` im Terminal) oder nach eigenem Hineinwechseln |

### Input Validation & Sanitization

| ID | Input | Validation | Sanitization |
|----|-------|------------|--------------|
| SEC-5 | Quellpfade, Symlinks | VAL-1, VAL-3, VAL-9; Symlinks lokal als Symlinks kopiert, nie verfolgt (keine Schleifen, kein Mitkopieren fremder Bäume, BR-21); SSH lädt wie heute den Inhalt von Datei-Symlinks hoch, Ordner-Symlinks scheitern je Element | Dateinamen gehen als JSON-Strings an den Helper (kein Shell-Splicing, bestehendes Protokoll); Nicht-UTF-8-Namen scheitern remote je Element (bestehend `ssh.rs:1176`) |
| SEC-7 | AI-HTTP-Ziele | VAL-8; Hostnamen-Blockliste und Verbindungs-Pinning gegen DNS-Rebinding bleiben unverändert | schließt den SSRF-Umweg über `::ffff:169.254.169.254` u.ä. |
| SEC-8 | CI-Checkout | `persist-credentials: false` an allen vier `actions/checkout`-Stellen in `ci.yml`, damit spätere Schritte kein Token aus `.git/config` lesen können | `release.yml` und andere Workflows unverändert (Q&A #21) |

### Rate Limiting & Abuse Prevention

| ID | Resource | Limit | Window | Penalty |
|----|----------|-------|--------|---------|
| SEC-6 | Einfügen im Explorer / `fs_copy` | 1 laufendes Einfügen je Explorer; Quellen je Aufruf und Ordnertiefe begrenzt (VAL-5); Zwischenablage-Lesen mit Zeitlimit (API-1) | je Vorgang | weitere ⌘V werden ignoriert; zu großer Batch → Gesamtfehler UI-5 |

---

## Architecture Layers

> No requirement IDs — context

### Layer Responsibilities

| Layer | Responsibility | Pattern |
|-------|----------------|---------|
| Tauri-Commands (`fs_copy`, `fs_clipboard_paths`) | dünne Hülle: Argumente, Thread-Wechsel, Registry-Zugriff | Imperative Shell (TERAX.md), Command → `_impl` (P1) |
| Rust-Kern (`fs/copy.rs`, `net/ip.rs`, Lesekern `fs/clipboard.rs`) | Kopierregeln, Benennung, No-Replace-Publish, IP-Klassen | Functional Core, reine Funktionen mit Rust-Tests |
| SSH-Weg (`ssh.rs` + eingebetteter python3-Helper) | Upload, Staging, `publish` auf dem Host | Remote-Op-Protokoll, ein JSON-Request je Op |
| Frontend-Kern (`clipboardPaste.ts`, `watchRegistry.ts`, `statusConsumers.ts`, `windowVisibility.ts`, `mediaPlayback.ts`, `iconEngine.ts`) | Zielregel, Erkennung, Konsumenten-Ableitung, Sichtbarkeit, Medien-Bindung, Icon-Zuordnung | reine Funktionen + kleine Stores, vitest |
| React-Komponenten/Hooks (`FileExplorer`, `useFileTree`, `useSourceControl*`, `EditorStack`/`EditorPane`/`MediaPreview`, `FileIcon`, `App`) | Verdrahtung, Zustand, Toasts | dünne Komponenten über dem Kern |
| CSS (`globals.css`) | Stufen-Animationen, Pause-Attribut | deklarativ, abgesichert durch `motionBudget.test.ts` |
| Build-/Budget-Tests (`eager-budget.test.ts`, `dist-budget.test.ts`, `dist-graph.mjs`) | Startpaket-Grenzen, eine Lezer-Kopie | Architektur-Tests in vitest |

### Data Flow

```
Finder ⌘C → NSPasteboard
Explorer ⌘V → clipboardPaste.ts → invoke fs_clipboard_paths → clipboard.rs (Main-Thread) → string[]
          → invoke fs_copy → copy.rs ─lokal→ Staging im Ziel → No-Replace-Rename → Ziel
                                     └SSH→ ssh::copy → Helper create_dir/write_bytes (Staging) → Helper publish → Ziel
          → CopyResult → Toast + useFileTree.refresh → Auswahl

document.visibilityState → windowVisibility.ts → html[data-window-hidden] → CSS
                                               → Abonnenten: Media, Poller, SurfaceLayer, PTY-Hinweise, Space-Persistenz

useSidebarPanel (collapsed, view) ┬→ FileExplorer visible → watchRegistry arm/disarm → fs_watch_* (Rust-Refcount)
StatusBar-Layout, Zen, aktiver Tab ┴→ statusConsumers → useSourceControl live → git_status
```

### Error Handling Strategy

| Error Type | Handling | User Response | Logging |
|------------|----------|---------------|---------|
| Element-Fehler beim Kopieren (Rechte, Quelle weg, Selbstkopie, kein freier Name, SSH-Fehler je Datei) | in `CopyResult.failed`, Rest läuft weiter (BR-4) | UI-4 `Could not copy {N} item(s)` + `{source}: {message}` des ersten | `log::warn!` je Element |
| Gesamtfehler `fs_copy` (Ziel nicht freigegeben, kein Ordner, Batch zu groß, SSH-Verbindung weg) | Promise-Rejection mit Text | Einfügen: UI-5 `Paste failed: {error}` + Neu-Einlesen falls schon kopiert; Drop: `Copy failed: {error}` | `log::warn!` |
| Zwischenablage nicht lesbar / Zeitlimit / Plattform | Rejection von API-1 | UI-5 | keins (kein Inhalt) |
| Zwischenablage leer | `[]` | UI-3 `No files on the clipboard` | keins |
| Workspace-Wechsel während des Einfügens | `isCurrent()` falsch → Ergebnis verworfen | keine Auswahl (EP-4); Toasts zu Fehlern erscheinen trotzdem | keins |
| Staging-Aufräumen scheitert (SSH) | ignoriert, Element-Ergebnis zählt | keine | `log::warn!` mit Staging-Pfad |
| SSRF-Treffer | Rejection | bestehende Fehleranzeige des AI-Aufrufs | bestehend |
| Icon-Chunk lädt nicht | Platzhalter bleibt | neutrales Icon | `console.error` einmal |

---

## Migration Map (when scope changes existing code)

| ID | Existing File | Current Pattern | Target Pattern | Specific Changes |
|----|---|---|---|---|
| MIG-1 | `src-tauri/Cargo.toml` | `grep-matcher = "0.1"` (`:37`), `dirs = "6"` (`:31`), Version 0.8.6 (`:3`), `objc2-app-kit` Features `NSEvent`, `NSPasteboard`; `objc2-foundation` `NSString`, `NSUserDefaults` (`:66-67`) | ohne `grep-matcher`; `dirs = "7"`; Version 0.8.7; App-Kit zusätzlich `NSPasteboardItem`; Foundation zusätzlich `NSArray`, `NSURL`; `reqwest` bleibt 0.12 | S1: `f885631`. S3: Features für SVC-4. S7: `dirs`, Version (BR-19) |
| MIG-2 | `src-tauri/Cargo.lock` | 0.8.6, `grep-matcher`, `dirs` 6.0.0, `tauri` 2.11.5 | regeneriert: kein `grep-matcher`, `dirs` 7.0.0, `tauri` ≥ 2.12.2, Paket `terax` 0.8.7 | nur über `cargo` erzeugen, nie von Hand (S1, S3, S7) |
| MIG-3 | `src/components/ai-elements/markdown-code.tsx` | Inline-Code fest `text-[11px]` (`:24`) | erbt die Textgröße | S1: `d3c8fd7` als Cherry-Pick |
| MIG-4 | `.github/workflows/ci.yml` | 4× `actions/checkout@v7` ohne `with:` (`:17,58,110,134`) | 4× mit `persist-credentials: false` | S1: `e8f9fcd` per Handarbeit, HEAD-Seite der Jobs behalten (SEC-8) |
| MIG-5 | `src-tauri/src/modules/net.rs` | eigene `ip_kind` + `IpKind` (`:33-75`), Tests `:446-503`; `host.parse::<IpAddr>()` ohne Klammer-Entfernung an `:90` und `:281` | `mod ip;` + Import von `ip_kind`/`IpKind`; alte Funktion und Enum entfernt; alte Assertions bleiben als Test erhalten (INV-6) plus Fork-Assertion `0.0.0.0` → Loopback; Upstream-Test `embedded_ipv4_literals_cannot_smuggle_internal_hosts_past_the_guard` ergänzt; Klammer-Entfernung `trim_matches(['[', ']'])` vor dem Parse an `:90` als Hunk aus `0a6e511`; Redirect-Prüfung als reine Funktion `redirect_decision` nach Upstream-Form (`11343a1:net/clients.rs:135-173`) aus der Closure in `build_safe_client` (`:262-296`) herausgelöst, die Closure ruft sie (Functional Core / Thin Shell), Klammer-Trim darin; Test ruft `redirect_decision` mit `Url::parse("http://[::ffff:169.254.169.254]/")` und `allow_private = true` → Stop (weitere Fälle OB-26) | S1, Anti-Slop #2 (dismantle), Q&A #26 |
| MIG-6 | `src-tauri/src/modules/net/ip.rs` | existiert nicht | Upstream-Datei aus `11343a1` (nur `std`) samt ihren Tests, plus Fork-Erweiterung für `64:ff9b:1::/48` nach SVC-13 mit Tests `64:ff9b:1::a9fe:a9fe` → BlockedMetadata und `64:ff9b:1::7f00:1` → Loopback; die Upstream-Assertion `kind("64:ff9b:1::808:808") == IpKind::Private` im Test `nat64_addresses_are_classified_by_their_ipv4` wird zu `IpKind::Loopback` (Kommentar: /48-Kandidat `0.0.0.0`); Positions-Tests je Prefix-Länge (OB-25); Abweichung von Upstream als 1-2-Zeilen-Kommentar an der Stelle | S1, SVC-13, Q&A #27 |
| MIG-7 | `src/modules/shortcuts/shortcuts.ts` | kein `editor.save`; `Mod+Shift+S` = `space.overview` (`:229-233`) | `ShortcutId` + Eintrag `editor.save`, Label `Save file`, Gruppe Editor, `Mod+S` | S1, SVC-12 |
| MIG-8 | `src/modules/shortcuts/shortcuts.test.ts` | existiert nicht | Registry-Test: `Mod+S` → `editor.save`; `Mod+Shift+S` bleibt `space.overview` | S1, VAL-10, INV-9 |
| MIG-9 | `src/modules/editor/EditorPane.tsx` | Handle ohne `save` (`:48-63`); `<video>`/`<audio>` inline mit `controls` (`:446-463`); kein `visible`-Prop | Handle mit `save()` über `saveRef`; Prop `visible`; Video/Audio über `MediaPreview` mit `tabVisible` + `windowHidden` | S1: SVC-12. S2: SVC-8 |
| MIG-10 | `src/app/App.tsx` | Handler-Map mit `editor.undo`/`redo` (`:976,1007,1052`); tmux-cwd-Poll prüft `document.hidden` (`:477`); `FileExplorer` ohne Sichtbarkeit (`:1591-1598`); `useSourceControlContext` ohne Konsumenten-Eingaben | + `editor.save` mit gleicher Freischaltung; Poll-Guard über SVC-7-Getter; `FileExplorer visible={sidebarView === "explorer" && !sidebarCollapsed}`; Konsumenten-Eingaben (eingeklappt, Git-Farben-Präferenz, Zen-Modus, Statusleisten-Layout) an `useSourceControlContext` | S1, S2, S4 |
| MIG-11 | `src/modules/explorer/lib/iconResolver.test.ts` | existiert nicht | S1: `d766567` als Vorher-Aufnahme des synchronen Resolvers; S6: auf die nachladende API umgeschrieben (Upstream-Fassung aus `f6f0004` als Vorlage), gleiche erwartete Icons | INV-20 |
| MIG-12 | `src/modules/theme/applyTheme.test.ts` | existiert nicht | `258d119` | S1 |
| MIG-13 | `src/modules/theme/customThemes.test.ts` | existiert nicht | `13ded38` | S1 |
| MIG-14 | `src-tauri/src/modules/fs/copy.rs` | existiert nicht | async Command `fs_copy` (blockierende Arbeit außerhalb des Main-Threads), Batch mit `CopyResult`, Staging + No-Replace-Publish (macOS `renamex_np` mit `RENAME_EXCL`, Linux `renameat2` mit `RENAME_NOREPLACE`, sonst und bei nicht unterstütztem Dateisystem exklusive Reservierung), `copy_name`, Symlinks als Symlinks, Limits; exportiert `pub(crate) const STAGING_PREFIX = ".terax-copy-"` und `is_staging_name(&str)` (Name beginnt mit `STAGING_PREFIX`, Bindestrich eingeschlossen), der `tempfile`-Builder nutzt die Konstante; einzige Quelle für MIG-73, MIG-74, MIG-75, MIG-76 und den Pin-Test aus MIG-19; Tests: Benennung (alle BR-1-Beispiele), Konflikt mit Ordner gleichen Namens, Selbstkopie, Teilfehler, FIFO, Staging verschwindet bei Fehler, bestehende Jail-/Symlink-Tests | S3, SVC-1, SVC-2, Anti-Slop #3 |
| MIG-15 | `src-tauri/src/modules/fs/mutate.rs` | `copy_recursive` (`:195-206`), `fs_copy` + `fs_copy_impl` (`:207-244`), Tests `:331,459,519` | alle drei entfernt; Tests nach `copy.rs` verschoben; `copy_brings_file_and_dir_in_and_refuses_clobber` wird zu „legt Kopie an statt zu überschreiben" (BR-1) und behält den Fall `renameOnConflict = false` | S3 |
| MIG-16 | `src-tauri/src/modules/fs/clipboard.rs` | existiert nicht | Command `fs_clipboard_paths` (macOS: Main-Thread-Sprung, begrenztes Warten; andere: Fehler), Lesekern mit Pasteboard-Parameter, Test mit privatem Pasteboard | S3, SVC-4 |
| MIG-17 | `src-tauri/src/modules/fs/mod.rs` | ohne `copy`/`clipboard` | `pub mod clipboard; pub mod copy;` | S3 |
| MIG-18 | `src-tauri/src/lib.rs` | registriert `fs::mutate::fs_copy` (`:408`) | registriert `fs::copy::fs_copy` und `fs::clipboard::fs_clipboard_paths` | S3 |
| MIG-19 | `src-tauri/src/modules/ssh.rs` | `copy` bricht beim ersten Fehler ab, prüft `remote_exists` (`:1145`), lädt direkt ins Ziel (`:1202-1215`); Helper ohne `publish` (`OPS` `:557`); Helper-Listing-Primitive `os.scandir` in `read_dir` (`:297`, Filter `:299`) und `list_subdirs` (`:316`, Filter `:318`), `os.walk` in `search` (`:484`, Filter `:486-490`) und `grep` (`:518`, Filter `:520-522`) zeigen Punkt-Einträge bei `showHidden` (`grep` bekommt von `ssh::grep` heute kein `showHidden`) | `copy` liefert `CopyResult`, je Element Staging-Ordner im Remote-Ziel, Upload hinein, Kandidaten aus `copy_name` nach einmaligem Lesen des Zielordners, Veröffentlichung über neue Helper-Op `publish`, Staging entfernen; Helper-Op `publish` mit Reservierung/Verlinken; jede Helper-Listing-Primitive (`os.scandir` `:297`, `:316`; `os.walk` `:484`, `:518`, dort auf `dirnames` vor dem Abstieg und auf `filenames`) wendet den Helper-Spiegel des Staging-Präfixes `.terax-copy-` immer an, auch bei `showHidden = true`; der Helper hat keine Ignore-Semantik (kein Whitelist-Fall): Staging-Ordner wird nie gelistet, nie betreten und nie als Treffer geliefert, unabhängig vom Aufrufer (Q&A #28); Tests gegen lokales python3 (Muster `:1422`) mit `showHidden = true`: `read_dir` listet `.terax-copy-x` nicht, `list_subdirs` listet `.terax-copy-x` nicht, `search` findet `report` unter `.terax-copy-x/` nicht, `grep` liefert keinen Treffer aus `.terax-copy-x/`; ein Pin-Test, dass das Präfix im Helper-Programm `STAGING_PREFIX` aus `copy.rs` (MIG-14) entspricht (einziger Nachweis der Spiegelung); Smoke `remote_mutations_smoke` um Konflikt-Benennung und Teilfehler erweitert | S3, SVC-3, API-3 |
| MIG-20 | `src/modules/explorer/lib/clipboardPaste.ts` | existiert nicht | `pasteTargetDir`, `parentDir`, `isPasteShortcut`, `reportCopyFailures`, `pasteClipboardFiles`, Typ `CopyResult` | S3, SVC-5 |
| MIG-21 | `src/modules/explorer/lib/clipboardPaste.test.ts` | existiert nicht | Zielregel (BR-5), Erkennung (VAL-7), Toast-Texte, Ablauf mit leerer Zwischenablage, Teilfehler, Gesamtfehler, Workspace-Wechsel | S3 |
| MIG-22 | `src/modules/explorer/FileExplorer.tsx` | kein `Paste`; `handleKeyDown` (`:369-409`) bricht bei leerem Baum ab; statische Icon-Importe (`:38`); kein `visible`-Prop | Menü-Eintrag `Paste` mit `⌘V` in Zeilen- und Flächen-Menü (`:555-771`); ⌘V im Container-Handler vor der Leer-Prüfung; Busy-Sperre; nach Erfolg Zielordner aufklappen und erstes `created` auswählen; Prop `visible` an `useFileTree`; Icons über `FileIcon` | S3, S4, S6 |
| MIG-23 | `src/modules/explorer/lib/useExplorerFileDrop.ts` | `invoke("fs_copy")` ohne Konfliktbenennung, Fehler-Toast `Copy failed` (`:68-79`) | `renameOnConflict: true`, Auswertung `CopyResult` über `reportCopyFailures`; Gesamtfehler weiter `Copy failed: {error}`; Zielregel `dirAt` unverändert | S3, UI-7 |
| MIG-24 | `TERAX.md` | `fs::mutate::*` ohne `fs_copy`; keine Notiz zu Fenster-Sichtbarkeit; kein Lezer-Hinweis | Command-Liste um `fs::copy::fs_copy`, `fs::clipboard::fs_clipboard_paths` ergänzt; Notiz „Fenster-Sichtbarkeit nur über `src/lib/windowVisibility.ts`"; Gotcha zur Lezer-Identität aus `bf7e03d` | S3, S2, S7 |
| MIG-25 | `src/lib/windowVisibility.ts` | existiert nicht | Owner nach SVC-7 | S2, Anti-Slop #1 |
| MIG-26 | `src/lib/windowVisibility.test.ts` | existiert nicht | Startwert, Wechsel bei `visibilitychange`, Attribut gesetzt/entfernt, Abonnenten, Fokusverlust ändert nichts (BR-9) | S2 |
| MIG-27 | `src/lib/windowVisibility.guard.test.ts` | existiert nicht | Quelltext-Scan über `src/` ohne Testdateien (`*.test.ts`, `*.test.tsx` ausgenommen, also auch MIG-26, MIG-34 und der Guard selbst): `document.hidden`, `visibilityState`, `visibilitychange` nur in `windowVisibility.ts` und im bewusst fokusgekoppelten `terminal/lib/rendererPool.ts` | S2, Anti-Slop #1 |
| MIG-28 | `src/main.tsx` | kein Sichtbarkeits-Owner | installiert SVC-7 einmal vor dem ersten Rendern | S2 |
| MIG-29 | `src/modules/editor/lib/mediaPlayback.ts` | existiert nicht | Bindung nach SVC-8 (Upstream `bindMediaPlayback` als Vorlage, erweitert um Fenster-Zustand); keine zweite Endungs-Liste, Klassifikation bleibt `binaryPreview.ts` | S2 |
| MIG-30 | `src/modules/editor/lib/mediaPlayback.test.ts` | existiert nicht | Tab inaktiv → pausiert, Play wird zurückgenommen; Fenster unsichtbar → pausiert; Rückkehr ohne Auto-Play | S2 |
| MIG-31 | `src/modules/editor/MediaPreview.tsx` | existiert nicht | Video/Audio mit `controls`, `preload="metadata"`, Klasse `hidden` nur bei inaktivem Tab | S2 |
| MIG-32 | `src/modules/editor/MediaPreview.test.tsx` | existiert nicht | Ausblenden nur bei inaktivem Tab | S2 |
| MIG-33 | `src/modules/editor/EditorStack.tsx` | `visible={t.id === activeId}` nur am Wrapper (`:47,156`) | reicht `visible` an `EditorPane` weiter | S2 |
| MIG-34 | `src/modules/editor/EditorStack.window-hidden.test.tsx` | existiert nicht | Hintergrund-Tab und unsichtbares Fenster pausieren laufende Medien (Vorlage `EditorStack.window-inactive.test.tsx` aus `5502f82`, auf Sichtbarkeit statt Fokus) | S2 |
| MIG-35 | `src/modules/theme/SurfaceLayer.tsx` | eigener Hook `useDocumentHidden` (`:130-141`) | Hook aus SVC-7, eigener Hook entfernt | S2 |
| MIG-36 | `src/modules/statusbar/lib/useClaudeStatus.ts` | Poll-Guard `document.hidden` (`:55`) | Getter aus SVC-7 | S2 |
| MIG-37 | `src/modules/agents/components/SshAgentActivityPoller.tsx` | Tick-Guard `document.hidden` (`:141`) | Getter aus SVC-7 | S2 |
| MIG-38 | `src/modules/spaces/lib/useSpacePersistence.ts` | eigener `visibilitychange`-Listener, Flush bei `hidden` (`:88-100`) | Abo aus SVC-7, Flush beim Wechsel zu unsichtbar; `blur`/`beforeunload` unverändert | S2 |
| MIG-39 | `src/modules/terminal/lib/useTerminalSession.ts` | liest `document.hidden` (`:551`) und eigener `visibilitychange`-Listener (`:575`) | Getter + Abo aus SVC-7; Verhalten der PTY-Sichtbarkeitshinweise unverändert | S2 |
| MIG-40 | `src/styles/globals.css` | Shimmer `linear infinite` (`:416-450`), Tailwind-Spinner/Pulse flüssig, keine Pause; kein `terax-icon-in` | S5: `@theme`-Überschreibung `--animate-spin`/`--animate-pulse` mit `steps()`, Shimmer mit `steps()`, Pause-Regel unter `html[data-window-hidden]` (nicht `data-window-inactive`); Reduced-Motion-Block unverändert. S6: `@keyframes terax-icon-in` + Klasse `.terax-icon-in` (Dauer `--dur-fast`, damit Reduced-Motion sie über die Token nullt) für MIG-54 | S5, S6, SVC-9 |
| MIG-41 | `src/styles/motionBudget.test.ts` | existiert nicht | CSS-Test: jede `infinite`-Animation in `globals.css` hat `steps()`; ausdrücklich verlangt, dass `--animate-spin`, `--animate-pulse` und `terax-shimmer` als `infinite` mit `steps()` in `globals.css` stehen (die Tailwind-Defaults liegen in `node_modules/tailwindcss/theme.css`, ein fehlender Override bliebe sonst unentdeckt); Pause-Regel hängt am Sichtbarkeits-Attribut, nicht an einem Fokus-Attribut; Upstream-Fälle `terax-blink`/`terax-attention-pulse` entfallen (gibt es im Fork nicht) | S5 (Vorlage `f6f0004`) |
| MIG-42 | `src/modules/sidebar/useSidebarPanel.ts` | eingeklappt nur als Ref + `localStorage` (`:75-100`) | zusätzlich React-Zustand `sidebarCollapsed`, zurückgegeben | S4 |
| MIG-43 | `src/modules/explorer/lib/watchRegistry.ts` | existiert nicht | Registry nach SVC-10 (Upstream-Vorlage) | S4 |
| MIG-44 | `src/modules/explorer/lib/watchRegistry.test.ts` | existiert nicht | arm/disarm idempotent, Änderungen im entschärften Zustand nur in der Menge, arm registriert genau die Menge | S4 |
| MIG-45 | `src/modules/explorer/lib/useFileTree.ts` | `watchedRef` + direkte `watchAdd`/`watchRemove` (`:117-126,217-224`), `watchedRef` als Kandidatenquelle (`:157`), Tot-Ordner-Bereinigung direkt (`:178-180`) | Registry aus MIG-43 für ALLE Watch-Mutationen inkl. Tot-Ordner-Bereinigung (`removeMany`) und Kandidatenquelle (`paths()`); in `useFileTree.ts` kein direkter `watchAdd`/`watchRemove`/`watchedRef` mehr; Parameter `visible`; beim Wechsel zu sichtbar alle geladenen Ordner neu einlesen (Muster `:251-257`) | S4 |
| MIG-46 | `src/modules/source-control/statusConsumers.ts` | existiert nicht | reine Ableitung nach SVC-11 inkl. Rail-Badge und Statusleisten-Widgets | S4 |
| MIG-47 | `src/modules/source-control/statusConsumers.test.ts` | existiert nicht | je Konsument einzeln live; Sidebar zu + keine Widgets + kein Git-Tab → nicht live; Zen-Modus blendet Widgets aus | S4 |
| MIG-48 | `src/modules/source-control/useSourceControlContext.ts` | `useSourceControl(path, true)` (`:82`) | `useSourceControl(path, true, { live })`; Git-Graph-Kontext nutzt Snapshot nur, wenn live | S4 |
| MIG-49 | `src/modules/source-control/useSourceControl.ts` | Fokus-Auffrischung immer (`:460-474`), Kontext-Auffrischung immer | Option `live`: ohne live keine automatischen Auffrischungen; Übergang zu live genau eine | S4 |
| MIG-50 | `src/modules/source-control/useSourceControl.test.ts` | existiert nicht | nicht live → kein Aufruf bei Fokus; Übergang zu live → genau ein Aufruf | S4 |
| MIG-51 | `src/modules/statusbar/layout.ts` | Widget-Katalog ohne Kennzeichnung der Git-Status-Nutzer | exportierte Konstante der Widgets, die Git-Status anzeigen (`git-branch`, `git-sync`, `git-changes`, `git-staged`, `line-changes`) | S4; einzige Quelle dieser Liste |
| MIG-52 | `src/modules/explorer/lib/iconResolver.ts` | statische Importe von Icon-JSON, `fileIcons.ts`, `folderIcons.ts` (`:1-4`), synchrone URL | Lader mit dynamischem `import()`, Cache, Abo für „geladen" | S6, SVC-14 |
| MIG-53 | `src/modules/explorer/lib/iconEngine.ts` | existiert nicht | reine Zuordnung Name/Endung → Icon-Slug auf geladenen Daten (Upstream-Vorlage) + `iconEngine.test.ts` | S6 |
| MIG-54 | `src/modules/explorer/FileIcon.tsx` | existiert nicht | Komponente: Platzhalter bis geladen, dann Icon mit `terax-icon-in` | S6 |
| MIG-55 | `src/modules/tabs/TabBar.tsx` | `fileIconUrl` synchron (`:31`) | `FileIcon` | S6 |
| MIG-56 | `src/modules/git-history/GitHistoryPane.tsx` | `fileIconUrl` synchron (`:15`) | `FileIcon` | S6 |
| MIG-57 | `src/modules/explorer/ExplorerSearch.tsx` | `fileIconUrl`/`folderIconUrl` synchron (`:26`) | `FileIcon` | S6 |
| MIG-58 | `src/modules/command-palette/CommandPalette.tsx` | `fileIconUrl` synchron (`:12`) | `FileIcon` | S6 |
| MIG-59 | `src/modules/explorer/TreeRow.tsx` | `fileIconUrl`/`folderIconUrl` synchron (`:8`) | `FileIcon` | S6 |
| MIG-60 | `src/modules/source-control/SourceControlPanel.tsx` | `fileIconUrl` synchron (`:45`) | `FileIcon` | S6 |
| MIG-61 | `src/modules/ai/components/FilePicker.tsx` | `fileIconUrl` synchron (`:4`) | `FileIcon` | S6 |
| MIG-62 | `vite.config.ts` | `rolldownOptions.output.manualChunks` (`:51,66-131`): React landet in `ai-sdk-shared`, dadurch laden `index.html` und `settings.html` `ai-anthropic`, `ai-cerebras`, `ai-sdk-shared` (~546 KB) mit `@ai-sdk/*`, `ai`, `zod` vor (Gate-1-Messung) | Upstream-Chunk-Strategie aus `f6f0004`: `manualChunks` ersetzt durch `codeSplitting.groups` (in rolldown 1.2.6 vorhanden) mit Gruppe „eager“ (Priorität 100: `react`, `react-dom`, `scheduler`, `@hugeicons/react`, `clsx`, `tailwind-merge`, `class-variance-authority`, Vite-Preload-Helper → Chunk `react`; Radix → `radix`; Fork-Gruppe `xterm` (`vite.config.ts:100`) bleibt als eager-Gruppe mit Priorität 100) vor Gruppe „lazy“ (Priorität 0: je AI-Provider ein Chunk, übriges `@ai-sdk/*` → `ai-sdk-shared`, `cm-lang-*`, `cm-legacy-*`, `codemirror`, `streamdown`); Paketname aus dem letzten `node_modules/`-Segment; Ghostty-Gruppe entfällt; Icon-Daten erreichbar nur über den dynamischen Import aus MIG-52. Ziel: gebautes Startpaket beider Fenster ohne AI-SDK, `zod`, CodeMirror, Icon-Daten (SVC-15) | S6, Q&A #29 |
| MIG-63 | `src/app/eager-budget.test.ts` | `HEAVY` ohne Icon-Set (`:10`) | + `@iconify-json/catppuccin` | S6, INV-19 |
| MIG-64 | `src/app/dist-budget.test.ts` | existiert nicht | Build-Test nach SVC-15 (Upstream-Vorlage ohne den App-Lab-Fall); S7: Fall „genau eine `@lezer/highlight`-Kopie" aus `bf7e03d` | S6, S7 |
| MIG-65 | `scripts/dist-graph.mjs` | existiert nicht | Analyse des gebauten Outputs (Upstream-Vorlage) | S6 |
| MIG-66 | `scripts/dist-graph.d.mts` | existiert nicht | Typen für den Test | S6 |
| MIG-67 | `package.json` | Version 0.8.6 (`:4`), `@lezer/highlight ^1.2.3` (`:62`), Deps auf 0.8.6-Stand | Version 0.8.7; `@lezer/highlight: "catalog:"`; Bereiche auf Upstream-Lock-Niveau (Integrations-Tabelle) | S7 |
| MIG-68 | `pnpm-workspace.yaml` | `overrides:` mit `dompurify`, `react-grab`, `react-doctor` | + Block `catalog:` mit `@lezer/highlight: 1.2.5`; im BESTEHENDEN `overrides:`-Block zusätzlich `'@lezer/highlight': 'catalog:'` mit Kommentarzeile; Reihenfolge der übrigen Schlüssel unverändert | S7, Q&A #13 |
| MIG-69 | `pnpm-lock.yaml` | `@lezer/highlight` 1.2.3 einmal (`:904,6697`) | regeneriert mit `pnpm install`, `@lezer/highlight` 1.2.5 genau einmal | S7 |
| MIG-70 | `src-tauri/tauri.conf.json` | `"version": "0.8.6"` (`:4`) | `0.8.7` | S7, BR-19 |
| MIG-71 | `src/modules/ai/lib/codeHighlight.test.ts` | existiert nicht | `bf7e03d`: Chat-Code-Blöcke färben JS/TS-Schlüsselwörter, Strings, Kommentare | S7 |
| MIG-72 | `src/modules/editor/lib/languageResolver.test.ts` | ohne Theme-übergreifenden Färbe-Fall | `bf7e03d`-Erweiterung: JS/TS in jedem Editor-Theme gefärbt | S7 |
| MIG-73 | `src-tauri/src/modules/fs/tree.rs` | Punkt-Einträge werden nur ohne `show_hidden` ausgeblendet: `fs_read_dir` (`read_dir` `:167`, Filter `:204`) und `list_subdirs` (`read_dir` `:256`, Filter `:271`); `git_non_ignored_names` (`:46-54`, `WalkBuilder` `:47`, `.hidden(!show_hidden)`, kein Prädikat) | `fs_read_dir`, `list_subdirs` und der Walker in `git_non_ignored_names` wenden `is_staging_name` aus `copy.rs` (MIG-14) an, auch bei `show_hidden = true` und unabhängig von Ignore-Regeln (Staging-Namen sind nie in der Menge); übrige Punkt-Einträge unverändert; Tests im bestehenden Testmodul (`:278`): Ordner mit `.terax-copy-x` und `.env`, `show_hidden = true` → `.env` gelistet, `.terax-copy-x` nicht; `list_subdirs` mit Unterordnern `.terax-copy-x` und `.hidden`, `show_hidden = true` → `.hidden` gelistet, `.terax-copy-x` nicht; `git_non_ignored_names` in einem Repo mit `.gitignore` `*`/`!*/`, `show_hidden = true` → `.terax-copy-x` nicht in der Menge, `.hidden` enthalten (OB-28); bestehende Tests bleiben | S3, SEC-4, Q&A #28 |
| MIG-74 | `src-tauri/src/modules/fs/search.rs` | `fs_search` (`WalkBuilder` `:103`, `:104` `.hidden(!show_hidden)`, `filter_entry` `:111-120` prüft nur `PRUNE_DIRS`) und `fs_list_files` (`WalkBuilder` `:298`, `:299`, `:312`) blenden Punkt-Namen nur ohne `show_hidden` aus | beide überspringen Einträge mit dem Staging-Präfix samt Inhalt immer (`is_staging_name` aus `copy.rs` im `filter_entry`, MIG-14); das Prädikat wirkt unabhängig von Ignore-/Whitelist-Regeln und `show_hidden`; Test im bestehenden Testmodul (Muster `reg_for`, `:405`): Wurzel mit `.terax-copy-x/report.pdf` und `.env`, `show_hidden = true`, Suche `report` → kein Treffer, Suche `env` → `.env`; `fs_list_files` analog (`report.pdf` nicht gelistet, `.env` gelistet); Whitelist-Fall (OB-28): Wurzel mit `.terax-copy-x/src/report.txt` und Whitelist-Regel, die den Ordner trifft (`.gitignore` `*`/`!*/`/`!*.txt` im `git init`-Repo oder `.ignore` mit `!.terax-copy-*/`), `show_hidden = true`: `fs_search` `report` → kein Treffer, `fs_list_files` → `report.txt` nicht gelistet; Kontrolle: eine Datei außerhalb des Staging-Ordners wird gefunden | S3, SEC-4, Q&A #28 |
| MIG-75 | `src-tauri/src/modules/git/parser.rs` | Einträge `1 `, `2 `, `u ` und `? ` landen ungefiltert in `out.files` (`:42-64`; Push-Stellen `:44`, `:51`, `:57`, `:62`), daraus `changed_files` (`operations.rs:166`); `git status --untracked-files=all` liefert z.B. `? .terax-copy-x/report.pdf` (lokal und per SSH, geparst wird lokal) | nur `? `-Einträge (`:62`) werden gefiltert: ein ungetrackter Eintrag, dessen Pfad ein Segment mit `is_staging_name` (MIG-14) enthält, wird nicht übernommen; Segment = Teil zwischen `/`, Treffer nur, wenn das Segment mit `.terax-copy-` beginnt; `1 `, `2 `, `u ` (`:44`, `:51`, `:57`) bleiben ungefiltert; Invariante: ein Panel-Commit enthält nie einen Pfad, den das Panel nicht als gestagt zeigt (OB-29); Tests: `? .terax-copy-x/report.pdf` → nicht in der Liste; `? docs/.terax-copyright.md` → bleibt; `? a/.terax-copy-y/b.txt` → nicht in der Liste; Index-Eintrag `1 A. N... 100644 100644 100644 <h> <h> .terax-copy-x/report.txt` → bleibt in der Liste (gestagt sichtbar); `2 `-Eintrag mit Staging-Segment und Ursprungs-Token, gefolgt von einem normalen Eintrag → beide korrekt (Token-Ausrichtung) | S3, SEC-4, Q&A #31 |
| MIG-76 | `src-tauri/src/modules/fs/grep.rs` | `search_tree` (`:80-88`, genutzt von `fs_grep` `:227` und `fs_grep_interactive` `:297`) und `fs_glob_impl` (`:354-361`) verlassen sich auf `.hidden(true)`; in `ignore 0.4.32` greift das nur ohne Ignore-/Whitelist-Treffer (`dir.rs:490`); Probe mit `.gitignore` `*`/`!*/`/`!*.txt` liefert `.terax-copy-x/src/report.txt` | beide Walker wenden `is_staging_name` (MIG-14) an (Staging-Ordner wird weder betreten noch geliefert, unabhängig von Ignore-Regeln); `.hidden(true)` bleibt für übrige Punkt-Namen; Tests im bestehenden Testmodul (Muster `:430-434`): Whitelist-Repo mit `.terax-copy-x/src/report.txt` (Inhalt trifft das Muster) → `search_tree` kein Treffer; `fs_glob_impl` `**/*.txt` → kein Treffer; Kontrolle: `src/other.txt` wird in beiden gefunden (OB-28). SSH-Zweig von `fs_grep_interactive` (`:278` → Helper `grep`) bleibt bei MIG-19 | S3, SEC-4, Q&A #28 |

**Sweep criterion:**
- Fenster-Sichtbarkeit: `grep -rnE "document\.hidden|visibilityState|visibilitychange" src --exclude="*.test.ts" --exclude="*.test.tsx"` → jeder Treffer außerhalb `src/lib/windowVisibility.ts` und `src/modules/terminal/lib/rendererPool.ts` wird migriert; `windowVisibility.guard.test.ts` erzwingt das dauerhaft (Testdateien ausgenommen).
- Kopieren: `grep -rn "fs_copy" src src-tauri/src` → jeder Aufrufer wertet `CopyResult` aus und setzt `renameOnConflict` bewusst.
- SSRF: `grep -rn "fn ip_kind\|enum IpKind" src-tauri/src` → vor der Migration 2 Treffer in `net.rs`, danach genau ein Treffer je Muster, in `net/ip.rs`; `grep -n "parse::<IpAddr>" src-tauri/src/modules/net.rs` → jede Fundstelle parst den von Klammern befreiten Host.
- Staging-Sichtbarkeit (Klassifikator: Aufzählungs-Primitive; `show_hidden` ist nur Kreuzprobe):
  - (a) `grep -rn "WalkBuilder::new" src-tauri/src` → genau 5 Stellen (`tree.rs:47`, `search.rs:103`, `search.rs:298`, `grep.rs:80`, `grep.rs:354`), jede wendet das Prädikat an, keine Ausnahme.
  - (b) `grep -rn "fs::read_dir(" src-tauri/src` → `tree.rs:167`, `:256` mit Prädikat; Ausnahmen mit Grund: `copy.rs` `copy_recursive` (heute `mutate.rs:198`, mit MIG-15 verschoben): Rekursion über die vom User gewählte Kopierquelle, keine Aufzählung für den User; Treffer in `#[cfg(test)]`-Modulen zählen Testergebnisse und sind ausgenommen; `ssh.rs:1172` (Rekursion über die vom User gewählte Kopierquelle, keine Aufzählung für den User), `scan_path` (`history/mod.rs:71-94`): ausführbare Dateien der `$PATH`-Ordner für Befehlsvorschläge, Ordner übersprungen, keine Workspace-Aufzählung, `test_bridge.rs:40` (dev-only Bridge).
  - (c) `grep -n "os.scandir(\|os.walk(" src-tauri/src/modules/ssh.rs` → 4 Stellen, jede wendet den Helper-Spiegel an (bei `os.walk` auf `dirnames` vor dem Abstieg und auf `filenames`).
  - (d) `grep -n "files.push" src-tauri/src/modules/git/parser.rs` → `:62` (`? `) mit Segment-Prädikat; `:44`, `:51`, `:57` ohne, Grund: Index-/HEAD-Zustand, Invariante aus SEC-4.
  - (e) Kreuzprobe `grep -rn "show_hidden\|showHidden" src-tauri/src/modules/fs src-tauri/src/modules/ssh.rs` → jede Auswertungsstelle liegt an einer Stelle aus (a) bis (c); `show_hidden`, `.hidden(…)` und Ignore-Regeln sind keine Garantie und begründen keine Ausnahme.
  - `git_diff` zählt keinen Dateisystem-Inhalt auf: ohne Pfad `git diff --cached` über den Index (`operations.rs:203-218`), ungetrackte Dateien nie; Index-Einträge werden nicht gefiltert (MIG-75), daher zeigt `git_diff` nichts, was das Panel nicht zeigt; `git_commit_files` liest aus Commits (`operations.rs:675-707`).
- Icons: `grep -rln "fileIconUrl\|folderIconUrl\|iconResolver" src --include="*.tsx"` → jeder Treffer nutzt `FileIcon`; `eager-budget.test.ts` und `dist-budget.test.ts` müssen grün sein.
- Animationen: `grep -nE "infinite" src/styles/*.css` → jede Fundstelle mit `steps(`; `motionBudget.test.ts` erzwingt das.
- Version: `grep -rn "0\.8\.6" package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json` → leer; `Cargo.lock` Paket `terax` 0.8.7.
- Jeder bestehende Test, der dabei rot wird (z.B. der Clobber-Test in `mutate.rs`), ist eine Migrationsentscheidung gegen das Zielmuster dieser Tabelle, nie ein Grünmach-Ziel.

---

## Existing-Behavior Invariants

> Kandidaten-Liste aus `codebase-scan.md` vollständig übernommen (Modus autonom, Q&A #19); INV-23 aus eigener Recherche für die migrierten Sichtbarkeits-Stellen. Wo das Feature ein Verhalten bewusst ändert, steht hier der Kern, der bleiben muss.

| ID | Invariant (checkable assertion) | Consumers | Source | Coverage | Routing |
|----|--------------------------------|-----------|--------|----------|---------|
| INV-1 | `fs_copy` lokal legt Datei und Ordner (rekursiv) im Ziel an und überschreibt nie ein vorhandenes Element; mit `renameOnConflict = false` wird ein vorhandenes Ziel weiter mit `already exists` verweigert (mit `true` entsteht stattdessen die Kopie nach BR-1) | `useExplorerFileDrop.ts:72`, künftig `clipboardPaste.ts` | Test `copy_brings_file_and_dir_in_and_refuses_clobber` (`mutate.rs:331`) | covered | none |
| INV-2 | `fs_copy` verweigert ein Ziel außerhalb freigegebener Workspace-Wurzeln | `useExplorerFileDrop.ts:72` | Test `copy_rejects_unauthorized_dest` (`mutate.rs:459`) | covered | none |
| INV-3 | `fs_copy` schreibt nie durch einen hängenden Symlink am Ziel | `useExplorerFileDrop.ts:72` | Test `copy_refuses_prestaged_dangling_symlink_at_dest` (`mutate.rs:519`) | covered | none |
| INV-4 | `fs_copy` im SSH-Workspace lädt rekursiv hoch und überschreibt nie ein vorhandenes Remote-Element | `mutate.rs:229`, `useExplorerFileDrop.ts:72` | `ssh.rs:1202-1214` | uncovered | qa_matrix |
| INV-5 | Drop-Zielregel: Ordner unter dem Zeiger, Datei → deren Ordner, freie Fläche → Wurzel; Zielmarkierung während des Ziehens | `FileExplorer.tsx`, `TreeRow.tsx` (`data-fs-path`) | `useExplorerFileDrop.ts:20-42` | uncovered | qa_matrix |
| INV-6 | SSRF-Klassen: IPv4 link-local = BlockedMetadata, Loopback/unspecified (`0.0.0.0`) = Loopback, RFC1918/CGNAT = Private, öffentlich = Public; v6 `::1` Loopback, `fd00:ec2::254` und `fe80::/10` BlockedMetadata, `fc00::/7` Private. Vollständig belegt erst mit den Tests aus MIG-5/MIG-6 | `net.rs:91,107,160,282` | Tests `net.rs:446-503` (Fork); ergänzt um `net/ip.rs`-Tests `non_global_ipv6_ranges_are_never_public` und `ipv4_mapped_addresses_take_the_class_of_the_embedded_ipv4` (MIG-6) und Fork-Assertion `0.0.0.0` → Loopback (MIG-5) | uncovered | qa_matrix |
| INV-7 | (entfällt) Kein zu erhaltendes Verhalten: `::ffff:a.b.c.d` usw. ist heute ungeschützt, das Zielverhalten prüfen die Tests aus VAL-8 | `net.rs:33-75` | `net.rs:50-72` | uncovered | qa_matrix |
| INV-8 | Im fokussierten Editor speichert `Mod-s`; `onSaved` feuert nur bei echtem Schreiben | `EditorPane.tsx:188-193` | `EditorPane.tsx:241-249` | uncovered | qa_matrix |
| INV-9 | `Mod+Shift+S` öffnet die Spaces-Übersicht und kollidiert nicht mit `Mod+S` | `useGlobalShortcuts.ts:48-60` | `shortcuts.ts:229-233` | uncovered | qa_matrix |
| INV-10 | Medien-Klassifikation image/video/audio/pdf/card | `EditorPane.tsx:415` | Tests `src/modules/editor/lib/binaryPreview.test.ts` | covered | none |
| INV-11 | Video/Audio spielen im aktiven Editor-Tab mit Controls | `EditorStack.tsx:156` | `EditorPane.tsx:446-463` | uncovered | qa_matrix |
| INV-12 | Solange der Explorer sichtbar ist, liest er geladene Ordner bei `fs:changed` neu ein; bei Wurzelwechsel/Unmount gibt er seine Watches frei | `FileExplorer.tsx` | `useFileTree.ts:180,217-247` | uncovered | qa_matrix |
| INV-13 | Ein offener Editor-Tab erkennt externe Änderungen seiner Datei auch dann, wenn der Explorer seine Watches freigegeben hat (Rust-Refcount) | `useEditorFileSync.ts:53-54`, `useFileTree.ts` | `watch.rs:184-205` | uncovered | qa_matrix |
| INV-14 | Eine `useSourceControl`-Instanz speist Rail-Badge, Explorer-Farben (nur mit Präferenz), Statusleisten-Widgets und Panel; solange ein Konsument sichtbar ist, frischt Fenster-Fokus auf | `App.tsx:1596,1620,1681`, `StatusBar.tsx:73`, `GitWidgets.tsx:18,39,62,82,103` | `useSourceControl.ts:460-474` | uncovered | qa_matrix |
| INV-15 | Git-Status-Pfad = Source-Control-Kontext bei offenem Git-Tab oder Sidebar-Ansicht Source Control, sonst Explorer-Wurzel | `App.tsx:1596` | `useSourceControlContext.ts:61-82` | uncovered | qa_matrix |
| INV-16 | Explorer-Auswahl bleibt Einzelauswahl (`selectedPath: string \| null`), Pfeiltasten-Navigation unverändert | `FileExplorer.tsx:380-409` | `FileExplorer.tsx:201` | uncovered | qa_matrix |
| INV-17 | Bei sichtbarem Fenster laufen Tab-/Mission-Control-Spinner, Pulse und Shimmer weiter, auch ohne Fokus; `prefers-reduced-motion` stoppt den Shimmer wie heute | `TabActivityIndicator.tsx`, `AgentMissionControl.tsx`, `NotificationBell.tsx`, `AgentStatusWidget.tsx` | `globals.css:416-453` | uncovered | qa_matrix |
| INV-18 | Terminal-Renderer-Pool und Cursor-Blinken bleiben an Fokus + Sichtbarkeit gekoppelt (nicht migriert) | `useTerminalSession.ts` | `rendererPool.ts:103-113` | uncovered | qa_matrix |
| INV-19 | Der statische QUELL-Importgraph beider Fenster enthält kein `@ai-sdk`, `ai`, `streamdown`, `katex`, `@codemirror`, `@uiw` (das gebaute Startpaket enthält das AI-SDK heute doch; dessen Freiheit ist Zielverhalten von SVC-15/MIG-62, keine bestehende Invariante) | `src/main.tsx`, `src/settings/main.tsx` | Tests `src/app/eager-budget.test.ts` | covered | none |
| INV-20 | Nach dem Laden des Icon-Sets bekommt jeder Datei-/Ordnername dasselbe Icon wie heute | 8 Aufrufer (MIG-55 bis MIG-61, `FileExplorer.tsx`) | `iconResolver.ts:67,99` | uncovered | qa_matrix |
| INV-21 | Editor färbt JS/TS in allen Editor-Themes und in Chat-Code-Blöcken | `cmThemes.ts`, `chat-code-lezer.ts`, `chat-code.tsx` | `pnpm-lock.yaml:904` (eine Kopie 1.2.3) | uncovered | qa_matrix |
| INV-22 | About zeigt die Tauri-App-Version | `AboutSection.tsx:4` | `AboutSection.tsx:30` | uncovered | qa_matrix |
| INV-23 | Bei unsichtbarem Fenster ruhen tmux-cwd-Poll, Claude-Status-Poll und SSH-Agent-Poller, die Space-Persistenz schreibt beim Verstecken, PTY-Sichtbarkeitshinweise werden neu gesendet; beim Sichtbarwerden laufen alle wieder | `App.tsx`, `StatusBar.tsx`, `SshAgentActivityPoller.tsx`, `useSpacePersistence.ts`, `useTerminalSession.ts` | `App.tsx:477`, `useClaudeStatus.ts:55`, `SshAgentActivityPoller.tsx:141`, `useSpacePersistence.ts:92-96`, `useTerminalSession.ts:575` | uncovered | qa_matrix |

---

## Register

> No requirement IDs — context

N/A — kein neuer Fachbereich

- Begründung: Das Projekt hat kein Garantie-Register (`zip.config.json` fehlt, damit keine `area_roots`); das einzige neue Verzeichnis `src-tauri/src/modules/net/` ist Untermodul des bestehenden `net`-Moduls.

---

## Test Strategy & Mocking

> No requirement IDs — context

| System Boundary | Mocking Decision | Reason |
|-----------------|------------------|--------|
| Lokales Dateisystem (Kopieren, Staging, No-Replace-Rename, Watcher) | no_mocks | Rust-Tests mit `tempfile` + `reg_for` (bestehendes Muster `mutate.rs:270-274`), echte Syscalls |
| SSH-Helper (`python3`-Programm) | no_mocks | Helper-Ops (`publish`, Staging) gegen lokales python3 wie `embedded_helper_realpath_resolves_symlinks` (`ssh.rs:1417`); Ende-zu-Ende über `TERAX_SSH_TEST_HOST=litha-claude` (`remote_mutations_smoke`) |
| NSPasteboard | no_mocks | Lesekern nimmt das Pasteboard als Parameter; Test schreibt in ein eindeutig benanntes privates Pasteboard, nie in die allgemeine Zwischenablage des Users |
| Tauri-IPC (`invoke`) und `sonner` in vitest | mock_external | jsdom hat keine Tauri-Laufzeit; nur die Ablauf-Tests von `clipboardPaste.ts`/`useExplorerFileDrop.ts`/`useSourceControl.ts` ersetzen `invoke`; reine Funktionen ohne Ersatz; echter Weg per e2e über die Test-Bridge |
| HTMLMediaElement | mock_external | jsdom implementiert keine Wiedergabe; `mediaPlayback.ts` arbeitet gegen eine schmale Schnittstelle (`pause`, Event-Listener), Test nutzt ein Objekt dieser Form; echtes Verhalten per e2e (Video starten, Tab wechseln, Fenster minimieren) |
| Fenster-Sichtbarkeit (`document`) | no_mocks | jsdom-Dokument, `visibilityState` umdefiniert, echtes `visibilitychange`-Event |
| Vite-Build | no_mocks | `dist-budget.test.ts` baut wirklich (einmal je Lauf) |
| AI-HTTP-Proxy / DNS | no_mocks | IP-Literal-Hosts, auch geklammerte IPv6-Literale (nach der Klammer-Entfernung aus MIG-5 ohne DNS); Redirect-Prüfung über die reine Funktion `redirect_decision` (MIG-5) ohne HTTP-Server; Upstream-Test aus `11343a1` plus Fork-Fälle aus MIG-5/MIG-6 |
| git CLI | no_mocks | Konsumenten-Logik ist rein; Zahl der `git_status`-Aufrufe e2e gemessen (NFR-1) |

---

## Constraints & Integrations

> No requirement IDs — context

### Constraints

| Constraint | Technical Implication | Solution |
|------------|----------------------|----------|
| Ghostty geparkt (BR-14) | xterm.js, PTY-Transport und Renderer-Pool bleiben; kein Upstream-Code, der auf `0a6e511` aufbaut | Handarbeit statt Cherry-Pick für `4cfc202`, `5502f82`, `2723dc6`, `f6f0004`, `bf7e03d`; Fork-Fassungen von `useFileTree.ts`/`useExplorerFileDrop.ts` als Basis |
| Functional Core / Thin Shell (TERAX.md) | neue Logik in reine Funktionen, Commands und Komponenten dünn | Schichten-Tabelle; jede Regel mit eigenem Test (Validation Rules) |
| Kernsubsystem fs/IPC braucht Invarianten-Test (TERAX.md) | Kopieren, Zwischenablage, SSRF | MIG-14, MIG-16, MIG-19, MIG-5 |
| pnpm only, `minimumReleaseAge` 4320 min strikt (`pnpm-workspace.yaml`) | Deps nur, wenn ≥ 3 Tage alt | Zielstände = Upstream-Lock als Untergrenze, Auflösung innerhalb der Bereiche durch pnpm (Q&A #15) |
| macOS `minimumSystemVersion` 13.0 (`tauri.conf.json:50`) | `renamex_np`/`RENAME_EXCL` (ab macOS 10.12) und `NSPasteboardTypeFileURL` (ab 10.13) verfügbar | keine Laufzeit-Weiche nötig |
| SSH-Workspaces brauchen `python3` auf dem Host (`ssh.rs:205-211`) | `publish` nutzt nur `os.mkdir`, `os.rename`, `os.link`, `os.unlink` | belegt mit Host `litha-claude` (Python 3.13.5, Linux 6.12) und lokalem Python 3.9.6 |
| Laufende Prod-App nie beenden | e2e nur in isolierter Dev-Instanz | eigener `identifier` + eigenes `MANAGED_PREFIX` (Test-Bridge-Notiz) |
| Keine Telemetrie (TG-1..TG-6) | Perf-Zahlen nur manuell | Messprotokoll NFR-1/NFR-2, Zahlen im PR (BR-15) |
| Keine em-dashes, keine Emojis, `@/`-Importe | gilt für Code, Kommentare, Doku | Review-Punkt je Slice |
| Kein Lastgenerator im Hintergrund | Leerlauf-Messung darf keine Schleifen zurücklassen | nach jeder Messung per `ps` prüfen |
| Slices 1→3→2→5→4→6→7 (PM-Entscheidung) | Sichtbarkeits-Owner entsteht in Slice 2, CSS-Pause in 5 nutzt ihn; `d766567` vor dem Icon-Umbau | MIG-Zuordnung S1..S7 |

### Integrations

| Area | System / Capability | Interface | Version | Notes |
|------|----------------------|-----------|---------|-------|
| Desktop-Shell (Rust) | `tauri` | Crate | Projekt 2.11.5 (`Cargo.lock`) → Ziel ≥ 2.12.2 (Upstream-Lock `640e8b2`); aktuell stabil 2.12.5 (crates.io, 21.10.2026) | gleiche Major, Bereich `"2"`; Upstream-Feature `macos-private-api` NICHT übernehmen (nur Vibrancy, out of scope) |
| Desktop-Shell (JS) | `@tauri-apps/api` | npm | Projekt ^2.11.1 → Ziel ^2.12.3; aktuell stabil 2.12.4 (npm, 14.10.2026) | `getVersion()` für UI-10 unverändert |
| Build-CLI | `@tauri-apps/cli` | npm | Projekt ^2.11.4 → Ziel ^2.12.0; aktuell stabil 2.12.4 (npm, 21.10.2026) | – |
| UI | `react`, `react-dom` | npm | Projekt ^19.2.8 → Ziel ^19.3.0; aktuell stabil 19.3.1 (npm, 14.10.2026) | Minor; `useSyncExternalStore` für SVC-7 seit React 18 vorhanden |
| Bundler | `vite` (mit rolldown) | npm | Projekt ^8.2.2 (rolldown 1.2.6) → Ziel ^8.3.1; aktuell stabil 8.3.5 (npm, 21.10.2026) | `manualChunks` wird in Slice 6 durch `codeSplitting.groups` ersetzt (Upstream `f6f0004`; Option in rolldown 1.2.6 belegt: `define-config-*.d.mts:864`), `--sourcemap` für SVC-15 wie Upstream |
| Syntax-Hervorhebung | `@lezer/highlight` | npm, pnpm `catalog:` + Override | Projekt 1.2.3 (`pnpm-lock.yaml:904`) → exakt 1.2.5 (npm, 28.09.2026; Upstream `bf7e03d`) | doppelte Kopien lassen die Färbung still verschwinden; Catalog seit pnpm 9.5, Projekt nutzt pnpm 11.9.0 |
| Icon-Set | `@iconify-json/catppuccin` | npm, JSON | 1.2.17 unverändert (npm, 14.09.2025, aktuell stabil) | nur Ladezeitpunkt ändert sich |
| Verzeichnisse | `dirs` | Crate | Projekt 6.0.0 → 7.0.0 (crates.io, 05.09.2026, aktuell stabil) | Fork nutzt nur `dirs::home_dir` (13 Stellen); Upstream-Bump `2992988` änderte nur Manifest/Lock, kein Code |
| Syscalls | `libc` | Crate | Projekt 0.2.189 → innerhalb `0.2` (Upstream 0.2.191; aktuell stabil 0.2.191, crates.io, 16.10.2026) | `renamex_np` + `RENAME_EXCL` in 0.2.189 belegt (`src/unix/bsd/apple/mod.rs:3325,4761`) |
| Zwischenablage | `objc2-app-kit` | Crate | 0.3.2 unverändert (crates.io, 04.10.2025, aktuell stabil) | + Feature `NSPasteboardItem`; `NSPasteboardTypeFileURL` in 0.3.2 vorhanden (`generated/NSPasteboard.rs:91`) |
| Zwischenablage | `objc2-foundation` | Crate | 0.3.2 unverändert (crates.io, 04.10.2025, aktuell stabil) | + Features `NSArray`, `NSURL` (in 0.3.2 definiert) |
| HTTP | `reqwest` | Crate | 0.12 bleibt; aktuell stabil 0.13.5 (crates.io, 08.09.2026) | Upstream-Wechsel kam mit `0a6e511` (out of scope), Features `rustls-tls` ändern sich in 0.13 (Q&A #14) |
| Suche | `grep-matcher` | Crate | 0.1 → entfernt | 0 Treffer im Quellcode (`f885631`) |
| Fenster-Sichtbarkeit | WKWebView Page Visibility | `document.visibilityState` | System-WebKit 22625.1.29.11.27 (Safari 27.0) auf macOS 27.0 (Entwicklungsrechner, gelesen 27.10.2026); Mindestziel macOS 13.0 | WebKit meldet `hidden` bei minimiert, verdeckt, anderem Space; im Fork beobachtet (`useTerminalSession.ts:571-573`, Test-Bridge-Gotcha) |
| Remote-Host | python3 | eingebettetes Helper-Programm | Host `litha-claude`: Python 3.13.5 / Linux 6.12.113; lokal (Tests): Python 3.9.6 | Rename auf leeres Verzeichnis ersetzt atomar (POSIX), `os.link` scheitert bei vorhandenem Ziel |
| CI | `actions/checkout` | GitHub Action | v7 (bestehend in `ci.yml`) | Input `persist-credentials` |

---

## Quality Attributes (NFRs)

### From Discovery → Technical Solution

| ID | Attribute | Target (from Discovery) | Technical Approach | Measure / Verify |
|----|-----------|-------------------------|--------------------|------------------|
| NFR-1 | Leerlauf-CPU | vorher/nachher gemessen mit 10 Tabs, davon ≥ 3 mit laufendem Agent (BR-15); Stück ohne Effekt wird benannt | SVC-9 (Stufen + Pause), SVC-10 (Watcher), SVC-11 (git status) | je Perf-Slice: 60 s Sampling der CPU von `terax` + WebContent-Prozess per `ps` im Sekundentakt, Median; Zahl der Git-Status-Läufe über einen Zähler-Wrapper um `__TAURI_INTERNALS__.invoke` in der Test-Bridge, der `git_status` UND `git_panel_snapshot` zählt (beide führen `git status` aus, `git/operations.rs:114`), dazu `fs_watch_*`; Messung mit sichtbarem, verdecktem und minimiertem Fenster; Zahlen im PR |
| NFR-2 | Startzeit | vorher/nachher bis erstes Terminal (BR-15); erstes Öffnen eines Editors darf kurz nachladen (BR-18) | SVC-14, SVC-15 | Startbytes beider Fenster aus `dist-graph.mjs` (deterministisch) plus Median aus 5 Starts der Dev-Instanz: Zeit vom Navigationsstart bis zum ersten Terminal-Element im DOM (Test-Bridge); Zahlen im PR |
| NFR-3 | Zuverlässigkeit Kopieren | keine halben Kopien sichtbar, auch bei Abbruch (BR-3); Teilfehler brechen nicht ab (BR-4) | Staging + No-Replace-Publish (SVC-1, SVC-3) | Rust-Tests: Fehler mitten im Ordner lässt kein Ziel und kein Staging zurück; Teilfehler-Batch; e2e lokal + SSH; mit `showHidden = true` und mit einer Whitelist-Regel in `.gitignore` findet weder Explorer-Baum, Explorer-Suche, Inhaltssuche, Unterordner-Menü, AI-Dateiliste, AI-`grep`/`glob` noch der Git-Status (Source-Control-Panel, Git-Dekoration, Änderungszahl) etwas im Staging (MIG-73, MIG-74, MIG-75, MIG-76, MIG-19; OB-21, OB-28, OB-29) |
| NFR-4 | Sicherheit | SSRF-Lücke geschlossen (BR-16); Ziel gejailt (BR-6) | SVC-13, VAL-2 | Upstream-IP-Tests + Fork-Assertions; Jail-Test |
| NFR-5 | Bundle/Leichtgewicht | ~7-8 MB Bundle, keine schwere neue Abhängigkeit (TERAX.md) | keine neue npm-Laufzeitabhängigkeit; Icon-Set aus dem Startpaket | `dist-budget.test.ts`; Testlauf-Dauer des Build-Tests im PR nennen |
| NFR-6 | Korrektheit Bedienung | ⌘S speichert zuverlässig (BR-17); ⌘V nur im Explorer (BR-8) | SVC-12, VAL-7 | Registry-Test; e2e: ⌘S auf `.cm-content` und auf `window`, Datei vorher/nachher; ⌘V im Terminal fügt weiter Text ein |
| NFR-7 | Ressourcen bei verborgenem Explorer | keine Explorer-Watches bei zugeklappter Sidebar (BR-11) | SVC-10 | e2e: Sidebar zu → Zähler `fs_watch_remove` deckt alle Explorer-Pfade; Datei extern ändern → Sidebar auf → Baum aktuell |
| NFR-8 | Hervorhebung nach Deps-Update | JS/TS gefärbt, genau eine Lezer-Kopie (BR-20) | SVC-16 | `dist-budget.test.ts` Lezer-Fall, `codeHighlight.test.ts`, `languageResolver.test.ts`; e2e `.ts`-Datei öffnen |

### Monitoring & Observability

> No requirement IDs — covered via NFR-n

| Metric | Type | Target | Alert |
|--------|------|--------|-------|
| `idle_cpu_percent` (terax + WebContent) | Median aus 60 Samples | nachher ≤ vorher je Perf-Slice | PR nennt Stück „ohne messbaren Effekt", wenn Differenz im Rauschen liegt (BR-15) |
| `git_status_runs_per_min` (Summe `git_status` + `git_panel_snapshot`; Fenster sichtbar, Sidebar zu, Git-Widgets aus) | Zähler | 0 ohne sichtbaren Konsumenten | Abweichung blockiert Slice 4 |
| `explorer_native_watches` (Sidebar zu) | Zähler | 0 Explorer-Pfade | Abweichung blockiert Slice 4 |
| `startup_preload_bytes` je Fenster | Gauge aus `dist-graph.mjs` | nachher < vorher | `dist-budget.test.ts` rot bei verbotenem Paket |
| `startup_to_first_terminal_ms` | Median aus 5 Starts | nachher ≤ vorher | PR nennt Abweichung |
| `lezer_highlight_copies` im Build | Zähler | genau 1 | `dist-budget.test.ts` rot |

---

## Risks & Assumptions

> No requirement IDs — context

### Assumptions

| Assumption | Technical Validation | Impact if Wrong |
|------------|---------------------|-----------------|
| WKWebView setzt `document.visibilityState` auf `hidden` bei minimiert, vollständig verdeckt und anderem Space | Fork-Kommentar und Verhalten `useTerminalSession.ts:571-576`, Test-Bridge-Gotcha (`document.hidden` bei verdecktem Fenster); e2e in Slice 2 mit allen drei Fällen | Fehlt ein Fall, pausiert dort nichts; Fallback: nativer Occlusion-Hinweis aus Rust (`on_window_event`) als zweite Quelle in SVC-7, ohne Konsumenten zu ändern |
| `fs_copy` hat nur die zwei Aufrufer Drop und Einfügen | Scan: 1 Aufrufer heute (`useExplorerFileDrop.ts:72`); Sweep `grep fs_copy` | weiterer Aufrufer bekäme Default `renameOnConflict = false` = heutiges Verhalten |
| Finder legt kopierte Elemente als Datei-URLs je Pasteboard-Item ab | Upstream-Implementierung `2723dc6` (macOS getestet); VAL-6-Test mit privatem Pasteboard; e2e mit echtem Finder-⌘C | Einfügen meldet UI-3 trotz Dateien; Fallback: zusätzlich veralteten Dateinamen-Typ lesen |
| `dirs` 7 ist für `home_dir` quellkompatibel | Upstream `2992988` änderte keinen Code; `cargo check` in Slice 7 | Anpassung an 13 Stellen in Slice 7 |
| `catalog:` + Override vereinheitlichen alle Lezer-Nutzer | `bf7e03d` + Build-Test | Test rot → betroffenes Paket auf kompatible Version heben |

### Risks & Mitigation

| Risk | Likelihood | Impact | Technical Mitigation | Fallback |
|------|------------|--------|---------------------|----------|
| BR-9-Pause bringt kaum Ersparnis, weil WebKit verdeckte Seiten ohnehin drosselt | Med | Low | Messung mit sichtbarem/verdecktem Fenster getrennt (NFR-1); Hauptgewinn liegt in BR-10 bei sichtbarem Fenster | Stück bleibt und wird im PR als „ohne messbaren Effekt" benannt (BR-15) |
| Dateisystem ohne No-Replace-Rename (exFAT, SMB) | Low | Med | exklusive Reservierung als Rückfall (MIG-14) | Element scheitert mit Grund, nie Überschreiben |
| SSH: Staging-Rest `.terax-copy-*` nach Verbindungsabbruch (lokal nach Absturz) | Med | Low | versteckter Name mit festem Präfix, nie unter dem Zielnamen; Aufräumen im Erfolgs- und Fehlerpfad; Prädikat an jeder Aufzählungs-Primitive (SEC-4; MIG-73, MIG-74, MIG-75, MIG-76, MIG-19) | Rest liegt nur auf der Platte; keine App-Aufzählung mit Wurzel außerhalb zeigt ihn; User löscht ihn im Terminal (Q&A #7, #28, #31) |
| SSH ohne Hardlink-Unterstützung am Ziel: Restfenster zwischen Prüfen und Umbenennen | Low | Low | Hardlink-Weg ist Normalfall (ext4/xfs/APFS) | Restfenster dokumentiert; Kollision führt höchstens zu Fehler des Elements |
| Migration von 6 Sichtbarkeits-Stellen trifft Terminal-Kern und Poller | Med | Med | rein mechanisch (gleiche Semantik), Guard-Test, INV-23 in der QA-Matrix | einzelne Stelle zurück auf eigenen Listener mit Begründung in der Guard-Allowlist |
| Icon-Nachladen flackert oder verschiebt Layout | Med | Low | Platzhalter gleicher Größe, Einblenden über `terax-icon-in`, Laden beim ersten Bedarf einmal je Sitzung | Icon-Chunk per `modulepreload` nach dem ersten Frame vorwärmen |
| `dist-budget.test.ts` verlängert `pnpm test` spürbar | High | Low | ein Build je Lauf in `beforeAll`, Temp-Verzeichnis | Testdauer im PR nennen; bei > 2 min eigenes Script `test:dist` mit CI-Schritt |
| Deps-Update bricht WKWebView-Verhalten (tauri 2.12) | Low | High | volle Gates + e2e-Rundgang aller Slices nach Slice 7 | Lockfile auf Stand vor Slice 7 zurück, Deps einzeln heben |
| Rail-Badge oder Widgets zeigen veralteten Stand | Low | Med | Badge und Widgets zählen als live, solange sichtbar (Q&A #5) | – |
| ⌘V im leeren Ordner wird vom Leer-Baum-Abbruch verschluckt | Med | Low | ⌘V-Prüfung vor der Leer-Prüfung (MIG-22, VAL-7) | – |
| Symlink-Verhalten lokal ändert sich (Link statt Inhalt) | Low | Low | Finder-Verhalten, BR-21 dokumentiert | – |

---

## Technology Decisions

> No requirement IDs — context

### Stack Choices

| Area | Technology | Rationale |
|------|------------|-----------|
| Kopier-Atomizität lokal | No-Replace-Rename aus Staging im Zielordner | gleiche Partition garantiert atomares Umbenennen; einzige Form, die BR-3 und „nie überschreiben" zugleich erfüllt |
| Kopier-Atomizität SSH | Staging im Remote-Zielordner + Helper-Op `publish` | nutzt das bestehende Helper-Protokoll; Reservierung/Hardlink schließt das TOCTOU-Fenster aus dem Scan |
| Zwischenablage | NSPasteboard über `objc2-app-kit` | bereits im Fork für die Schreibseite; keine neue Crate |
| Fenster-Sichtbarkeit | `document.visibilityState` als einzige Quelle | deckt alle drei BR-9-Fälle in WebKit ab, keine Rust-Änderung |
| Lazy-Laden Icon-Set | dynamischer `import()` für Daten (Schule B, K4-Hinweis) | Icon-Set ist Daten, keine Komponente; passt zum etablierten Muster `chat-code-lezer.ts` |
| Build-Budget | Test auf gebautem Output | Quelltest allein übersieht Chunk-Zuordnung (Upstream-Beleg in `dist-budget.test.ts`) |

### Trade-offs

| Decision | Pro | Con | Mitigation |
|----------|-----|-----|------------|
| Upstream-Struktur (`fs/copy.rs`, `watchRegistry.ts`, `statusConsumers.ts`, `iconEngine.ts`) übernehmen statt Fork-eigener Namen | künftige Syncs mit weniger Konflikten | mehr bewegte Dateien in dieser Welle | Migration Map dateigenau |
| Sichtbarkeit statt Fokus (BR-9) | Agent-Spinner frieren nicht neben dem Browser ein | geringere Ersparnis als Upstream | Messung NFR-1 |
| Einzelauswahl nach Einfügen (Q&A #4) | kein Umbau der Auswahl (Mehrfachauswahl out of scope) | nur das erste neue Element markiert | Zielordner aufgeklappt, alle neuen Elemente sichtbar |
| `reqwest` bleibt 0.12 | keine Änderung am Netzwerk-Kern | Abstand zu Upstream | Wechsel mit dem PTY-/Net-Umbau bei Ghostty-Wiedervorlage |
| Einfügen nur macOS | kein ungetesteter Linux/Windows-Code | Linux/Windows-Builds melden Fehler beim Einfügen | Fehlertext eindeutig; Drop funktioniert dort weiter |

---

## Anti-Slop Dispositions

> No requirement IDs — context

| # | class | subject | decision | Rationale | guard_obligation | Implementation |
|---|-------|---------|----------|-----------|------------------|----------------|
| 1 | k2_knowledge_copy | „Fenster ist aktiv/sichtbar" (Slices 2, 5) | consolidate | Vorschlag der Linse (Modus autonom): neuer Zustand wird Owner, gleichbedeutende Altstellen werden migriert, fokusgekoppelte Stellen (`rendererPool.ts`, `useWindowFocus.ts`) bleiben bewusst | -- | MIG-25 bis MIG-28, MIG-35 bis MIG-39, MIG-10 (Poll-Guard); zusätzlich Quelltext-Guard `src/lib/windowVisibility.guard.test.ts` (MIG-27) |
| 2 | k3_stale_workaround | `ip_kind` ohne eingebettete IPv4 | dismantle | Vorschlag der Linse: alte Funktion und Enum im selben Slice entfernen, Upstream-Fassung übernehmen; alte Assertions bleiben als Test (INV-6) | -- | MIG-5, MIG-6 |
| 3 | k2_knowledge_copy | Kopier-Benennung bei Konflikt (lokal + SSH) | consolidate | Vorschlag der Linse: eine reine Benennungsfunktion, SSH nutzt dieselbe; das remote TOCTOU-Fenster wird durch API-3 geschlossen statt hingenommen | -- | MIG-14 (`copy_name`), MIG-19 |

- Linse vollständig gelaufen (`codebase-scan.md`, vier Fragen je Deliverable); kein Linsen-Ausfall.
- K1 (Drop und Einfügen schreiben ins Ziel) und K4 (Lazy-Laden) ohne Fund laut Linse; das K1-Risiko ist umgesetzt, indem beide Wege API-2 rufen (SVC-5, SVC-6, MIG-23), der K4-Hinweis in SVC-14 (Icon-Set als Daten über dynamischen Import).
- Eigener Fund während der Architektur, sofort vermieden: Upstream `mediaPreview.ts` brächte eine zweite Endungs-Liste neben `binaryPreview.ts`; übernommen wird nur die Wiedergabe-Bindung (MIG-29).

---

## Open Questions

> No requirement IDs — context

| # | Question | Options | Recommended | Decision |
|---|----------|---------|-------------|----------|
| 1 | Lokales `main` trackt `upstream/main` (Discovery OQ 2) | A) auf `origin/main` umstellen B) lassen | A | – (User-Entscheidung außerhalb dieses Features) |
| 2 | Durchsicht der automatischen fachlichen Entscheidungen Q&A #4, #5, #7, #10, #11, #19 durch den PM | A) bestätigen B) einzelne zurückdrehen | A | – (Modus autonom; Build folgt den Entscheidungen bis zum Widerspruch) |

---

## Context & Research

> No requirement IDs — context

### Discovery-Abdeckung (Feature Mapping)

| Discovery-ID | Technische Lösung |
|--------------|-------------------|
| FL-1, FL-2, FL-3, TG-1, TG-2 | UI-1/UI-2 → SVC-6 → SVC-5 (`pasteTargetDir`, VAL-7) → API-1 (SVC-4) → API-2 (SVC-1 lokal / SVC-3 SSH) |
| FL-4 | SVC-5 Neu-Einlesen + SVC-6 Zielordner aufklappen, erstes `created` auswählen (Q&A #4) |
| FL-5, TG-3 | SVC-6 Drop über API-2 mit `renameOnConflict`, Teilfehler UI-4 (MIG-23) |
| FL-6, FL-7, TG-4 | SVC-7 → SVC-9 (CSS-Pause) + SVC-8 (Media pausieren, kein Auto-Resume) |
| FL-8, FL-9, TG-5 | SVC-10 (disarm/arm + Neu-Einlesen) + SVC-11 (live/ruhen, einmal auffrischen) |
| TG-6 | SVC-12 |
| EP-1 | API-1 liefert `[]` → UI-3 |
| EP-2 | `CopyResult.failed` → UI-4 (BR-4) |
| EP-3 | Rejection von API-1/API-2 → UI-5, Neu-Einlesen falls schon kopiert (SVC-5) |
| EP-4 | `isCurrent()` in SVC-5 verwirft Ergebnis |
| EP-5 | VAL-7 (keine Wurzel → nichts) |
| UI-1, UI-2 | SVC-6, VAL-7, MIG-22 |
| UI-3, UI-4, UI-5 | SVC-5 (`reportCopyFailures`, Toast-Texte unverändert aus der Discovery) |
| UI-6 | SVC-6 (Einzelauswahl, Q&A #4) |
| UI-7 | SVC-6, MIG-23 |
| UI-8 | SVC-9, MIG-40, MIG-41 |
| UI-9 | SVC-8, MIG-29 bis MIG-34 |
| UI-10 | SVC-16, MIG-70 (`getVersion()` liest `tauri.conf.json`) |
| ST-1, ST-2, ST-3, ST-4, ST-5 | SVC-6 Busy-Sperre + Ergebnis-Auswertung; TR-1 bis TR-6 entsprechen den Zweigen im Business Logic Flow |
| ST-6, ST-7, TR-7, TR-8 | SVC-7 (`data-window-hidden`) |
| ST-8, ST-9, TR-9, TR-10 | SVC-10 (`visible` = Ansicht `explorer` und nicht eingeklappt) |
| BR-1, BR-2, DF-3 | SVC-2 (eine Benennung für lokal und SSH), VAL-4 |
| BR-3 | SVC-1 Staging + No-Replace (MIG-14), SVC-3 + API-3 (MIG-19), Prädikat an jeder Aufzählungs-Primitive (SEC-4; MIG-73, MIG-74, MIG-75, MIG-76, MIG-19), NFR-3 |
| BR-4, DF-2 | `CopyResult` (API-2, DTOs) |
| BR-5 | SVC-5 `pasteTargetDir` |
| BR-6 | VAL-2, SEC-2 |
| BR-7 | VAL-3 (lokal; SSH entfällt technisch) |
| BR-8 | VAL-7 |
| BR-9 | SVC-7 (nur Sichtbarkeit, kein Fokus), SVC-9 |
| BR-10 | SVC-9, MIG-40, MIG-41 |
| BR-11 | SVC-10, NFR-7 |
| BR-12 | SVC-8 |
| BR-13 | SVC-11 (inkl. Rail-Badge und `line-changes`, Q&A #5) |
| BR-14 | Out of Scope; keine Ghostty-Datei wird berührt (Constraints) |
| BR-15 | NFR-1, NFR-2, Monitoring-Tabelle |
| BR-16 | SVC-13 (inkl. Fork-Erweiterung `64:ff9b:1::/48`), VAL-8, API-4 (Klammer-Entfernung), MIG-5, MIG-6 |
| BR-17 | SVC-12, VAL-10 |
| BR-18 | SVC-14, SVC-15, MIG-63, MIG-64 |
| BR-19 | SVC-16, MIG-1, MIG-2, MIG-67, MIG-70 |
| BR-20 | SVC-16, SVC-15, MIG-68, MIG-71, MIG-72, NFR-8 |
| BR-21 | SVC-1, SEC-5 (Q&A #10) |
| DF-1 | VAL-6, API-1 |
| Compliance: CI | SEC-8, MIG-4 |
| Clean Picks, Test-Commits | SVC-17, MIG-3, MIG-11 bis MIG-13 |

### Scanner-NEW → Zielpfad

| Scanner-Empfehlung (NEW) | Zielpfad |
|--------------------------|----------|
| Gemeinsamer Fenster-Sichtbarkeits-Zustand | `src/lib/windowVisibility.ts` (MIG-25) |
| `fs_clipboard_paths`-Command | `src-tauri/src/modules/fs/clipboard.rs` (MIG-16) |
| Reine Benennungsfunktion `copy_name` | `src-tauri/src/modules/fs/copy.rs` (MIG-14) |

---

## Research Log

> No requirement IDs — context

| Date | Area | Finding |
|------|------|---------|
| 2026-10-27 | Git | `4cfc202`: `editor.save` in Registry, `save()` am Handle, Freischaltung wie `editor.undo`; Fork hat kein `shortcuts.test.ts` |
| 2026-10-27 | Git | `2723dc6`: `fs_copy` async mit `CopyResult`, `copy_name`, Staging + `rename_no_replace` (macOS `renamex_np`/`RENAME_EXCL`, Linux `renameat2`); `rename_no_replace` stammt aus der übersprungenen Batch-Härtung und fehlt im Fork |
| 2026-10-27 | Git | `2723dc6`: `fs_clipboard_paths` liest `NSPasteboardTypeFileURL`, löst Dateireferenz-URLs über `filePathURL` auf, Main-Thread + 5-s-Timeout; Windows/Linux-Zweige nicht übernommen |
| 2026-10-27 | Git | `5502f82`: `bindMediaPlayback` pausiert und nimmt Play zurück; `mediaPreviewKind` doppelt die Fork-Klassifikation `binaryPreview.ts` |
| 2026-10-27 | Git | `f6f0004`: `windowActivity.ts` koppelt an Fokus + Sichtbarkeit + Ghostty-Präsentationsfeed; `statusConsumers.ts` behandelt Rail-Badge als nicht live; `watchRegistry.ts` mit arm/disarm; `motionBudget.test.ts`, `dist-budget.test.ts` |
| 2026-10-27 | Git | `11343a1`: `net/ip.rs` (263 Z., nur `std`) + Test für eingebettete IPv4-Literale; strenger als Fork (Dokumentationsbereiche, alles außerhalb `2000::/3` privat) |
| 2026-10-27 | Git | `bf7e03d`: `catalog:` `@lezer/highlight` 1.2.5 + Override; Build-Test über Sourcemaps zählt Lezer-Kopien |
| 2026-10-27 | Git | `reqwest` 0.13 kam upstream mit `0a6e511` (out of scope); `dirs` 7 per `2992988` ohne Codeänderung; `getrandom` ist im Fork nur transitiv |
| 2026-10-27 | Codebase | `SidebarRail` (Badge) liegt im Sidebar-Panel (`App.tsx:1617-1620`) → bei zugeklappter Sidebar unsichtbar; `LineChangesWidget` liest ebenfalls `ctx.sourceControl` (`GitWidgets.tsx:102-103`), fehlt in BR-13 |
| 2026-10-27 | Codebase | Standard-Statusleiste zeigt `git-branch` und `git-sync` (`layout.ts:44-51`) → Git-Status bleibt per Default live; Zen-Modus blendet die Statusleiste aus (`App.tsx:1669`) |
| 2026-10-27 | Codebase | Sync-Commands laufen in Tauri auf dem Main-Thread; Fork-`fs_copy` ist sync (`mutate.rs:207`) → großer Drop blockiert heute die UI |
| 2026-10-27 | Codebase | SSH-Helper ist python3 und wird je Aufruf mitgeschickt (`ssh.rs:783`) → neue Op ohne Versionsproblem; lokales python3-Testmuster vorhanden (`ssh.rs:1417`) |
| 2026-10-27 | Codebase | `handleKeyDown` bricht bei leerem Baum ab (`FileExplorer.tsx:378`) → ⌘V muss davor geprüft werden |
| 2026-10-27 | Codebase | `useTerminalSession.ts:571-573` dokumentiert: `document.hidden` bei minimiert, verdeckt, anderem Space |
| 2026-10-27 | Registry | npm: react 19.3.1, vite 8.3.5, @tauri-apps/api 2.12.4, @tauri-apps/cli 2.12.4, @lezer/highlight 1.2.5, @iconify-json/catppuccin 1.2.17; crates.io: tauri 2.12.5, dirs 7.0.0, libc 0.2.191, objc2-app-kit 0.3.2, objc2-foundation 0.3.2, reqwest 0.13.5 |
| 2026-10-27 | Codebase | `libc` 0.2.189 (Lock) enthält `renamex_np` + `RENAME_EXCL`; `objc2-app-kit` 0.3.2 enthält `NSPasteboardTypeFileURL`, `objc2-foundation` 0.3.2 die Features `NSArray`, `NSURL` |
| 2026-10-27 | Host | `litha-claude`: Python 3.13.5, Linux 6.12.113; lokal Python 3.9.6, macOS 27.0; `minimumSystemVersion` 13.0 |
| 2026-10-27 | Gate 1 | Befunde B1-B5: Klammer-Entfernung vor dem IP-Parse fehlt im Fork (`net.rs:90`, `:281`, kam mit `0a6e511`); Upstream `ip.rs` ignoriert eingebettete IPv4 in `64:ff9b:1::/48`; Staging-Ordner bei `showHidden` sichtbar; gebautes Startpaket enthält AI-SDK/`zod` wegen `manualChunks`; `eager-budget.test.ts` prüft nur den Quellgraphen. Eingearbeitet in Q&A #26 bis #30 |
| 2026-10-27 | Gate 1 Delta | D-1/N-4: Staging-Präfix an allen `show_hidden`-Stellen (Baum, Unterordner, Suche, Dateiliste, SSH-Helper), siehe `gates/DECISION-gate1-staging-search.md`; X-A bis X-D: Upstream-Assertion `64:ff9b:1::808:808` wird Loopback, Redirect-Prüfung als reine Funktion `redirect_decision`, `usePresence.ts` ohne rAF, Pinning-Anker `net.rs:158-163` |
| 2026-10-27 | Gate 1 Delta 2 | E-1: Git-Status listet `? .terax-copy-x/report.pdf` (`operations.rs:137-153`, `parser.rs:61-63`) → MIG-75. Weitere App-Aufzählungen per grep geprüft: `fs_read_dir` (Explorer `useFileTree.ts:133`, Block-Terminal `pathComplete.ts:43`, AI `native.ts:200`) und `list_subdirs` (`CwdBreadcrumb.tsx:187`) über MIG-73; `fs_search` (`ExplorerSearch.tsx:115`) und `fs_list_files` (`useWorkspaceFiles.ts:36`) über MIG-74; SSH-Zweige über Helper (MIG-19); `fs_grep_interactive` (`useContentSearch.ts:31`) auf SSH über Helper-`grep` (`grep.rs:278`); AI-`grep`/`glob` (`native.ts:213,224`) auf SSH nicht verfügbar (`native.ts:158-166` `guardSsh`); lokal MIG-76 |
| 2026-10-27 | Gate 1 Delta 3 | F-1: `ignore 0.4.32` `.hidden(true)` greift nur ohne Whitelist-Treffer (`dir.rs:490`), Probe mit `.gitignore` `*`/`!*/`/`!*.txt` → MIG-76, Sweep auf Aufzählungs-Primitive umgestellt; F-3: Git-Status filtert nur `? ` (MIG-75), Invariante Panel-Commit; F-2: Geltungsbereich Wurzel außerhalb; siehe `gates/DECISION-gate1-staging-search-2.md` |
| 2026-10-27 | Codebase | rolldown 1.2.6 (Vite 8.2.2 im Fork) kennt `codeSplitting` (`define-config-*.d.mts:864`); Upstream-Strategie aus `f6f0004` ist damit schon vor dem Deps-Update in Slice 7 umsetzbar; SSH-Helper `read_dir` `ssh.rs:294`, lokaler Filter `fs/tree.rs:204` |
| 2026-10-27 | Web | Websuche fand für tauri 2.12, dirs 7, lezer 1.2.5 keine Treffer (Index-Lücke), daher Registry-APIs direkt; Tauri-Main-Thread-Regel für Sync-Commands über tauri-macros-Changelog und Drittprojekt belegt; Electron-Doku: macOS-Sichtbarkeit spiegelt Verdeckung, WebKit Bug 107494 (Occlusion → Sichtbarkeit) |

---

## Q&A Log

> No requirement IDs — context

| # | Question | Recommendation | Answer | Alternative & consequence | Mode | Wirkung |
|---|----------|----------------|--------|---------------------------|------|---------|
| 1 | Wie tief soll die Architektur werden: kurz, Standard oder detailliert? | Standard, weil die Discovery Slices und Regeln schon festlegt und die Architektur vor allem Dateien, Schnittstellen und Prüfwege braucht | Standard mit dateigenauer Migration Map | Detailliert: mehr Text ohne neue Entscheidungen | automatisch | technisch |
| 2 | Im Code gibt es acht eigene Kopien von „Fenster aktiv/sichtbar" mit drei verschiedenen Bedeutungen. Sollen Slices 2/5 nur einen neuen Zustand bekommen, oder wird dieser neue Zustand der eine Owner, auf den die gleichbedeutenden Altstellen umziehen? | Konsolidieren (Vorschlag der Linse): `src/lib/windowVisibility.ts` wird Owner, die sechs Stellen mit reiner Sichtbarkeits-Semantik ziehen in Slice 2 um, `rendererPool.ts` (Fokus + Sichtbarkeit für Cursor-Blinken) und `useWindowFocus.ts` (Tauri-Fokus für Benachrichtigungen) bleiben bewusst; ein Quelltext-Guard verhindert neue Kopien | konsolidieren wie empfohlen (Anti-Slop #1) | Nur neuer Zustand: kleinerer Slice 2, aber eine neunte Kopie und weiter auseinanderlaufende Definitionen | automatisch | technisch |
| 3 | Woher kommt das Signal „Fenster unsichtbar": nur `document.visibilityState`, oder zusätzlich ein nativer Verdeckungs-Hinweis aus Rust wie Upstream? | Nur `document.visibilityState`: WebKit meldet minimiert, verdeckt und anderen Space bereits (Fork-Beleg `useTerminalSession.ts:571`); kein neuer Rust-Code | nur `document.visibilityState`; e2e prüft alle drei Fälle, nativer Hinweis bleibt Fallback | Nativer Hinweis: mehr Code im Rust-Fensterhandler ohne belegten Mehrwert | automatisch | technisch |
| 4 | Die Discovery verlangt, nach dem Einfügen ALLE neuen Elemente zu markieren; der Explorer kann aber nur ein Element gleichzeitig auswählen, und Mehrfachauswahl ist ausgeschlossen. Was soll nach dem Einfügen passieren? | Zielordner aufklappen, das erste neu angelegte Element auswählen und in Sicht scrollen; die übrigen sind im aufgeklappten Ordner direkt daneben sichtbar | erstes Element auswählen, Zielordner aufgeklappt (discovery.md FL-4, UI-6, ST-3, TR-3 nachgezogen) | Eigene Hervorhebung aller neuen Zeilen: neues UI-Muster neben der Auswahl, mehr Umfang; Mehrfachauswahl: ausdrücklich out of scope | automatisch | fachlich |
| 5 | Git-Status soll nur laufen, solange jemand ihn anzeigt. Zwei Anzeigen fehlen in der Discovery-Liste: die Zahl geänderter Dateien an der Sidebar-Leiste und das Statusleisten-Widget „Line changes". Zählen sie mit? | Ja, beide: das Badge ist sichtbar, solange die Sidebar offen ist, das Widget, solange es eingeblendet ist; sonst zeigten sie veraltete Zahlen. Statusleisten-Widgets zählen nur außerhalb des Zen-Modus | beide zählen (discovery.md BR-13 nachgezogen) | Wie Upstream Badge nicht mitzählen: bei offener Sidebar ohne Git-Farben könnte die Zahl veraltet sein; Widget nicht mitzählen: Widget zeigte alte Zeilenzahlen | automatisch | fachlich |
| 6 | Woran erkennt der Explorer, dass er sichtbar ist, obwohl er bei zugeklappter Sidebar gemountet bleibt? | Sichtbar = Sidebar-Ansicht `explorer` UND Sidebar nicht eingeklappt; dafür spiegelt `useSidebarPanel` den eingeklappten Zustand als React-Zustand (Upstream-Muster) | wie empfohlen | Explorer beim Einklappen unmounten: verliert Baum- und Auswahlzustand, Flackern beim Aufklappen | automatisch | technisch |
| 7 | Die Discovery verlangt, dass nie eine halbe Kopie sichtbar wird, auch per SSH. Remote gibt es heute kein atomares „umbenennen ohne zu ersetzen“. Wie lösen wir das? | Je Element zuerst in einen versteckten Ordner `.terax-copy-…` im Remote-Zielordner hochladen, dann über eine neue Helper-Operation unter dem freien Namen veröffentlichen, die nie ersetzt (Ordner: Namen exklusiv reservieren und tauschen; Dateien: exklusiv verlinken). Folge für den User: bricht die SSH-Verbindung mitten im Upload ab, kann ein versteckter `.terax-copy-…`-Ordner auf dem Host liegen bleiben; keine App-Aufzählung, deren Wurzel außerhalb liegt, zeigt ihn (Baum, Suche, Inhaltssuche, Unterordner-Menü, Dateiliste, Source-Control-Panel und Git-Dekoration), auch nicht mit „versteckte Dateien zeigen“ und auch nicht bei einer Whitelist-Regel in `.gitignore`; wechselt der User selbst hinein, zeigt die App ihn wie das Terminal (Q&A #28), unter dem echten Namen erscheint nie etwas Halbes | wie empfohlen | Direkt ins Ziel hochladen wie heute: bei Abbruch liegt eine halbe Kopie unter dem echten Namen (verletzt BR-3); nur prüfen-dann-umbenennen: kleines Fenster, in dem ein gleichzeitig angelegtes Element ersetzt werden könnte | automatisch | fachlich |
| 8 | Wie wird lokal ohne Überschreiben veröffentlicht? | No-Replace-Rename des Betriebssystems (macOS `RENAME_EXCL`, Linux `RENAME_NOREPLACE`), Rückfall auf exklusive Reservierung für Dateisysteme ohne Unterstützung | wie empfohlen | Prüfen-dann-umbenennen: Wettlaufsituation mit Überschreib-Risiko | automatisch | technisch |
| 9 | Bleibt `fs_copy` in `mutate.rs` und synchron? | Nach `fs/copy.rs` verschieben (Upstream-Form) und async mit blockierender Arbeit außerhalb des Main-Threads; Sync-Commands laufen in Tauri auf dem Main-Thread und frieren bei großen Kopien die UI ein | wie empfohlen | In `mutate.rs` lassen: mehr Konflikte bei künftigen Syncs; synchron lassen: UI-Hänger bei großen Ordnern und SSH-Uploads | automatisch | technisch |
| 10 | Wie werden Symlinks unter den kopierten Elementen behandelt? Heute kopiert der lokale Drop den Inhalt des Link-Ziels | Lokal wie der Finder und Upstream: Symlinks als Symlinks kopieren, nie verfolgen (keine Endlosschleifen, kein Mitkopieren fremder Bäume); SSH wie heute (Datei-Symlinks als Inhalt, Ordner-Symlinks scheitern je Element), weil der Helper keine Remote-Links anlegt | wie empfohlen (discovery.md BR-21 ergänzt) | Lokal weiter verfolgen: Ordner-Symlink-Schleifen enden erst am Tiefenlimit, Verhalten weicht vom Finder ab | automatisch | fachlich |
| 11 | Terax baut auch für Linux/Windows. Soll Einfügen aus der Zwischenablage dort mitkommen? | Nein: nur macOS (Finder), andere Plattformen melden `clipboard file paste is only supported on macOS`; Windows/Linux-Fixes sind out of scope und dort nicht testbar | nur macOS | Upstream-Zweige für Windows (`CF_HDROP`) und Linux (GTK) übernehmen: zusätzliche Abhängigkeit `gtk` und ungetesteter Code | automatisch | fachlich |
| 12 | Was fehlt für den Lazy-Start noch? | Ursprüngliche Empfehlung „AI-SDK und Editor sind schon lazy, neu nur Icon-Set und Build-Test“ ist durch Gate 1 widerlegt (gebautes Startpaket enthält das AI-SDK); korrigiert in Q&A #29: Slice 6 übernimmt die Upstream-Chunk-Strategie, das Icon-Set wird nachgeladen, der Build-Test prüft auch `zod` | korrigiert nach Q&A #29 | Bei der alten Aussage bleiben: Build-Test bliebe rot bzw. BR-18 unerfüllt | automatisch | technisch |
| 13 | `bf7e03d` legt in `pnpm-workspace.yaml` einen `overrides:`-Block an, der Fork hat schon einen. Wie zusammenführen? | `catalog:`-Block neu, den Lezer-Override als weiteren Schlüssel IN den bestehenden `overrides:`-Block, Kommentarzeile dazu; bestehende Pins unverändert | wie empfohlen | Zweiter `overrides:`-Block: ungültiges bzw. überschriebenes YAML, Pins gingen verloren | automatisch | technisch |
| 14 | Upstream nutzt `reqwest` 0.13. Mitziehen? | Nein, bei 0.12 bleiben: der Wechsel kam upstream mit dem PTY-/Net-Umbau `0a6e511` (out of scope) und ändert TLS-Features | 0.12 bleibt | 0.13 jetzt: Umbau am AI-Netzwerkweg ohne Bedarf | automatisch | technisch |
| 15 | Auf welche Stände werden die Deps gehoben? | Upstream-Lock `640e8b2` als Untergrenze der Bereiche; pnpm/cargo lösen innerhalb der Bereiche auf, `minimumReleaseAge` bleibt die Bremse | wie empfohlen | Exakt Upstream-Lock pinnen: verliert Patch-Fixes seit 16.10. | automatisch | technisch |
| 16 | Upstreams Media-Fix bringt eine eigene Endungs-Liste mit. Übernehmen? | Nein: Fork klassifiziert schon über `binaryPreview.ts`; nur die Wiedergabe-Bindung übernehmen und um „Fenster unsichtbar" erweitern; ausgeblendet wird nur bei inaktivem Tab | wie empfohlen | Upstream 1:1: zwei Endungs-Listen, die auseinanderlaufen | automatisch | technisch |
| 17 | Was passiert mit der alten SSRF-Prüffunktion und ihren Tests? | Funktion und Enum entfernen (Vorschlag der Linse), alte Assertions als Test behalten, Upstream-Test ergänzen | wie empfohlen (Anti-Slop #2) | Alte Funktion daneben behalten: zwei Klassifikationen | automatisch | technisch |
| 18 | Wo lebt die Finder-Benennung für lokal und SSH? | Eine reine Funktion in `copy.rs`, beide Wege nutzen sie (Vorschlag der Linse) | wie empfohlen (Anti-Slop #3) | Zwei Kopien: BR-2 könnte zwischen lokal und SSH abweichen | automatisch | technisch |
| 19 | Der Scan listet 22 bestehende Verhaltensweisen, die bleiben müssen. Neun davon ändert das Feature bewusst (Kopie statt Abbruch bei Namensgleichheit lokal und SSH, neuer Fehler-Toast beim Drop, Medien stoppen beim Tab-Wechsel, Watcher und Git-Status ruhen bei verdeckter Anzeige, Einzelauswahl nach Einfügen, Animationen in Stufen, Icons laden nach). Entscheidung zur Durchsicht: Lesart A „das Verhalten muss bleiben" würde das Feature verbieten; Lesart B „der schützende Kern bleibt" (nie überschreiben, gleiche Zielregel, gleiche Icons nach dem Laden, Animationen bei sichtbarem Fenster) | Liste vollständig übernehmen, Feature-Scope unverändert, bei den neun Einträgen den schützenden Kern als Invariante formulieren (Lesart B); dazu INV-23 für die umgezogenen Sichtbarkeits-Stellen | übernommen nach Lesart B, INV-1 bis INV-23 | Lesart A: Feature in Teilen nicht baubar; Einträge streichen: Schutz vor Rückschritten ginge verloren | automatisch | fachlich |
| 20 | Wann greift ⌘S auf App-Ebene? | Nur bei aktivem Editor-Tab, gleiche Freischaltung wie `editor.undo`; nutzt den bestehenden Speicherweg | wie empfohlen | Immer: ⌘S in Terminal-Tabs würde abgefangen, ohne etwas zu tun | automatisch | technisch |
| 21 | Gilt `persist-credentials: false` auch für `release.yml` und andere Workflows? | Nein, nur `ci.yml` wie `e8f9fcd`; Release-Workflow braucht ggf. Schreibrechte und ist nicht Teil des Picks | nur `ci.yml` | Alle Workflows: Risiko, den Release-Ablauf zu brechen | automatisch | technisch |
| 22 | Wie werden Leerlauf-CPU und Startzeit gemessen, ohne Telemetrie einzubauen? | `ps`-Sampling und Invoke-Zähler über die Test-Bridge, Startbytes aus `dist-graph.mjs`, Median aus 5 Starts der isolierten Dev-Instanz | wie empfohlen (NFR-1, NFR-2) | Perf-Marker im Produktcode: Telemetrie-ähnlicher Code ohne Nutzen für den User | automatisch | technisch |
| 23 | Wann kommt der Upstream-Test für den alten Icon-Resolver (`d766567`) dran? | In Slice 1 als Aufnahme des heutigen Verhaltens, in Slice 6 auf die nachladende API umgeschrieben mit gleichen erwarteten Icons | wie empfohlen | Erst in Slice 6: kein Vorher-Vergleich für INV-20 | automatisch | technisch |
| 24 | Sollen auch JS-gesteuerte Animationen pausieren? | Nein, UI-8 nennt CSS-Animationen; `motion` ist keine Abhängigkeit; `usePresence.ts` hält Knoten per `setTimeout` (`:13-24`) für CSS-Keyframes gemountet (`:5-9`), die Bewegung selbst ist CSS und pausiert mit SVC-9 | nur CSS | JS-Seite einbeziehen: zusätzlicher Umbau ohne messbaren Effekt | automatisch | technisch |
| 25 | Braucht `fs_copy` Grenzen für die Zahl der Quellen und die Ordnertiefe? | Ja, wie Upstream: schützt vor Stapelüberlauf und endlosen Läufen; konkrete Werte über die Gate-1-Auflagen | wie empfohlen (VAL-5) | Ohne Grenzen: tiefe Bäume oder riesige Auswahl blockieren lange | automatisch | technisch |
| 26 | Die SSRF-Tests aus Upstream übergeben IPv6-Literale in Klammern (`[::ffff:127.0.0.1]`), so wie die URL-Bibliothek sie liefert; der Fork parst den Host ohne Klammer-Entfernung, dadurch wird ein solches Ziel nie als IP erkannt (Auflösung scheitert mit DNS-Fehler, bei Weiterleitungen mit Opt-in wird gar nicht geprüft). Übernehmen wir die Klammer-Entfernung aus dem sonst ausgeschlossenen Commit `0a6e511`? | Ja, nur diesen Hunk an `net.rs:90` und `net.rs:281`, mit Redirect-Testfall | übernommen (Entscheidung des Dirigenten) | Nicht übernehmen: Upstream-Tests laufen nicht, eine Weiterleitung auf `[::ffff:169.254.169.254]` bliebe mit Opt-in ungeprüft. Folge der Übernahme: IPv6-Literal-URLs (z.B. `http://[::1]:11434` für ein lokales Modell) werden klassifiziert und mit Opt-in erreichbar, statt wie heute mit DNS-Fehler abgewiesen zu werden | automatisch | fachlich |
| 27 | Upstream wertet eingebettete IPv4 nur im NAT64-Standardpräfix `64:ff9b::/96` aus; im lokalen NAT64-Präfix `64:ff9b:1::/48` gilt jede Adresse nur als privat und wäre mit Opt-in erreichbar, auch wenn sie die Metadaten-Adresse trägt. BR-16 verspricht die Auswertung der eingebetteten IPv4. Folgen wir Upstream oder erweitern wir? | Erweitern (Fork-Abweichung von Upstream): eingebettete IPv4 an den RFC-6052-Positionen aller in den /48-Block passenden Prefix-Längen auswerten, u-Oktett überspringen, gefährlichste Klasse gewinnt; BR-16 bleibt | erweitert (Entscheidung des Dirigenten), Tests `64:ff9b:1::a9fe:a9fe` → BlockedMetadata, `64:ff9b:1::7f00:1` → Loopback | Upstream 1:1: BR-16 müsste auf „`64:ff9b:1::/48` nur privat“ abgeschwächt werden, Restrisiko Metadaten-Zugriff mit Opt-in. Folge der Erweiterung: Adressen in `64:ff9b:1::/48` werden nie öffentlich und je nach Inhalt als Loopback/Metadaten eingestuft; Fork weicht hier von Upstream ab | automatisch | fachlich |
| 28 | Der Staging-Ordner `.terax-copy-…` liegt während des Kopierens im Zielordner; wer „versteckte Dateien zeigen“ eingeschaltet hat oder eine Whitelist-Regel in `.gitignore` hat, sähe dort die halbe Kopie (Baum, Suche, Inhaltssuche, Unterordner-Menü, Dateiliste, Git-Status) und nach einem SSH-Abbruch dauerhaft einen Rest. Blenden wir ihn aus? | Ja: das Prädikat `is_staging_name` wirkt an jeder Aufzählungs-Primitive: jeder Walker (`tree.rs:47`, `search.rs:103`, `search.rs:298`, `grep.rs:80`, `grep.rs:354`), jedes Verzeichnis-Listing (`tree.rs:167`, `:256`), jede Helper-Listing-Op (`ssh.rs:297`, `:316`, `:484`, `:518`), ungetrackte Git-Einträge (`parser.rs:62`, Q&A #31); Geltungsbereich: Aufzählungen mit Wurzel außerhalb eines Staging-Ordners; Test je Stelle; ein Präfix in Rust, gespiegelt im Helper mit Pin-Test | ausgeblendet an jeder Aufzählungs-Primitive (Entscheidung des Dirigenten, erweitert nach D-1 und F-1; `gates/DECISION-gate1-staging-search.md`, `gates/DECISION-gate1-staging-search-2.md`) | Sichtbarkeit bei `showHidden` hinnehmen: BR-3 müsste auf „nie unter dem Zielnamen“ eingeschränkt werden; Verlass auf `.hidden(true)` oder Ignore-Regeln: in `ignore 0.4.32` hebt eine Whitelist-Regel die Hidden-Regel auf (F-1). Folge der Entscheidung: ein echter Ordner des Users mit diesem Präfix erscheint in keiner App-Aufzählung mit Wurzel außerhalb | automatisch | fachlich |
| 29 | Gate 1 hat gemessen: Das gebaute Startpaket beider Fenster lädt AI-SDK-Chunks (~546 KB) mit `@ai-sdk/*`, `ai` und `zod`, weil die Chunk-Regeln React in den AI-Chunk legen. Wie erfüllen wir BR-18? | Slice 6 übernimmt die Upstream-Chunk-Strategie aus `f6f0004` (React-nahe Pakete in einer vorrangigen Eager-Gruppe vor den Feature-Gruppen), der Build-Test prüft den gebauten Output beider Fenster auf `@ai-sdk`, `ai`, `zod`, `@codemirror`, `@uiw` und Icon-Daten | übernommen (Entscheidung des Dirigenten), MIG-62, SVC-15 | Nur Icon-Set nachladen: Start lädt weiter ~546 KB AI-Code, BR-18 unerfüllt. Folge: schnellerer Start beider Fenster; `vite.config.ts` weicht stärker vom heutigen Fork-Stand ab | automatisch | technisch |
| 30 | INV-19 behauptete „Startpaket ohne AI-SDK, abgedeckt durch `eager-budget.test.ts`“; der Test prüft aber nur den Quell-Importgraphen. Wie fassen wir die Invariante? | Auf den Quell-Importgraphen eingrenzen (covered); das gebaute Startpaket ist Zielverhalten von SVC-15 | eingegrenzt (Entscheidung des Dirigenten) | Invariante auf das gebaute Paket beziehen: wäre heute falsch und kein Erhaltungsverhalten | automatisch | technisch |
| 31 | Der Git-Status listet ungetrackte Dateien einzeln auf; ein Staging-Ordner `.terax-copy-…` im Repo erschiene damit im Source-Control-Panel und als Git-Farbe im Explorer, auch nach einem SSH-Abbruch dauerhaft. Blenden wir ihn auch dort aus, und für welche Eintragsarten? | Nur ungetrackte Einträge (`? `): der Parser lässt einen ungetrackten Eintrag weg, dessen Pfad ein Segment mit dem Staging-Präfix enthält; wirkt lokal und SSH, weil lokal geparst wird; Prädikat aus `copy.rs`; Index-/HEAD-Einträge bleiben sichtbar | ausgeblendet für ungetrackte Einträge (Entscheidung des Dirigenten E-1, eingegrenzt nach F-3), MIG-75 | Alle vier Eintragsarten filtern: ein außerhalb der App gestagter Staging-Pfad (`git add -A` im Terminal) verschwände aus dem Panel und würde beim nächsten Panel-Commit unsichtbar mitcommittet (`operations.rs:438-443` Commit ohne Pfadliste); verworfen wegen Datenintegrität. Gar nicht filtern: halbe Kopien erschienen als ungetrackte Dateien. Folge der Entscheidung: ein echter Ordner des Users mit dem Präfix fehlt im Git-Status der App nur, solange er ungetrackt ist; gestagte oder getrackte Pfade darin bleiben sichtbar | automatisch | fachlich |
