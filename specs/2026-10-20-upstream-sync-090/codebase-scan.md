# Codebase Scan: Upstream-Sync Runde 4 (crynta v0.9.0, ohne Ghostty)

- **Feature:** Upstream-Sync 0.8.7 (7 Slices)
- **Scan-Datum:** 2026-10-27
- **Discovery:** `specs/2026-10-20-upstream-sync-090/discovery.md`
- **Branch/Worktree:** `upstream-sync-090` (Basis `68d45d0`, Fork-Version 0.8.6)
- **Methode:** Glob/Grep im Worktree, Upstream-Stand per `git show upstream/main:<pfad>` und `git ls-tree`. Kein `invariants_scope_cmd` in `zip.config.json` (Datei fehlt), Invarianten daher per grep erhoben. Kein bindings.md (Reconcile entfaellt).

---

## Identified Patterns

| # | Pattern | Fundstellen | Bezug zu Slice |
|---|---------|-------------|----------------|
| P1 | `*_impl`-Funktionen (rein, testbar) hinter duennen `#[tauri::command]`-Huellen, Tests mit `tempfile` + `reg_for(dir)` | `src-tauri/src/modules/fs/mutate.rs:207-244` (`fs_copy` -> `fs_copy_impl`), Tests ab `:262` | 3 (Benennung, Selbstkopie, Teilfehler) |
| P2 | SSH-Weg ueber dieselbe Command-Signatur: `WorkspaceEnv::Ssh` -> `ssh::copy` | `mutate.rs:227-229`, `ssh.rs:1202` | 3 |
| P3 | Tauri-Webview-Drag-Drop als einziger Aufrufer von `fs_copy`, Zielregel `dirAt()` | `src/modules/explorer/lib/useExplorerFileDrop.ts:20-42,72` | 3 |
| P4 | Refcounted Rust-Watcher, Frontend `watchAdd`/`watchRemove`/`listenFsChanged` | `src-tauri/src/modules/fs/watch.rs:101,184-205`, `src/modules/explorer/lib/watch.ts`, Nutzer `useFileTree.ts:120,125,180,217,231` und `editor/useEditorFileSync.ts:4-7,53-54` | 4 |
| P5 | Git-Status ueber ein einziges `useSourceControl(path, enabled)`, Pfad folgt `sourceControlActive` (Git-Tab offen oder Sidebar-Ansicht source-control) sonst Explorer-Wurzel; Fokus-Refresh per `window "focus"` | `source-control/useSourceControlContext.ts:61-82`, `useSourceControl.ts:151,460-474` | 4 |
| P6 | Globale Shortcuts: Registry `SHORTCUTS` + Handler-Map nach ID in `App.tsx`; Editor-Aktionen ueber `editorRefs.current.get(activeId)` (Vorlage `editor.undo`) | `shortcuts/shortcuts.ts:45,324`, `shortcuts/lib/useGlobalShortcuts.ts:16-17,45-65`, `App.tsx:976,1007,1052` | 1 (BR-17) |
| P7 | Tabs bleiben gemountet, Sichtbarkeit ueber `visible`-Prop und `invisible pointer-events-none` | `editor/EditorStack.tsx:18,33,47-49,156` (`visible={t.id === activeId}`) | 2 (BR-12) |
| P8 | Fenster-Aktivitaet als lokaler Modulzustand oder Hook (nicht geteilt) | siehe Anti-Slop K2 | 2, 5 |
| P9 | Eager-Graph-Budgettest auf Quellebene (statische Imports) | `src/app/eager-budget.test.ts`, `scripts/eager-graph.mjs` | 6 |
| P10 | `manualChunks` mit benannten Chunks je Lang-Pack/Provider | `vite.config.ts:66-120` | 6 |
| P11 | Lazy-Huellen `*Lazy.tsx` mit `lazy(() => import())` | `editor/EditorStackLazy.tsx`, `source-control/SourceControlPanelLazy.tsx`, `git-history/GitHistoryStackLazy.tsx`, `ai/components/lazy.tsx:6-18`, `doc/DocStack.tsx:27,32` | 6 |
| P12 | Context-Menue `ContextMenuItem` + Shortcut-Hinweis, Explorer-Tastatur ueber `handleKeyDown` auf dem Container | `explorer/FileExplorer.tsx:369-409,486,555-771` | 3 |
| P13 | Version in vier Quellen | `package.json:4`, `src-tauri/Cargo.toml:3`, `src-tauri/tauri.conf.json:4`, `src-tauri/Cargo.lock` (Paket `terax`, Zeile 5010) | 7 (BR-19) |

---

## Existing Abstractions

| Abstraktion | Location | Used by | Recommendation | Rationale |
|-------------|----------|---------|----------------|-----------|
| `fs_copy` / `fs_copy_impl` | `src-tauri/src/modules/fs/mutate.rs:207-244` | 1 Aufrufer (`useExplorerFileDrop.ts:72`), 1 Registrierung (`lib.rs:408`), 3 Tests (`mutate.rs:331,459,519`) | EXTEND | Einziger Kopierweg; Benennung, Teilfehler, Rueckgabeliste und Selbstkopie-Schutz kommen hinein. Upstream-Vorlage `upstream/main:src-tauri/src/modules/fs/copy.rs` (`copy_name`, Limit 10.000, Staging). |
| `ssh::copy` + `upload_recursive` + `remote_exists` | `src-tauri/src/modules/ssh.rs:1145-1215` | 1 Aufrufer (`mutate.rs:229`), 0 Tests | EXTEND | Remote-Ops `exists`, `rename`, `create_dir`, `write_bytes` sind vorhanden (`ssh.rs:1108-1160`); Staging + `rename` fuer BR-3 und `copy`-Suffix fuer BR-1 ohne neuen Remote-Op moeglich. Upload schreibt heute direkt ins Ziel (keine Atomizitaet fuer Ordner). |
| `ip_kind` + `IpKind` | `src-tauri/src/modules/net.rs:33-75` (einzeln, kein `net/`-Ordner) | 4 Aufrufer (`net.rs:91,107,160,282`), 9 Test-Assertions (`:446-503`) | REUSE (Aufrufer) / NEW (`net/ip.rs`) | Aufrufer bleiben, Funktion wird durch Upstream-`net/ip.rs` ersetzt. Fork-Datei ist ein Einzeldatei-Modul: `net.rs` bleibt, `net/ip.rs` wird Untermodul (Upstream hat dieselbe Form). Siehe K3. |
| `clipboard_write_text` (NSPasteboard via `objc2-app-kit`) | `src-tauri/src/lib.rs:132-163`, `Cargo.toml:66-68` (Features `NSEvent`, `NSPasteboard`) | 1 | EXTEND | Leseseite (`fs_clipboard_paths`) kann auf demselben `objc2`-Stack und Main-Thread-Muster aufsetzen; Upstream liest `NSPasteboardTypeFileURL` und hat zusaetzlich Windows/Linux-Zweige (fuer den Fork ausserhalb des Scopes, nur macOS noetig; `cfg`-Stub wie `lib.rs:162`). Cargo-Features der `objc2`-Crates muessen ggf. ergaenzt werden. |
| `EditorPaneHandle` | `src/modules/editor/EditorPane.tsx:48-63` | `EditorStack.tsx:5,11,19`, `App.tsx:976` (`editorRefs`) | EXTEND | `save()` fehlt im Handle; `saveRef` existiert (`:142-143`). `Mod-s` im CM-Keymap (`:241-249`) bleibt als Fallback. |
| Shortcut-Registry | `src/modules/shortcuts/shortcuts.ts` | `useGlobalShortcuts.ts`, Settings `ShortcutsSection.tsx` | EXTEND | Neue ID `editor.save` nach Muster `editor.undo`. Achtung: `space.overview` belegt bereits `Mod+Shift+S` (`shortcuts.ts:229-233`); `Mod+S` ohne Shift ist frei. Kein `shortcuts.test.ts` im Fork (Upstream hat eines). |
| `binaryPreviewMode` | `src/modules/editor/lib/binaryPreview.ts` (+ `.test.ts`) | `EditorPane.tsx:415` | REUSE | Klassifiziert image/video/audio/pdf; Upstream fuehrt `mediaPreview.ts` + `MediaPreview.tsx` neu ein (Fork hat beides nicht). Entscheidung Eigenbau vs. Upstream-Datei liegt beim Architecture-Agent. |
| `useFileTree` Watcher-Verwaltung | `explorer/lib/useFileTree.ts:117-126,180,217-224` | `FileExplorer.tsx` | EXTEND | Upstream-Vorlage `explorer/lib/watchRegistry.ts` (+ Test) existiert nur dort; Fork hat `watchedRef` direkt im Hook. Rust-Refcount (`watch.rs:184-205`) macht Teilentzug sicher (Editor-Watches bleiben). |
| `useSourceControl` | `source-control/useSourceControl.ts:151` | 1 Aufrufer (`useSourceControlContext.ts:82`), Ergebnis an `App.tsx:1596,1608,1620,1681`, `StatusBar.tsx:26,73`, `SourceControlPanel.tsx:90` | EXTEND | Eine einzige Instanz; "sichtbare Konsumenten" laesst sich zentral als `enabled`-Parameter oder Pause-Gate einbauen. Upstream-Vorlage `source-control/statusConsumers.ts` kennt keine Statusleisten-Widgets (Discovery BR-13). |
| `iconResolver` | `explorer/lib/iconResolver.ts:3-4` (statische Imports `fileIcons.ts` 2681 Z., `folderIcons.ts` 581 Z.) | 8 Importstellen: `TabBar.tsx:31`, `GitHistoryPane.tsx:15`, `ExplorerSearch.tsx:26`, `FileExplorer.tsx:38`, `CommandPalette.tsx:12`, `TreeRow.tsx:8`, `SourceControlPanel.tsx:45`, `ai/components/FilePicker.tsx:4` | EXTEND | Lazy-Start fuer das Icon-Set (BR-18) trifft alle 8. Upstream: `FileIcon.tsx`, `iconEngine.ts`, umgebauter `iconResolver.ts`. Der Test `d766567` (`iconResolver.test.ts`) passt nur auf den alten Resolver, im Fork gibt es keine Testdatei dazu. |
| Eager-Budget-Test | `src/app/eager-budget.test.ts` | `vitest` | EXTEND | Prueft schon `@ai-sdk`, `ai`, `streamdown`, `katex`, `@codemirror`, `@uiw` fuer beide Fenster auf Quellebene. AI-SDK und Editor sind damit bereits lazy; neu fuer BR-18: Icon-Set + gebautes Output (`dist-budget.test.ts`, `scripts/dist-graph.mjs` nur upstream). |
| Fenster-Aktivitaet | siehe Anti-Slop K2 | 8 Stellen | NEW (zentral) | Kein gemeinsamer Zustand vorhanden. |
| `lezer`-Highlight | `package.json:62` `@lezer/highlight ^1.2.3`; `pnpm-lock.yaml:904,6697` (genau 1 Version, 1.2.3) | `editor/lib/cmThemes.ts`, `ai-elements/chat-code-lezer.ts`, `chat-code.tsx`, `terminal/block/lib/shellEditor.ts` | EXTEND | Heute eine Kopie. `bf7e03d` (catalog + override) greift in `package.json:62` und `pnpm-workspace.yaml` ein; Fork hat dort bereits einen `overrides:`-Block (dompurify, react-grab, react-doctor), die Upstream-Hunks muessen darin zusammengefuehrt werden, nicht daneben. Es gibt weder `dist-budget.test.ts` noch `codeHighlight.test.ts` im Fork. |

---

## Recommendations

### REUSE

| Was | Pfad(e) | Nutzungsstellen | Begruendung |
|-----|---------|-----------------|-------------|
| `fs_copy`-Command als gemeinsamer Weg fuer Drop UND Einfuegen | `mutate.rs:207`, `lib.rs:408`, `useExplorerFileDrop.ts:72` | 2 belegt (Registrierung, Drop-Aufruf); Einfuegen wird der zweite Aufrufer | Ein Pfad, damit BR-2 (gleiche Benennung) nicht doppelt kodiert wird. Hinweis: heute 1 Aufrufer, Kriterium "ab 2" erst mit Einfuegen erfuellt; deshalb unter EXTEND gefuehrt, hier nur als Prinzip. |
| `watchAdd`/`watchRemove` + Rust-Refcount | `watch.ts:9-22`, `watch.rs:184-205` | `useFileTree.ts:120,125,217`, `useEditorFileSync.ts:53-54` (2 Module) | Teilentzug im Explorer beruehrt Editor-Watches nicht. |
| `ContextMenuItem`-Aufbau + Selektion `selectedPath` | `FileExplorer.tsx:555-771,201` | 20+ Menue-Eintraege | Paste-Eintrag fuegt sich ein. |
| `editor.undo`-Handler-Muster fuer `editor.save` | `App.tsx:976,1007`, `useGlobalShortcuts.ts:16-17,54` | 2 Handler (`editor.undo`, `editor.redo`) | Gleiche Fensterfalle (WebKit faengt das Kuerzel vor dem Editor ab). |
| Eager-Graph-Tracer fuer weitere Budget-Tests | `scripts/eager-graph.mjs` | `eager-budget.test.ts` (2 Faelle) | Icon-Set-Assertion ergaenzen, ohne neues Werkzeug. |
| Test-Helfer `reg_for` / `tempfile` | `mutate.rs:268-273` | 8 Tests in `mutate.rs` | Rust-Tests fuer Benennung/Selbstkopie/Teilfehler. |

### EXTEND

| Was | Pfad(e) | Was fehlt |
|-----|---------|-----------|
| `fs_copy_impl` | `mutate.rs:219-244` | Parameter `rename_on_conflict`, Rueckgabe `Vec<String>` (heute `()`), Teilfehler-Sammlung, Selbstkopie-Pruefung, Staging + No-Replace-Publish (BR-3). Heute: bricht bei erstem Fehler ab (`:236-243`), verweigert via `symlink_metadata` (`:235`). |
| `ssh::copy` | `ssh.rs:1202-1215` | Kopier-Suffix, Teilfehler, Staging-Name + `rename`. Heute wirft `already exists` (`:1210`) und arbeitet ohne Staging. |
| `useExplorerFileDrop` | `useExplorerFileDrop.ts:68-79` | Fehler-Toast `Copy failed` -> Teilfehler-Toast (UI-7), Rueckgabeliste fuer Markierung. |
| `FileExplorer` | `FileExplorer.tsx:369-409,555-771` | Menue-Eintrag `Paste`, Cmd+V in `handleKeyDown` (nur mit Explorer-Fokus, BR-8). Hinweis Selektion siehe Konventionen/Risiko: `selectedPath: string | null` (`:201`), UI-6 verlangt mehrere markierte Elemente. |
| `EditorPane` / `EditorStack` | `EditorPane.tsx:48-63,241-249,446-463`, `EditorStack.tsx:156` | `save()` im Handle; `visible`-Prop an `EditorPane` (heute nur Wrapper-Klasse `EditorStack.tsx:47`); `<video>`/`<audio>` pausieren + `hidden` (`:446-463` haben `controls`, `preload="metadata"`, kein Pause). |
| `useFileTree` | `useFileTree.ts:105-126,205-226` | Watcher nur bei sichtbarem Explorer; beim Wiedersichtbarwerden alle geladenen Ordner neu einlesen (Muster `:239-247`). |
| `useSourceControl` / `useSourceControlContext` | `useSourceControlContext.ts:61-82`, `useSourceControl.ts:460-474` | Pause, wenn kein Konsument sichtbar; Konsument "Statusleisten-Git-Widget" einbeziehen (`GitWidgets.tsx:18,39,62,82,103`). |
| `iconResolver` | `iconResolver.ts` | asynchrones/lazy Laden von `fileIcons`/`folderIcons`; Aufrufer (8) auf Platzhalter-/Lade-Zustand bringen. |
| `globals.css` Animationen | `src/styles/globals.css:334-453` | Stufen (`steps()`) fuer Endlos-Animationen, Pause-Attribut am `html`-Element. |
| `net.rs` | `net.rs:33-75` | `ip_kind` ersetzen durch Upstream-`net/ip.rs` (263 Z., nur `std`). |
| `Cargo.toml` | `Cargo.toml:31` (`dirs = "6"`), `:37` (`grep-matcher = "0.1"`) | `dirs` auf 7 (13 `dirs::`-Stellen, Discovery), `grep-matcher` entfernen (`grep_matcher` im Quellcode: 0 Treffer). |
| `ci.yml` | `.github/workflows/ci.yml:17,58,110,133` | 4x `actions/checkout@v7` ohne `persist-credentials: false`. |
| `markdown-code.tsx` | `ai-elements/markdown-code.tsx:24` | `text-[11px]` fest; `d3c8fd7` ersetzt durch Erben der Textgroesse (clean pick). Datei liegt unter `components/ai-elements/` (laut TERAX.md "nicht von Hand patchen", gilt fuer Registry-Dateien; diese Datei ist Fork-eigene Komposition, Upstream patcht sie ebenfalls). |

### NEW

| Was | Begruendung |
|-----|-------------|
| Gemeinsamer Fenster-Sichtbarkeits-Zustand (Store/Hook + `data`-Attribut am `html`) | Kein zentrales Gegenstueck; acht Stellen halten eigene Kopien (K2). |
| `fs_clipboard_paths`-Command (macOS, `cfg`-Stub sonst) | Fork liest die Zwischenablage nirgends (`clipboard_write_text` ist Schreibseite). |
| Reine Benennungsfunktion `copy_name` (Rust, einmal, von lokal UND SSH genutzt) | BR-1/BR-2; zwei getrennte Kodierungen waeren K2. |
| `clipboardPaste.ts` (Zielordner-Aufloesung, pure) | Upstream-Vorlage `upstream/main:src/modules/explorer/lib/clipboardPaste.ts` + Test. |
| `dist-budget.test.ts` + `scripts/dist-graph.mjs` | Gebaute-Output-Test fuer BR-18 und BR-20 (Upstream-Vorlage); Fork hat nur den Quell-Test. |
| `iconResolver.test.ts`, `applyTheme.test.ts`, `customThemes.test.ts` | Nicht vorhanden (`ls explorer/lib/*.test.*` nur `gitStatusUtils.test.ts`; `theme/` nur `resolveEditorTheme.test.ts`, `validateTheme.test.ts`). Test-Commits `d766567`, `258d119`, `13ded38` fuellen die Luecke; `d766567` setzt den alten Resolver voraus (Reihenfolge mit Icon-Lazy-Umbau beachten). |

### AVOID

| Pattern | Grund / Alternative |
|---------|---------------------|
| Neues `document.hidden`/`hasFocus()`-Listener-Paar pro Feature | Feature replaces this: Slices 2 und 5 duerfen nicht als neunte Kopie entstehen, sondern nutzen den neuen zentralen Zustand (Alternative: NEW-Eintrag oben). |
| Upstream-Fokus-Kopplung (`html[data-window-inactive]` bei Fokusverlust) | Feature replaces this: BR-9 verlangt Sichtbarkeit, nicht Fokus. Upstream-CSS nicht 1:1 uebernehmen. |
| Alte `ip_kind`-Fassung neben `net/ip.rs` behalten | Feature replaces this: Rueckbau, siehe K3. |
| `fd21291` / `39fa919` / `ff20d93` / Ghostty-Teile | Out of Scope laut Discovery. Hinweis: `useExplorerFileDrop.ts` und `useFileTree.ts` sind in Upstream durch `0a6e511` umgebaut; nur per Handarbeit auf Fork-Stand anpassen. |

---

## Anti-Slop Findings

Linse vollstaendig gelaufen (vier Fragen je Deliverable). Registry `slop-false-positives.md`: nicht vorhanden (weder `specs/architecture/` noch Repo-Wurzel), daher 0 Unterdrueckungen.

| class | subject | sites | existing_owner | guards_present | exit_condition | suggested_resolution | evidence |
|-------|---------|-------|----------------|----------------|----------------|----------------------|----------|
| k2_knowledge_copy | "Fenster ist aktiv/sichtbar" (Slices 2, 5) | `terminal/lib/rendererPool.ts:103-113`, `terminal/lib/useTerminalSession.ts:551,575`, `theme/SurfaceLayer.tsx:132-137`, `app/App.tsx:477`, `statusbar/lib/useClaudeStatus.ts:55`, `agents/components/SshAgentActivityPoller.tsx:141`, `spaces/lib/useSpacePersistence.ts:92-96`, `agents/lib/useWindowFocus.ts:13` | keine zentrale Schule: 7 Stellen lesen `document.hidden`, 3 davon kombiniert mit `hasFocus()` (`rendererPool.ts:103`), 1 nutzt Tauri `onFocusChanged` (`useWindowFocus.ts`, 2 Nutzer: `AgentNotificationsBridge.tsx:118`, `LocalAgentNotificationsBridge.tsx:31`) | je Site: kein Sync-Guard, kein Pin-Test; Definitionen divergieren bereits (Sichtbarkeit vs. Fokus vs. Tauri-Fokus) | n/a | consolidate: neuer Zustand wird Owner, neue Slices haengen daran; Altstellen nur migrieren, wo Semantik gleich ist (Terminal-Cursor-Blinken `rendererPool.ts` bewusst Fokus-gekoppelt, nicht automatisch Sichtbarkeit) | `rendererPool.ts:103` `!document.hidden && document.hasFocus()` vs. `SurfaceLayer.tsx:132` nur `document.hidden`: zwei Antworten auf "aktiv" |
| k3_stale_workaround | `ip_kind` ohne eingebettete IPv4 | `net.rs:33-75`, Tests `net.rs:446-503` | `net/ip.rs` (Upstream) liefert die vollstaendige Fassung | Tests decken nur reine v4 und `fd00:ec2::254`/`fe80::1`/`::1` (keine `::ffff:`-Faelle) | none (kein Marker); Bedingung faktisch erfuellt sobald `net/ip.rs` uebernommen ist | dismantle: alte Funktion + alte Tests im selben Slice entfernen, Upstream-Tests (ip-Tests) uebernehmen | `net.rs:50-52` behandelt `IpAddr::V6` nur ueber Loopback/fd00:ec2/fe80/fc00; `::ffff:127.0.0.1` faellt auf `Public` (Zeile `:70`) |
| k2_knowledge_copy | Kopier-Benennung bei Konflikt (lokal + SSH) | `mutate.rs:229-243` (lokal), `ssh.rs:1202-1214` (SSH), Upstream `fs/copy.rs` | keiner (heute: beide verweigern) | kein Guard gegen Divergenz | n/a | consolidate: eine reine Benennungsfunktion; SSH ruft sie mit `exists`-Pruefung als Kandidaten-Prueffunktion. Vorsicht: lokale Variante macht Staging+no-replace, SSH nur `exists` + `rename` (TOCTOU-Fenster, kein atomares No-Replace remote) | `mutate.rs:235` `symlink_metadata`-Pruefung vs. `ssh.rs:1209` `remote_exists`: zwei getrennte Konfliktlogiken, beide muessen BR-1 gleich umsetzen |
| k4_pattern_fork | Lazy-Laden schwerer Module | Schule A `lazy()`-Huellen: `EditorStackLazy.tsx`, `SourceControlPanelLazy.tsx`, `GitHistoryStackLazy.tsx`, `ai/components/lazy.tsx`, `doc/DocStack.tsx:27,32`, `WorkspaceInputBar.tsx:22-23`; Schule B dynamischer `import()` in Ressourcen-Tabellen: `ai-elements/chat-code-lezer.ts:17-93` | Schule A (6 Stellen) fuer Komponenten, B (Lang-Packs) fuer Daten; getrennte Concerns, durch `eager-budget.test.ts` abgesichert | Guard vorhanden (Quell-Test), fuer Icon-Set noch nicht | n/a | kein Fund fuer Komponenten/Daten; Hinweis: Icon-Set ist Daten (Schule B), nicht `lazy()`-Komponente | `eager-budget.test.ts:10` HEAVY-Liste ohne Icon-Set |
| k1_dual_mechanism | Drop und Einfuegen schreiben ins Ziel | `useExplorerFileDrop.ts:72` (Drop), kuenftig Paste-Hook | `fs_copy` ist der eine Owner | Guards symmetrisch, solange beide `fs_copy` rufen (Jail `authorize_mutation_dir` `mutate.rs:233`) | n/a | kein Fund heute; Risiko bei Umsetzung: eigener Kopierweg fuer Paste waere K1. Beide ueber `fs_copy` fuehren | Discovery FL-5/BR-2, `mutate.rs:219-244` |

Unterdrueckt via False-Positive-Registry: 0

---

## Conventions Detected

| Bereich | Convention | Beleg |
|---------|------------|-------|
| Kommentare | Default keine, hoechstens 1-2 Zeilen "warum"; kein Em-Dash, keine Emojis | `TERAX.md` Abschnitt Conventions |
| Imports | `@/...` ueber Modulgrenzen; innerhalb eines Moduls relativ (`./lib/...`) | `FileExplorer.tsx:38`, `useExplorerFileDrop.ts:5` |
| Paketmanager | nur `pnpm` | `TERAX.md` |
| Rust-Command-Form | `#[tauri::command] pub fn x(..., registry: State)` ruft `x_impl(..., &registry)`; Tests testen `_impl` | `mutate.rs:207-244` |
| Rust-Fehler | `Result<_, String>`, Meldung `already exists: {path}` | `mutate.rs:236-238`, `ssh.rs:1210` |
| Rust-Plattform | `#[cfg(target_os = "macos")]` mit Stub fuer andere (`clipboard_write_text`) | `lib.rs:132-163` |
| Rust-Logging | `log::warn!` mit Quell-/Zielpfad bei Fehlern | `mutate.rs:238-243` |
| Frontend-Tests | vitest, Dateien neben dem Code `*.test.ts(x)`; Kernsubsystem braucht Test fuer die Invariante | `TERAX.md` Quality bar; `gitStatusUtils.test.ts`, `useSidebarPanel.test.ts` |
| Gates | `pnpm lint` (biome), `pnpm check-types`, `pnpm test`, `cargo clippy`, `cargo test --locked` | `package.json:17-21`, `TERAX.md` |
| Explorer-Pfade | `data-fs-path` an Zeilen, `data-explorer-drop` an der Flaeche; Vorwaerts-Slash intern | `useExplorerFileDrop.ts:35-40` |
| Shortcuts | ID in `ShortcutId`-Union + Eintrag in `SHORTCUTS` + Handler in `App.tsx`-Map | `shortcuts.ts:45,324`, `App.tsx:976` |
| Versions-Anzeige | `getVersion()` aus Tauri-App (liest `tauri.conf.json`) + `build_info` | `settings/sections/AboutSection.tsx:4,30-32` |

---

## Key Integration Points

| Punkt | Pfad | Hinweis |
|-------|------|---------|
| Command-Registrierung | `src-tauri/src/lib.rs:408` (`fs::mutate::fs_copy`), `:472-474` (`net::*`) | `fs_clipboard_paths` hier eintragen; `Capabilities` (`capabilities/default.json`) fuer eigene Commands nicht noetig (nur Plugin-APIs) |
| Window-Events (Rust) | `src-tauri/src/lib.rs:339-352` (`on_window_event`, nur `Destroyed` auf macOS) | Moeglicher Ort fuer Sichtbarkeits-Signal; heute nirgends Occlusion/Minimize ausgewertet (`WindowEvent` nur `Destroyed`). WebKit-`visibilitychange` liefert `document.hidden` bei minimiert/anderer Space (siehe Test-Bridge-Gotcha `document.hidden`) |
| Explorer-Einbindung | `App.tsx:1591-1598` (`FileExplorer` nur bei `sidebarView === "explorer"`, `key={sidebarView}`) | Bei zugeklappter Sidebar bleibt `FileExplorer` gemountet (Panel auf 0 px, `App.tsx:1581-1585`, `useSidebarPanel.ts:105-118`), Watcher laufen daher weiter. Sichtbarkeit = `explorer` UND nicht eingeklappt |
| Git-Status-Weitergabe | `App.tsx:1596` (Explorer-Farben, nur wenn `explorerGitDecorations`), `:1620` (Rail-Badge `changedCount`), `:1681` + `StatusBar.tsx:73` (Widgets) | Rail-Badge ist ebenfalls Konsument (Discovery BR-13 nennt ihn nicht) |
| Editor-Handle | `App.tsx:976` `editorRefs.current.get(activeId)` | ⌘S-Handler `editor.save` analog |
| Editor-Sichtbarkeit | `EditorStack.tsx:156` `visible={t.id === activeId}`, `EditorPane` bekommt es nicht | BR-12 braucht Prop |
| Media-Elemente | `EditorPane.tsx:446-463` | Asset-Protokoll (`assetUrl`), `controls` an |
| Lazy-Grenze Editor | `editor/EditorStackLazy.tsx` | "Erstes Oeffnen darf nachladen" ist schon Zustand |
| Build | `vite.config.ts:66-120` | Chunk-Namen fuer Icon-Set-Chunk ergaenzen |
| CI | `.github/workflows/ci.yml` | Hunk `e8f9fcd` per Handarbeit auf 4 Checkout-Stellen |
| Version | `package.json:4`, `Cargo.toml:3`, `tauri.conf.json:4`, `Cargo.lock` Paket `terax` | `cargo`/`pnpm` regenerieren die Lockfiles |
| Deps-Overrides | `pnpm-workspace.yaml` (Block `overrides:` mit `dompurify`, `react-grab`, `react-doctor`) | `bf7e03d` fuegt `catalog:` + `@lezer/highlight`-Override hinzu, Merge-Stelle |
| `dirs`-Update | 13 `dirs::`-Stellen in `src-tauri/src` | Discovery: nur `home_dir` |

---

## Existing-Behavior Invariants

Scoping: nur beruehrte Module + direkte Konsumenten. Test-Scope des Projekts: `vitest run` (Frontend), `cargo test --locked` (Rust). Alle Zeilen sind Kandidaten, Bestaetigung und INV-IDs in der Architecture-HITL.

| # | invariant | consumers | source | coverage | routing |
|---|-----------|-----------|--------|----------|---------|
| 1 | `fs_copy` lokal legt Datei und Ordner (rekursiv) im Ziel an und verweigert vorhandenes Ziel mit `already exists` (WIRD DURCH BR-1 BEWUSST GEAENDERT: Kopie statt Fehler; Test muss angepasst werden) | `useExplorerFileDrop.ts:72` | Test `copy_brings_file_and_dir_in_and_refuses_clobber` `mutate.rs:331` | covered | none |
| 2 | `fs_copy` verweigert Ziel ausserhalb freigegebener Wurzeln | `useExplorerFileDrop.ts:72` | Test `copy_rejects_unauthorized_dest` `mutate.rs:459` | covered | none |
| 3 | `fs_copy` ueberschreibt nie einen haengenden Symlink am Ziel (kein Schreiben ausserhalb des Ziels) | `useExplorerFileDrop.ts:72` | Test `copy_refuses_prestaged_dangling_symlink_at_dest` `mutate.rs:519` | covered | none |
| 4 | `fs_copy` in SSH-Workspace laedt rekursiv hoch und verweigert vorhandenes Ziel | `mutate.rs:229` (Weiterleitung), `useExplorerFileDrop.ts:72` | Code `ssh.rs:1202-1214`; kein Test | uncovered | differential_check |
| 5 | Drop: Ziel = Ordner unter Zeiger, Datei -> deren Ordner, freie Flaeche -> Wurzel; Fehler-Toast `Copy failed: {err}` (Toast aendert sich nach UI-7) | `FileExplorer.tsx` (Hook-Nutzung), `data-fs-path`-Zeilen `TreeRow.tsx` | Code `useExplorerFileDrop.ts:20-42,77-78`; kein Test | uncovered | qa_matrix |
| 6 | SSRF: IPv4 link-local = BlockedMetadata, Loopback/unspecified = Loopback, RFC1918/CGNAT = Private, oeffentliche = Public; v6 `::1` Loopback, `fd00:ec2::254` und `fe80::/10` BlockedMetadata, `fc00::/7` Private | `net.rs:91,107,160,282` (Aufloesung + Verbindungs-Pinning) | Tests `net.rs:446-503` | covered | none |
| 7 | SSRF-Verhalten fuer `::ffff:a.b.c.d` usw. ist heute NICHT geschuetzt (wird gehaertet; kein zu erhaltendes Verhalten) | `net.rs:33-75` | Code `net.rs:50-72` | uncovered | none (Zielverhalten kommt aus Upstream-Tests `net/ip.rs`) |
| 8 | Editor speichert per `Mod-s`, wenn der CM-Editor Fokus hat; `onSaved` feuert nur bei echtem Schreiben | `EditorPane.tsx:188-193,241-249` | Code; kein Test fuer `EditorPane` | uncovered | differential_check (synthetischer Shortcut ueber Test-Bridge, Datei vorher/nachher) |
| 9 | `Mod+Shift+S` oeffnet die Spaces-Uebersicht (darf durch `Mod+S` nicht kollidieren) | `useGlobalShortcuts.ts:48-60`, `shortcuts.ts:229-233` | Code; kein `shortcuts.test.ts` | uncovered | differential_check |
| 10 | Medien-Modus-Klassifikation (image/video/audio/pdf/card) | `EditorPane.tsx:415` | Tests `src/modules/editor/lib/binaryPreview.test.ts` | covered | none |
| 11 | Video/Audio spielen im aktiven Editor-Tab mit Controls; Tab-Wechsel laesst Wiedergabe heute weiterlaufen (Aenderung durch BR-12) | `EditorStack.tsx:156`, `EditorPane.tsx:446-463` | Code; kein Test | uncovered | qa_matrix |
| 12 | Explorer-Baum aktualisiert Ordner bei `fs:changed` fuer geladene Ordner; Watcher werden bei Wurzelwechsel/Unmount freigegeben | `useFileTree.ts:180,217-247` (Konsument `FileExplorer.tsx`) | Code; Rust-Seite ohne Refcount-Test (`watch.rs` Tests `:287,296` nur Filter/Dedup) | uncovered | differential_check (Datei anlegen, Sidebar zu/auf, Baum vorher/nachher) |
| 13 | Rust-Watcher ist refcounted: Entzug durch Explorer beruehrt Editor-Watches nicht | `watch.rs:184-205`; Aufrufer `useFileTree.ts`, `useEditorFileSync.ts:53-54` | Code; kein Test | uncovered | differential_check |
| 14 | Git-Status: eine `useSourceControl`-Instanz speist Rail-Badge, Explorer-Farben (nur mit Praeferenz), Statusleisten-Widgets, Panel; Auffrischung beim Fenster-Fokus | `App.tsx:1596,1620,1681`, `StatusBar.tsx:73`, `GitWidgets.tsx:18,39,62,82,103` | Code `useSourceControl.ts:460-474`; Tests nur `gitStatusUtils.test.ts` (reine Hilfen) | uncovered | differential_check |
| 15 | Pfad fuer Git-Status = Source-Control-Kontextpfad bei offenem Git-Tab/Sidebar-Ansicht, sonst Explorer-Wurzel | `useSourceControlContext.ts:61-82` | Code; kein Test | uncovered | differential_check |
| 16 | Explorer-Auswahl ist EINZELauswahl (`selectedPath: string | null`) | `FileExplorer.tsx:201`, Tastatur `:380-409` | Code; kein Test | uncovered | none (Hinweis fuer Architecture: UI-6 "alle markiert" kollidiert; Mehrfachauswahl ist laut Discovery Out of Scope) |
| 17 | Tab-Spinner/Mission-Control-Spinner/Shimmer laufen dauerhaft (flaessig) und stoppen bei `prefers-reduced-motion` | `TabActivityIndicator.tsx`, `AgentMissionControl.tsx`, `NotificationBell.tsx`, `AgentStatusWidget.tsx` (`animate-spin`/`animate-pulse`), `globals.css:416-453` | Code `globals.css:453` (`animation: none`); kein Test | uncovered | qa_matrix |
| 18 | Terminal-Renderer-Pool und Cursor-Blinken richten sich nach `visibilitychange`/Fokus | `rendererPool.ts:103-113`, `useTerminalSession.ts:551,575` | Code; Pool-Tests unter `terminal/lib` (nicht einzeln geprueft) | uncovered | qa_matrix |
| 19 | Startbundle enthaelt kein `@ai-sdk`, `ai`, `streamdown`, `katex`, `@codemirror`, `@uiw` (beide Fenster) | `src/main.tsx`, `src/settings/main.tsx` | Tests `src/app/eager-budget.test.ts` (2 Faelle) | covered | none |
| 20 | Icon-Aufloesung `fileIconUrl`/`folderIconUrl` liefert synchron eine URL | 8 Aufrufer (siehe Existing Abstractions) | Code `iconResolver.ts`; kein Test | uncovered | differential_check (Test `d766567` kann als Vorher-Aufnahme dienen, wenn er vor dem Umbau eingespielt wird) |
| 21 | Editor faerbt JS/TS in allen Editor-Themes und Chat-Code-Bloecken mit genau einer `@lezer/highlight`-Kopie (heute 1.2.3, einmal im Lock) | `cmThemes.ts`, `chat-code-lezer.ts`, `chat-code.tsx` | Code `pnpm-lock.yaml:904`; kein Test | uncovered | differential_check (Test aus `bf7e03d` einspielen, vor und nach Deps-Update laufen lassen) |
| 22 | Versionsanzeige im About-Bereich liest die Tauri-App-Version | `AboutSection.tsx:30` | Code; kein Test | uncovered | differential_check |

---

## Bindings Context

No bindings file found. (`bindings_path` = null, Reconcile entfaellt.)

---

## Scan Summary

| Kennzahl | Wert |
|----------|------|
| Identified Patterns | 13 |
| Existing Abstractions | 13 |
| Empfehlungen REUSE (Muster/Weg) | 6 |
| Empfehlungen EXTEND | 12 |
| Empfehlungen NEW | 6 |
| Empfehlungen AVOID | 4 |
| Anti-Slop K1 | 1 (kein Fund heute, Risiko dokumentiert) |
| Anti-Slop K2 | 2 |
| Anti-Slop K3 | 1 |
| Anti-Slop K4 | 1 (kein Fund, Hinweis) |
| Unterdrueckt (Registry) | 0 |
| Invarianten gesamt | 22 |
| Invarianten covered | 6 (Nr. 1, 2, 3, 6, 10, 19) |
| Invarianten uncovered | 16 (Nr. 7 ist Ziel-, kein Erhaltungsverhalten, daher in der JSON-Liste ausgelassen: dort 15 uncovered) |

### Wichtigste Befunde fuer die Architecture

1. **Lazy-Start ist weitgehend schon da.** AI-SDK und Editor sind lazy und per Quell-Test gesichert (`eager-budget.test.ts`). Offen: Icon-Set (8 statische Importstellen ueber `iconResolver.ts`) und ein Test auf dem gebauten Output (`dist-budget.test.ts`, `scripts/dist-graph.mjs` fehlen).
2. **Kein zentraler Fenster-Sichtbarkeits-Zustand.** Acht verteilte Stellen (K2). Slices 2 und 5 brauchen EINEN neuen Owner; nur Sichtbarkeit (BR-9), nicht Fokus.
3. **Explorer bleibt bei zugeklappter Sidebar gemountet** (Panel 0 px). Watcher laufen deshalb auch hinter geschlossener Sidebar; "sichtbar" muss aus `sidebarView` plus Collapsed-Zustand abgeleitet werden. Rust-Watcher ist refcounted, Teilentzug ist sicher.
4. **Rail-Badge ist ein Git-Status-Konsument** (`App.tsx:1620`), in BR-13 nicht genannt. Im Fork liefert er `changedCount` immer; BR-13 darf ihn nicht einfrieren, oder die Konsumentenliste muss ihn aufnehmen.
5. **UI-6 (alle neuen Elemente markieren) kollidiert mit Einzelauswahl** (`FileExplorer.tsx:201`); Mehrfachauswahl ist Out of Scope. Entscheidung noetig: erstes Element markieren oder Zielordner aufklappen.
6. **SSH-Upload ist nicht atomar** (`ssh.rs:1168-1190`): BR-3 braucht Staging + `rename` auf dem Host; ein echtes No-Replace-Rename gibt es remote nicht (`rename`-Op `ssh.rs:1128`, `exists` `:1148`). TOCTOU-Fenster bewusst benennen.
7. **`Mod+S` ist frei, `Mod+Shift+S` belegt** (Spaces-Uebersicht `shortcuts.ts:229-233`).
8. **`bf7e03d` trifft einen bestehenden `overrides:`-Block** in `pnpm-workspace.yaml`; Fork hat heute genau eine `@lezer/highlight`-Kopie (1.2.3), Fehlerbild entsteht erst durch das Deps-Update.
9. **`d766567` (iconResolver-Test)** passt auf den alten Resolver; vor oder in der Icon-Lazy-Umstellung einspielen, sonst muss der Test mit umgebaut werden.
10. **Rust `net.rs` ist Einzeldatei**; `net/ip.rs` als Untermodul zusaetzlich (kein `mod.rs`-Umbau noetig). Upstream hat zusaetzlich `net/clients.rs`, `net/stream.rs` (nicht im Scope).
