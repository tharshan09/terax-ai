# Gate 1: Architecture Compliance – Perspektive `code`

| Feld | Wert |
|------|------|
| Geprüft | `specs/2026-10-20-upstream-sync-090/architecture.md`, `discovery.md`, `codebase-scan.md` |
| Nicht vorhanden | `wireframes.md`, `bindings.md`, Reconcile (E2 still übersprungen) |
| Codebase | Worktree `upstream-sync-090` @ `68d45d0` (Fork 0.8.6); Upstream per `git show` (`upstream` gefetcht) |
| Prüfdatum | 2026-10-27 |
| Lauf | Erstlauf, Perspektive `code` (kein Delta) |
| Außerhalb der Perspektive (nicht in der Prüfmenge) | „aktuell stabil“-Versionen und Registry-Daten, Tauri-Main-Thread-Regel für Sync-Commands, WebKit-`visibilityState`-Verhalten, python3-/Host-Versionen, `libc`/`objc2`-Symbolinhalte, POSIX-Rename-Semantik → `runtime`; CSS-/Komponenten-Darstellung → `ui` |

## Skript-Tabelle (Arch-Precheck, übernommen)

| Ergebnis | ID | Klasse | Detail |
|----------|----|--------|--------|
| PASS | AR-7 | note | Scan-Plausibilität: 3 NEW-Zeilen ohne Zielpfad (Zielpfade stehen in architecture.md unter Context & Research) |

## Summary

| Klasse | Anzahl |
|--------|--------|
| decision | 0 |
| refuted | 1 |
| fix | 2 |
| obligation | 8 |
| note | 5 |

**Verdict:** FAILED (F-01 `refuted`)

Prüfmenge: 77 Bestands-Behauptungen und 23 Invarianten-Zeilen = 100 erhoben, 99 gemessen, 1 NICHT GEMESSEN (B-59). Self-Check: 99 Verdikte + 1 NICHT-GEMESSEN = 100.

---

## A) Feature Mapping

| Item | Evidenz | Status |
|------|---------|--------|
| Alle Discovery-IDs (FL-1..9, EP-1..5, UI-1..10, ST-1..9, TR-1..10, BR-1..21, DF-1..3, TG-1..6) in der Tabelle „Discovery-Abdeckung“ | architecture.md:579-626; ID-Existenz kommt vom Skript | PASS |
| BR-16 → SVC-13/VAL-8 inhaltlich tragfähig | Der Nachweis-Weg stützt sich auf eine Code-Eigenschaft, die der Fork nicht hat (F-01) | FAIL (F-01) |
| BR-17 → SVC-12 (Gating wie `editor.undo`) | `App.tsx:1007` `if (id === "editor.undo" \|\| id === "editor.redo") return activeTab?.kind !== "editor"` | PASS (Auflage F-07) |
| BR-13 → SVC-11 inkl. Rail-Badge, `line-changes` | `App.tsx:1617-1620` (Badge im Sidebar-Panel), `GitWidgets.tsx:102-103`, `layout.ts:8-21` | PASS |
| BR-11 → SVC-10 (sichtbar = Ansicht `explorer` + nicht eingeklappt) | `App.tsx:1591` (Mount nur bei `sidebarView === "explorer"`), `App.tsx:1580-1584` (collapsible, 0 px), `useSidebarPanel.ts:76-99` | PASS |
| BR-19 → vier Versionsquellen | `package.json:4`, `Cargo.toml:3`, `tauri.conf.json:4`, `Cargo.lock:5010` | PASS |
| BR-20 → MIG-68/71/72 | Test-Abhängigkeiten existieren: `chat-code-lezer.ts:293` `highlight`, `themes.ts:26` `EDITOR_THEME_EXT` | PASS |

## B) Constraint Mapping

| Item | Evidenz | Status |
|------|---------|--------|
| DF-3 Suffix 1..10.000 → VAL-4 | Upstream `copy.rs:10` `MAX_COPY_SUFFIX = 10_000`, Schleife `0..=MAX_COPY_SUFFIX` (`:137`) | PASS |
| DF-1 nur absolute Pfade → VAL-1/VAL-6 | Upstream `copy.rs:98-103` `copy source must be absolute` | PASS |
| BR-6 Ziel-Jail → VAL-2 | `mutate.rs:234` `authorize_mutation_dir`; Test `copy_rejects_unauthorized_dest` (`mutate.rs:459-475`) | PASS |
| BR-7 Selbstkopie → VAL-3 | Upstream `copy.rs:113-118` | PASS |
| Pfadgrenzen „Symlink-Ziele nicht überschreiben“ → SEC-4/INV-3 | `mutate.rs:241-246`; Test `mutate.rs:519-541` | PASS (Auflage F-05) |
| Batch-/Tiefen-Grenze → VAL-5 | Werte offen gelassen, Upstream-Werte gemessen | PASS (Auflage F-04) |
| Zwischenablage-Zeitlimit → API-1 | „begrenzt“ ohne Wert; Upstream `clipboard.rs:22-27` 5 s | PASS (Auflage F-09) |
| BR-21 SSH-Symlinks → SEC-5 | `ssh.rs:1166-1190` | PASS (Auflage F-10) |
| EP-3 „SSH-Verbindung weg → Gesamtfehler“ → API-2/SVC-3 | `run_remote_json` (`ssh.rs:771`) unterscheidet Transport- und Helper-Fehler nicht | PASS (Auflage F-06) |

## C) Realistic Data

| Item | Evidenz | Status |
|------|---------|--------|
| Datenbank | Keine DB im Projekt; architecture.md:101-121 N/A ist korrekt | N/A |
| Pfad-Strings unbegrenzt | `mutate.rs:213-214` `Vec<String>`, `String`; Upstream `copy.rs:28-29` | PASS |
| Fehlertexte unbegrenzt | `ssh.rs:570` `str(ex)`; Upstream `copy.rs:89-92` `error.to_string()` | PASS |
| Externe API-Felder | Keine externe HTTP-API neu; SSH-Helper-Protokoll und NSPasteboard sind in API-1/API-3 beschrieben | PASS |

## D) Completeness + Dependencies

| Item | Evidenz | Status |
|------|---------|--------|
| SSH-Helper: benötigte Ops für Staging, Listing, Aufräumen | `ssh.rs:557-560` `read_dir`, `create_dir`, `rename`, `delete`, `exists`, `write_bytes` | PASS |
| Projekt-Versionen in der Integrations-Tabelle = Pinning-Files | `Cargo.lock`: tauri 2.11.5 (`:4606`), dirs 6.0.0 (`:823`), libc 0.2.189 (`:2314`), objc2-app-kit/-foundation 0.3.2 (`:2681`, `:2808`), reqwest 0.12.28 (`:3717`); `package.json`: api ^2.11.1 (`:66`), cli ^2.11.4 (`:115`), react ^19.2.8 (`:97`), vite ^8.2.2 (`:133`), iconify ^1.2.17 (`:61`), lezer ^1.2.3 (`:62`), pnpm 11.9.0 (`:7`) | PASS |
| `objc2`-Features für SVC-4 | Upstream `2723dc6` Cargo.toml: App-Kit `NSPasteboard`, `NSPasteboardItem`; Foundation `NSArray`, `NSURL`; das deckt MIG-1 ab | PASS |
| `dirs` 6→7 ohne Code-Änderung | 13 `dirs::`-Stellen, 0 außer `home_dir`; `2992988` ändert nur Manifeste/Lock | PASS |
| Latest-/Hersteller-Versionen | Perspektive `runtime` | außerhalb Perspektive |

## F) Migration Completeness

Trigger vorhanden (Migration Map, „migriert“). Map enthält nur Dateien.

| Sweep-Kriterium | Gemessener Treffer | Map-Deckung | Status |
|-----------------|--------------------|-------------|--------|
| Sichtbarkeit `document\.hidden\|visibilityState\|visibilitychange` | 7 Dateien: `App.tsx:477`, `useSpacePersistence.ts:89,92,96`, `useClaudeStatus.ts:55`, `rendererPool.ts:103,110,113` (Allowlist), `useTerminalSession.ts:551,575`, `SshAgentActivityPoller.tsx:141`, `SurfaceLayer.tsx:132-137` | MIG-10, 35-39 | PASS |
| Guard MIG-27 gegen eigene Tests | Die Allowlist schließt die geplanten Tests aus, die die Tokens enthalten müssen | – | FIX (F-02) |
| `fs_copy` | 1 Frontend-Aufrufer `useExplorerFileDrop.ts:72` | MIG-23 | PASS |
| `fn ip_kind\|enum IpKind` | `net.rs:33,78` | MIG-5/6 | PASS |
| Icons `*.tsx` | 8 Dateien (TabBar, GitHistoryPane, TreeRow, ExplorerSearch, FileExplorer, CommandPalette, SourceControlPanel, FilePicker); `.ts`-Treffer nur `iconResolver.ts` und Kommentar in `constants.ts` | MIG-22, 52, 55-61 | PASS |
| `infinite` in `src/styles/*.css` | `globals.css:440` (einzige CSS-Datei mit Keyframes); keine `infinite` in TS/TSX | MIG-40/41 | PASS |
| Version `0.8.6` | `package.json:4`, `Cargo.toml:3`, `tauri.conf.json:4` | MIG-1, 67, 70 | PASS |
| Bruch-Mechanismus SSRF | Der Upstream-Test braucht zusätzlich die Klammer-Entfernung aus `0a6e511`, die in keinem MIG steht | MIG-5 unvollständig | FAIL (F-01) |

## E) Pattern Consistency (Gate 1b)

| Scanner-Empfehlung | Architecture | Status |
|--------------------|--------------|--------|
| REUSE `fs_copy` für Drop + Einfügen | API-2, SVC-5/6, MIG-23 | PASS |
| REUSE `watchAdd`/`watchRemove` + Rust-Refcount | SVC-10; Refcount `watch.rs:182-206` | PASS |
| REUSE `ContextMenuItem` + `selectedPath` | SVC-6, MIG-22 | PASS |
| REUSE `editor.undo`-Muster für `editor.save` | SVC-12, MIG-7/10 | PASS |
| REUSE Eager-Graph-Tracer | MIG-63 | PASS (Auflage F-08) |
| REUSE `reg_for`/`tempfile` | Test Strategy | PASS |
| EXTEND `fs_copy_impl` → neu in `fs/copy.rs` | begründete Abweichung: Q&A #9, Trade-off „Upstream-Struktur“ | PASS |
| EXTEND `ssh::copy` + neue Helper-Op `publish` | begründet: Q&A #7 (TOCTOU) | PASS |
| EXTEND useFileTree/useSourceControl/iconResolver mit Upstream-Dateien (`watchRegistry`, `statusConsumers`, `iconEngine`, `FileIcon`) | Scanner nennt die Upstream-Vorlagen in denselben Zeilen | PASS |
| NEW (6) | alle mit Zielpfad (MIG-14/16/20/25/64-66, MIG-11-13) | PASS |
| AVOID (4) | Guard MIG-27, `data-window-hidden` statt Fokus (MIG-40), Rückbau MIG-5, Skip-Liste | PASS |
| Anti-Slop #1 consolidate (K2) | Option passt; eingelöst in MIG-25-28, 35-39, MIG-10 | PASS |
| Anti-Slop #2 dismantle (K3) | eingelöst in MIG-5/6 | PASS |
| Anti-Slop #3 consolidate (K2) | eingelöst in MIG-14 (`copy_name`), MIG-19 | PASS |
| Linsen-Ausfall | keiner (architecture.md:558) | PASS |

## E2) Bindings Coverage

N/A: kein `bindings_path`/`reconcile_path`.

## E3) Existing-Behavior Invariants (Gate 1d)

Alle 22 Scan-Invarianten sind 1:1 übernommen (INV-1..22, Nr. 7 als „entfällt“), dazu INV-23. Umformulierungen nach Lesart B sind über Q&A #19 belegt.

| INV | Source/Test gemessen | Coverage-Aussage | Status |
|-----|----------------------|------------------|--------|
| INV-1 | `mutate.rs:331-367` legt `a.txt` + `d/inner/y.txt` an, zweiter Aufruf `unwrap_err` mit `already exists` | covered für den Bestand; der `renameOnConflict`-Teil ist Ziel (MIG-15) | PASS |
| INV-2 | `mutate.rs:459-475` `outside the authorized workspace` | covered | PASS |
| INV-3 | `mutate.rs:519-541` `!victim.exists()` | covered; Testform ändert sich mit `CopyResult` | PASS (F-05) |
| INV-4 | `ssh.rs:1202-1214` + Python `write_bytes` `lexists`-Prüfung (`ssh.rs:443-444`) | uncovered | PASS |
| INV-5 | `useExplorerFileDrop.ts:20-42` | uncovered | PASS |
| INV-6 | `net.rs:442-505`: kein Assert für unspecified (`0.0.0.0`, `::`) und keiner für `fc00::/7` | „covered“ nur teilweise | FIX (F-03) |
| INV-7 | `net.rs:50-72` (v6 ohne eingebettete IPv4) | – | PASS |
| INV-8 | `EditorPane.tsx:187-194, 239-249` | uncovered | PASS (F-07) |
| INV-9 | `shortcuts.ts:229-233` und strenger Shift-Vergleich `shortcuts.ts:369-374` | uncovered | PASS |
| INV-10 | `binaryPreview.test.ts:32-50` (image/video/audio/pdf/card) | covered | PASS |
| INV-11 | `EditorPane.tsx:446-463` | uncovered | PASS |
| INV-12 | `useFileTree.ts:205-247` | uncovered | PASS |
| INV-13 | `watch.rs:182-206`; Editor-Watches liegen in `useEditorFileSync.ts:65-75` (Anker `:53-54` driftet) | uncovered | PASS (Drift F-11) |
| INV-14 | `useSourceControl.ts:460-475`, Konsumenten `App.tsx:1596,1620,1681` | uncovered | PASS |
| INV-15 | `useSourceControlContext.ts:61-82` | uncovered | PASS |
| INV-16 | `FileExplorer.tsx:201` | uncovered | PASS |
| INV-17 | `globals.css:443-456`: Reduced-Motion stoppt nur `.terax-shimmer` | uncovered | PASS (F-13) |
| INV-18 | `rendererPool.ts:102-114` | uncovered | PASS |
| INV-19 | `eager-budget.test.ts:10-24`, beide Fenster | covered | PASS |
| INV-20 | `iconResolver.ts:67,99` | uncovered | PASS |
| INV-21 | `pnpm-lock.yaml:904` eine Kopie 1.2.3 | uncovered | PASS |
| INV-22 | `AboutSection.tsx:4,30` `getVersion()` | uncovered | PASS |
| INV-23 | `App.tsx:477`, `useClaudeStatus.ts:55` (Konsument `StatusBar.tsx`), `SshAgentActivityPoller.tsx:141`, `useSpacePersistence.ts:86-101`, `useTerminalSession.ts:574-579` | uncovered | PASS |

---

## Data Type Verdicts

| Feld | Arch-Typ | Evidenz | Verdict |
|------|----------|---------|---------|
| `CopyRequest.sources` | `string[]` unbegrenzt | `mutate.rs:213`; Upstream `copy.rs:28` | PASS |
| `CopyRequest.destDir` | `string` | `mutate.rs:214` | PASS |
| `CopyRequest.renameOnConflict` | `boolean?`, Default `false` | Upstream `copy.rs:32,40` `Option<bool>` + `unwrap_or(false)` | PASS |
| `CopyResult.created` | `string[]` in Form `destDir/{finalName}` | Upstream `copy.rs:86-87` `to_canon(Path::new(dest_dir).join(name))`; Fork hat `to_canon` (`fs/mod.rs:14`) | PASS |
| `CopyFailure.source/message` | `string` unbegrenzt | `ssh.rs:570`; Upstream `copy.rs:89-92` | PASS |
| `PublishRequest.from/to` | `string` | Helper-Konvention `ssh.rs:411` | PASS |
| API-1 Rückgabe | `string[]` | Upstream `clipboard.rs:4` `Vec<String>` | PASS |
| DF-3 Suffix-Zähler | 1..10.000 | Upstream `copy.rs:10,137` | PASS |
| VAL-5 Quellen/Tiefe | offen | Upstream `copy.rs:9,11` 1024 / 128 | PASS mit Auflage F-04 |
| `IpKind` | 4 Varianten | Fork `net.rs:77-83` = Upstream `ip.rs:11-17` | PASS |
| `sidebarCollapsed` | boolean, gespiegelt aus `localStorage` `"1"/"0"` | `useSidebarPanel.ts:88-99` | PASS |
| Git-Widget-Liste | Konstante in `layout.ts` | `layout.ts:8-21` | PASS |

## Bestands-Behauptungen

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|------------------------------|-------|---------|
| B-01 | Helper per stdin-JSON (`ssh.rs:205-211`) | `ssh.rs:204-211` | bestätigt |
| B-02 | `OPS` `ssh.rs:556-561` | `ssh.rs:557-560` | bestätigt (Drift) |
| B-03 | Sentinel `ssh.rs:573` | `ssh.rs:573` | bestätigt |
| B-04 | `authorize_mutation_dir` `mutate.rs:234` | `mutate.rs:234` | bestätigt |
| B-05 | Eigene Commands brauchen keinen Capability-Eintrag (SEC-1) | `build.rs:5` `tauri_build::build()` ohne App-Manifest; `capabilities/default.json` nur core/Plugins | bestätigt |
| B-06 | Main-Thread-Sprung wie `clipboard_write_text` `lib.rs:132-158` | `lib.rs:138-158` | bestätigt |
| B-07 | `fs_copy` heute synchron | `mutate.rs:212` `pub fn` | bestätigt |
| B-08 | SSH-Weiterleitung `mutate.rs:227-229` | `mutate.rs:228-229` | bestätigt |
| B-09 | Auflösung `net.rs:88-117`, Pinning `net.rs:282` | `net.rs:88-117`, `:282` | bestätigt |
| B-10 | Metadaten auch mit Opt-in gesperrt | `net.rs:150`, `:160-162` | bestätigt |
| B-11 | fs-Commands nehmen `String` | `mutate.rs:213-214` | bestätigt |
| B-12 | `ssh.rs:570` reicht `str(ex)` durch | `ssh.rs:570` | bestätigt |
| B-13 | `WorkspaceEnv` bestehend `{local}`/`{ssh,host}` | `workspace.rs:322-331` hat zusätzlich `Wsl` | bestätigt (Hinweis F-15) |
| B-14 | `log::warn!`-Konvention `mutate.rs:248` | `mutate.rs:248` | bestätigt |
| B-15 | `ssh::copy` `ssh.rs:1202`, `upload_recursive` vorhanden | `ssh.rs:1166, 1202` | bestätigt |
| B-16 | Helper-Ops für Listing/Staging/Aufräumen vorhanden | `ssh.rs:557-560` | bestätigt |
| B-17 | Nicht-UTF-8-Namen scheitern remote (`ssh.rs:1176`) | `ssh.rs:1177` | bestätigt (Drift) |
| B-18 | Upstream-Clipboard: FileURL, `filePathURL`, 5 s, Fehlertext | `2723dc6:clipboard.rs:22-27, 47-59` | bestätigt |
| B-19 | `binaryPreviewMode` REUSE | `EditorPane.tsx:415` | bestätigt |
| B-20 | Upstream `statusConsumers` behandelt Rail-Badge als nicht live | `f6f0004:statusConsumers.ts:13-16, 55-57` | bestätigt |
| B-21 | `saveRef` `EditorPane.tsx:142`, Handle ohne `save` | `EditorPane.tsx:142`, `:48-63` | bestätigt |
| B-22 | Freischaltung wie `editor.undo` | `App.tsx:1007-1008` | bestätigt |
| B-23 | Upstream `net/ip.rs` nur `std`, BR-16-Formen | `11343a1:ip.rs:9, 104-128` | bestätigt |
| B-24 | Upstream-Test aus `11343a1` läuft im Fork mit Literal-Hosts ohne DNS (VAL-8, Test Strategy) | `net.rs:90` ohne Klammer-Entfernung; Test nutzt `"[::ffff:127.0.0.1]"`; `getaddrinfo("[::ffff:127.0.0.1]")` → Errno 8; Klammer-Entfernung kam mit `0a6e511` | **widerlegt (F-01)** |
| B-25 | Fork-Assertions (INV-6) bleiben unter Upstream-`ip.rs` gültig | alle 13 Asserts `net.rs:445-503` gegen `ip.rs:38-98` nachgerechnet | bestätigt |
| B-26 | `iconResolver` statisch (`:1-4`), 8 Aufrufer | `iconResolver.ts:1-4`; 8 Treffer im Sweep | bestätigt |
| B-27 | Eager-Budget auf Quellebene, `HEAVY` ohne Icon-Set | `eager-budget.test.ts:10`; Paket-Matching `eager-graph.mjs:62` | bestätigt (Auflage F-08) |
| B-28 | Eine `@lezer/highlight`-Kopie 1.2.3 | `pnpm-lock.yaml:904, 6697` | bestätigt |
| B-29 | `ci.yml` 4× `checkout@v7` `:17,58,110,134` | identisch; Upstream `e8f9fcd` hat 5 Hunks | bestätigt |
| B-30 | Cargo.toml `:3`, `:31`, `:37`, objc2 `:66-67` | `:3`, `:31`, `:37`; objc2 an `:67-68` | bestätigt (Drift) |
| B-31 | Benötigte `objc2`-Features | Upstream-Diff `2723dc6` Cargo.toml | bestätigt |
| B-32 | Cargo.lock 0.8.6, `dirs` 6.0.0, `tauri` 2.11.5 | `:5010`, `:823`, `:4606` (zusätzlich transitiv `dirs` 4.0.0, `reqwest` 0.13.2) | bestätigt |
| B-33 | `markdown-code.tsx:24` `text-[11px]`, `d3c8fd7` erbt die Größe | `:24`; Pick → `text-[0.875em]` | bestätigt |
| B-34 | `ip_kind`/`IpKind` `:33-75`, Tests `:446-503`, Aufrufer 91/107/160/282 | `net.rs:33-83`, `:442-505`, Aufrufer identisch | bestätigt |
| B-35 | `Mod+Shift+S` = `space.overview`, `Mod+S` frei | `shortcuts.ts:229-233`; strenger Matcher `:369-374` | bestätigt |
| B-36 | `<video>`/`<audio>` mit `controls`, `preload="metadata"` `:446-463` | `EditorPane.tsx:446-463` | bestätigt |
| B-37 | `App.tsx` `:477`, `:1591-1598`, `useSourceControlContext` ohne Konsumenten-Eingaben | `App.tsx:477`, `:1592-1603`, `:856-867` | bestätigt |
| B-38 | `copy_recursive` `:195-206`, `fs_copy`+`_impl` `:207-244`, Tests `:331,459,519` | `:195-206`; `_impl` endet bei `:257`; Tests identisch | bestätigt (Drift) |
| B-39 | Registrierung `lib.rs:408` | `lib.rs:408` | bestätigt |
| B-40 | `ssh::copy` bricht ab, `remote_exists`, direkt ins Ziel; Testmuster `:1417`, `remote_mutations_smoke` | `ssh.rs:1202-1215`, `:1417-1422`, `:1503` | bestätigt |
| B-41 | `handleKeyDown` `:369-409`, Leer-Abbruch `:378`, Icon-Import `:38`, kein `visible` | `FileExplorer.tsx:369, 378, 38` | bestätigt |
| B-42 | Drop `invoke("fs_copy")` ohne Benennung, `Copy failed` `:68-79` | `useExplorerFileDrop.ts:72-79` | bestätigt |
| B-43 | TERAX.md: `fs::mutate::*` ohne `fs_copy` | `TERAX.md:42` | bestätigt |
| B-44 | `visible` nur am Wrapper `EditorStack.tsx:47,156` | identisch | bestätigt |
| B-45 | `useDocumentHidden` `SurfaceLayer.tsx:130-141` | identisch | bestätigt |
| B-46 | Poll-Guards/Listener MIG-36..39 | `useClaudeStatus.ts:55`, `SshAgentActivityPoller.tsx:141`, `useSpacePersistence.ts:86-101`, `useTerminalSession.ts:551, 575` | bestätigt |
| B-47 | Shimmer `linear infinite`, Reduced-Motion-Block | `globals.css:440`, `:443-456` | bestätigt |
| B-48 | Eingeklappt nur Ref + `localStorage` | `useSidebarPanel.ts:76-99` | bestätigt |
| B-49 | `watchedRef` + direkte Watches `:117-126,217-224` | `useFileTree.ts:117-126, 217-224` | bestätigt |
| B-50 | `useSourceControl(path, true)` `:82` | `useSourceControlContext.ts:82` | bestätigt |
| B-51 | Fokus-Auffrischung immer `:460-474` | `useSourceControl.ts:460-475` | bestätigt |
| B-52 | Widget-Katalog ohne Git-Kennzeichnung | `layout.ts:8-21` | bestätigt |
| B-53 | `manualChunks` `vite.config.ts:66-120` | `vite.config.ts:66` | bestätigt |
| B-54 | `package.json:4` 0.8.6, `:62` `^1.2.3` | identisch | bestätigt |
| B-55 | `overrides:` mit 3 Pins; `minimumReleaseAge` 4320 strikt | `pnpm-workspace.yaml` | bestätigt |
| B-56 | `tauri.conf.json:4` Version; `minimumSystemVersion` 13.0 | identisch | bestätigt |
| B-57 | `bf7e03d`-Tests finden ihre Fork-Gegenstücke | `chat-code-lezer.ts:293`, `themes.ts:26` | bestätigt |
| B-58 | Test-Commits `d766567`/`258d119`/`13ded38` importieren vorhandene Fork-APIs | `iconResolver.ts:67,99`; `types.ts:45` `ThemeVariant`; `customThemes.ts:11-33` | bestätigt |
| B-59 | Test-Commits laufen grün gegen den Fork-Code (Vorher-Aufnahme INV-20) | – | NICHT GEMESSEN: Testlauf hätte Dateien in den Worktree geschrieben (P6); Nachweis in Slice 1 |
| B-60 | Projekt-Versionen der Integrations-Tabelle | siehe D) | bestätigt |
| B-61 | `dirs` nur `home_dir`, 13 Stellen | grep: 13, davon 0 ohne `home_dir` | bestätigt |
| B-62 | `2992988` ohne Code-Änderung | Stat: nur Lock + 2 Manifeste (eines `crates/terax-cli`, im Fork nicht vorhanden) | bestätigt |
| B-63 | `4cfc202`: Registry, Handle-`save`, Freischaltung | Diff `App.tsx`, `EditorPane.tsx`, `shortcuts.ts` | bestätigt |
| B-64 | `2723dc6`: async, `CopyResult`, `copy_name`, `rename_no_replace` fehlt im Fork | `copy.rs:1, 26-46, 224`; Fork-grep ohne Treffer | bestätigt |
| B-65 | `5502f82`: `bindMediaPlayback`, `mediaPreviewKind` doppelt die Klassifikation | `5502f82:mediaPreview.ts` | bestätigt |
| B-66 | `f6f0004`: `windowActivity.ts`, `statusConsumers.ts`, `watchRegistry.ts`, `motionBudget.test.ts`, `dist-budget.test.ts` | Stat `f6f0004` | bestätigt |
| B-67 | `bf7e03d`: Catalog 1.2.5 + Override, Sourcemap-Zählung | Diff `pnpm-workspace.yaml`, `dist-budget.test.ts:+44-60` | bestätigt |
| B-68 | `SidebarRail` im Sidebar-Panel | `App.tsx:1617-1620` innerhalb `ResizablePanel` | bestätigt |
| B-69 | Standard-Statusleiste zeigt `git-branch` und `git-sync` (`layout.ts:44-51`) | `DEFAULT_HIDDEN` = `git-changes`, `git-staged` → `line-changes` ist ebenfalls sichtbar | teilweise (F-12) |
| B-70 | `LineChangesWidget` liest `ctx.sourceControl` | `GitWidgets.tsx:102-103` | bestätigt |
| B-71 | Zen blendet Statusleiste aus | `App.tsx:1669` | bestätigt |
| B-72 | Helper wird je Aufruf mitgeschickt | `ssh.rs:782-783` | bestätigt |
| B-73 | `fs_copy` hat heute 1 Aufrufer | Sweep | bestätigt |
| B-74 | Fokusgekoppelte Stellen bleiben (`rendererPool`, `useWindowFocus`) | `rendererPool.ts:103,110-113`; `useWindowFocus.ts:13` (Tauri `onFocusChanged`, kein Sweep-Treffer) | bestätigt |
| B-75 | Sweep-Treffer = MIG-Liste | siehe F) | bestätigt |
| B-76 | VAL-5 „Grenzwerte wie Upstream `copy.rs`“ | `copy.rs:9-11` | bestätigt (Auflage F-04) |
| B-77 | MIG-57: `ExplorerSearch` nutzt `fileIconUrl`/`folderIconUrl` | `ExplorerSearch.tsx:26` importiert nur `fileIconUrl` | teilweise (F-11) |

---

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|----|--------|-------|------------|-------|-------|-------------|-----------------------|------------|-------------------|
| F-01 | refuted | A/D/F (BR-16, VAL-8, MIG-5) | architecture.md (VAL-8, Test Strategy „AI-HTTP-Proxy / DNS“, MIG-5) | „Nachweis: Upstream-Tests aus `11343a1` (Literal-Hosts ohne DNS)“; „IP-Literal-Hosts, keine DNS-Auflösung nötig (Upstream-Test aus `11343a1`)“ | Fork `net.rs:90` `if let Ok(ip) = host.parse::<IpAddr>()` ohne Klammer-Entfernung; Upstream `11343a1:net.rs:46-47` `host.trim_matches(['[', ']'])` mit Kommentar „`Url::host_str` keeps the brackets of IPv6“; `git log -S` → eingeführt in `0a6e511` (out of scope); der Upstream-Test `embedded_ipv4_literals_cannot_smuggle_internal_hosts_past_the_guard` übergibt `"[::ffff:127.0.0.1]"` u.ä.; Messung `getaddrinfo("[::ffff:127.0.0.1]", 0)` → `Errno 8 nodename nor servname provided` | code, runtime | Wird der Upstream-Test unverändert nach MIG-5 übernommen, liefert `resolve_and_classify("[::ffff:127.0.0.1]")` `Err("dns: …")` und `.unwrap()` paniert; `cargo test` ist rot. Ohne Klammer-Entfernung erreichen IPv6-Literal-URLs `ip_kind` nie (`net.rs:131, 200, 323, 376` reichen `host_str()` mit Klammern weiter) | MIG-5 um die Klammer-Entfernung in `resolve_and_classify` (`net.rs:90`, Upstream-Form) ergänzen und in VAL-8 nennen. Folge: IPv6-Literal-Endpunkte (z.B. `http://[::1]:port`) werden klassifiziert statt per DNS-Fehler abgewiesen, mit Opt-in also erreichbar. Alternative: den Test auf Hosts ohne Klammern umschreiben und den Klammer-Pfad als bewusste Abweichung benennen | nein (Erstlauf) |
| F-02 | fix | F (MIG-27, Sweep-Kriterium) | architecture.md (MIG-27, Sweep criterion „Fenster-Sichtbarkeit“) | „Quelltext-Scan über `src/`: `document.hidden`, `visibilityState`, `visibilitychange` nur in `windowVisibility.ts` und im bewusst fokusgekoppelten `terminal/lib/rendererPool.ts`“ | Test Strategy (architecture.md:409): „jsdom-Dokument, `visibilityState` umdefiniert, echtes `visibilitychange`-Event“ für MIG-26; MIG-34 prüft „unsichtbares Fenster“; der Guard enthält die Tokens selbst | artifact | Der Guard wird rot, sobald `windowVisibility.test.ts` (MIG-26), `EditorStack.window-hidden.test.tsx` (MIG-34) oder der Guard selbst existiert | Allowlist und Sweep-Text um Testdateien erweitern: `src/**/*.test.ts(x)` ausnehmen oder mindestens MIG-26, MIG-27 und MIG-34 explizit nennen | nein |
| F-03 | fix | E3 (INV-6) | architecture.md (INV-6) | „Loopback/unspecified = Loopback … `fc00::/7` Private \| Tests `net.rs:446-503` \| covered“ | `net.rs:442-505` enthält keine Assertion für `0.0.0.0`/`::` und keine für eine `fc00::/7`-Adresse; Upstream `ip.rs` `non_global_ipv6_ranges_are_never_public` deckt `fc00::1` und `::`, `ipv4_mapped…` deckt `::ffff:0.0.0.0`; reines `0.0.0.0` prüft kein Test | code | Ein Test-Lauf beweist „unspecified = Loopback“ (IPv4) und „`fc00::/7` = Private“ heute nicht | INV-6: Source um die Upstream-Tests aus `ip.rs` ergänzen; in MIG-5 eine Fork-Assertion `0.0.0.0 → Loopback` festschreiben; Coverage bis dahin `partial` | nein |
| F-04 | obligation | B/C (VAL-5) | – (implement, test) | „Grenzwerte wie Upstream `copy.rs`, Festlegung über die Gate-1-Auflagen“ | Upstream `2723dc6:copy.rs:9-11` `MAX_COPY_SOURCES = 1024`, `MAX_COPY_SUFFIX = 10_000`, `MAX_COPY_DEPTH = 128`; Fehlertexte `:79`, `:167-171`; SSH-`upload_recursive` (`ssh.rs:1166-1190`) hat heute keine Tiefengrenze | code | 1024 Quellen gehen durch, 1025 lassen den Aufruf scheitern; Tiefe 128 geht durch, 129 lässt nur das Element scheitern; gilt lokal und SSH | Werte 1024 / 128 / 10.000 setzen, auch im SSH-Zweig; Rust-Tests an beiden Grenzen | nein |
| F-05 | obligation | E3 (INV-3, SEC-4) | – (test) | „hängende Symlinks am Ziel zählen als belegt (INV-3)“ | `mutate.rs:529-540` erwartet `unwrap_err()` mit `already exists`; unter `CopyResult` landet der Fall in `failed` (Upstream `copy.rs:107-112`) bzw. mit `renameOnConflict` über `rename_no_replace` unter dem nächsten Namen | code | Der verschobene Test passt nach MIG-15 nicht mehr zur Rückgabeform | Test für beide Modi: `victim` wird nie geschrieben; `true` → `created` = `a copy.txt`; `false` → `failed[0].message` enthält `already exists` | nein |
| F-06 | obligation | B/D (EP-3, API-2 vs. SVC-3) | – (implement, qa) | „Fehler des ganzen Aufrufs (… SSH weg) → Rejection mit Text (EP-3)“ | SVC-3 arbeitet je Element; `run_remote_json` (`ssh.rs:771`) liefert für Transport- und Helper-Fehler dasselbe `Err(String)`; Klassifizierer `classify_ssh_error` (`ssh.rs:668-705`) existiert | code | Ohne Klassifikation meldet ein Verbindungsabbruch N Element-Fehler (UI-4) statt `Paste failed` (UI-5) | Transportfehler (Klassifizierer bzw. ssh-Exit 255) bricht den Batch als Gesamtfehler ab; e2e: ControlMaster mitten im Batch beenden → UI-5, kein Rest unter dem Zielnamen | nein |
| F-07 | obligation | E3 (INV-8, SVC-12) | – (implement, test) | „Handler ruft `save()` am Handle … nutzt den bestehenden Speicherweg (`saveRef`) … `onSaved` wie bisher“ | `useGlobalShortcuts.ts:46-61` fängt keydown in der Capture-Phase und ruft `preventDefault` + `stopImmediatePropagation`, deshalb läuft die CM-Keymap `Mod-s` (`EditorPane.tsx:239-249`) nicht mehr; `onSaved` feuert heute nur dort bzw. im Vim-Handler (`:187-194`) bei `saveRef` → `true` | code | Ein Handle-`save()`, das `onSaved` weglässt oder immer ruft, bricht INV-8 | `save()` am Handle: `if (await saveRef.current()) onSavedRef.current?.()`; Test bzw. e2e: ⌘S bei Disk-Konflikt → kein `onSaved` | nein |
| F-08 | obligation | B/E (BR-18, SVC-15, MIG-63) | – (test) | „+ `@iconify-json/catppuccin`“; „kein … Icon-Set im Start-Graphen“ | `eager-graph.mjs:62` matcht nur Paket-Spezifier aus der Watch-Liste; `iconResolver.ts:3-4` importiert die lokalen Daten `./fileIcons` (2681 Z.) und `./folderIcons` (581 Z.), die kein Paket-Eintrag erfasst | code | Ein statischer Import von `fileIcons.ts` bliebe vom Eager-Test unentdeckt | Budget-Test prüft zusätzlich, dass `fileIcons.ts`/`folderIcons.ts` nicht im Start-Graphen beider Fenster liegen (Dateipfad oder Chunk-Name) | nein |
| F-09 | obligation | B (API-1) | – (implement) | „Wartet begrenzt auf den Main-Thread, Überschreitung → Fehler `clipboard read timed out or was cancelled`“ | Upstream `2723dc6:clipboard.rs:22-27` `recv_timeout(Duration::from_secs(5))` | code | Ein Wert fehlt im Dokument | 5 s wie Upstream; Fehlertext unverändert | nein |
| F-10 | obligation | B (BR-21, SEC-5) | – (qa, test) | „SSH lädt wie heute den Inhalt von Datei-Symlinks hoch, Ordner-Symlinks scheitern je Element“ | `ssh.rs:1166-1190`: `symlink_metadata` → Nicht-Dir-Zweig `std::fs::read(src)` folgt dem Link; ein verschachtelter Ordner-Symlink lässt `read` scheitern, der Fehler läuft per `?` hoch und lässt das ganze oberste Element scheitern | code | Ein Ordner mit innerem Ordner-Symlink scheitert als Ganzes | QA-Fall SSH: Ordner mit innerem Ordner-Symlink → genau dieses Element in `failed`, Staging entfernt, nichts unter dem Zielnamen | nein |
| F-11 | note | – | architecture.md | Zeilen-Anker | B-02 `OPS` `:557-560`; B-17 `:1177`; B-30 objc2 `:67-68`; B-38 `fs_copy_impl` bis `:257`; B-77 `ExplorerSearch.tsx:26` nur `fileIconUrl`; INV-13 Editor-Watches `useEditorFileSync.ts:65-75`; MIG-10 `:1052` ist keine `editor.undo`-Stelle (Freischaltung `:1007`) | code | – | keine Pflicht | nein |
| F-12 | note | – | architecture.md (Research Log) | „Standard-Statusleiste zeigt `git-branch` und `git-sync` (`layout.ts:44-51`)“ | `layout.ts:44-51` `DEFAULT_HIDDEN` = `git-changes`, `git-staged`, deshalb ist `line-changes` ebenfalls standardmäßig sichtbar | code | Die Schlussfolgerung „Git-Status bleibt per Default live“ gilt unverändert | keine Pflicht | nein |
| F-13 | note | – | discovery.md (BR-10) | „`prefers-reduced-motion` schaltet sie wie bisher ab“ | `globals.css:443-456` stoppt nur `.terax-shimmer`; Tailwind-`animate-spin`/`animate-pulse` (16 Stellen) laufen heute auch unter Reduced Motion; architecture.md INV-17/SVC-9 bilden den Bestand korrekt ab | code | – | PM-Hinweis: „wie bisher“ heißt nur Shimmer | nein |
| F-14 | note | – | discovery.md (UI Patterns) | „`ContextMenuShortcut` in `FileExplorer.tsx`“ | Nicht in `FileExplorer.tsx` genutzt; definiert in `components/ui/context-menu.tsx:228` und dort nutzbar | code | – | keine Pflicht | nein |
| F-15 | note | – | architecture.md (DTO `WorkspaceEnv`) | „bestehend: `{kind:"local"}` / `{kind:"ssh", host}`“ | `workspace.rs:322-331` hat zusätzlich `Wsl { distro }` | code | – | keine Pflicht (unverändert) | nein |
| F-16 | obligation | B (MIG-14, Risiko „Dateisystem ohne No-Replace-Rename“) | – (implement, test) | „sonst und bei nicht unterstütztem Dateisystem exklusive Reservierung“ | Upstream `2723dc6:mutate.rs:125-160` `rename_no_replace` ohne Rückfall; `copy.rs:146-148` gibt den OS-Fehler zurück, wenn das Ziel fehlt. Der Rückfall ist also Fork-eigener Code ohne Vorlage | code | Ohne Test bleibt der Rückfallpfad unbelegt | Rückfall nur bei `ENOTSUP`/`EINVAL` auslösen; Test über eine injizierbare Rename-Funktion, die diese Fehler liefert: Element erscheint unter freiem Namen, nie überschrieben | nein |
