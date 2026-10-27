# Gate 1: Architecture Compliance, Perspektive `ui`

| Feld | Wert |
|------|------|
| Geprüft | `specs/2026-10-20-upstream-sync-090/architecture.md`, `discovery.md`, `codebase-scan.md` |
| Wireframes | keine (`discovery.md:6`: UI-Änderungen klein); Prüfgrundlage UI-/ST-/TR-Tabellen der Discovery + Bestandskomponenten |
| Bindings | keine (`bindings_path` = null) → E2 entfällt |
| Codebase | Worktree `upstream-sync-090`, HEAD `68d45d0`; Upstream per `git show upstream/main` / Commit-SHAs |
| Prüfdatum | 2026-10-27 |
| Perspektive | `ui` (UI-Bestand, Hooks, Komponenten, Toasts, Explorer-Auswahl/-Kontextmenü, Media-Preview, CSS-Animationen/Design-System, Icons, About) |
| Modus | offener Lauf (kein Delta) |

## Skript-Tabelle (Arch-Precheck, übernommen)

| Ergebnis | ID | Klasse | Detail |
|----------|----|--------|--------|
| PASS | AR-7 | note | Scan-Plausibilität: 3 NEW-Zeilen ohne Zielpfad (Zielpfade stehen in architecture.md unter Context & Research) |

ID-Marker, ID-Existenz, Anker-Existenz, Enum-Werte, Versions-Literale, Scan-Zählungen, Registry- und Exception-Form gelten damit als geprüft und wurden nicht erneut gemessen (P5). Zeilenanker wurden nur gelesen, um Aussagen zu messen.

## Summary

| Klasse | Anzahl |
|--------|--------|
| decision | 0 |
| refuted | 0 |
| fix | 6 |
| obligation | 3 |
| note | 6 |

**Verdict:** APPROVED

Prüfmenge: 54 UI-Bestands-Behauptungen erhoben, 54 gemessen, 0 nicht gemessen (Self-Check: 54 Verdikte + 0 NICHT-GEMESSEN = 54).

---

## A) Feature Mapping (UI-Anteil)

| Item | Evidenz | Status |
|------|---------|--------|
| UI-1 Paste im Zeilen- und Flächen-Menü | MIG-22, SVC-6; Bestand: Zeilen-Menü `FileExplorer.tsx:662-760`, Flächen-Menü `:762-803` | PASS |
| UI-2 ⌘V nur mit Explorer-Fokus | VAL-7, MIG-22; Container-Handler `FileExplorer.tsx:482-486`, Zeilen sind `<button>` im Container (`TreeRow.tsx:84`) → Bubbling erreicht den Handler | PASS |
| UI-3/UI-4/UI-5 Toasts | SVC-5 `reportCopyFailures`; `sonner` 2.0.8 hat `toast.message` und `toast.error(title,{description})` (`node_modules/sonner/dist/index.d.ts`), `<Toaster>` `App.tsx:1695` | PASS |
| UI-6 Einzelauswahl nach Einfügen | SVC-6, Q&A #4; `selectedPath` `FileExplorer.tsx:201`, `tree.expand` `:275`, `scrollEntryIntoView` `:293-300` | PASS (Auflage O-1) |
| UI-7 Drop mit Konfliktbenennung | MIG-23, SVC-6; Bestand `useExplorerFileDrop.ts:68-79` | PASS |
| UI-8 Animationen | SVC-7, SVC-9, MIG-40, MIG-41 | PASS (Fixes F-2, F-6) |
| UI-9 Media-Preview | SVC-8, MIG-29 bis MIG-34; einzige Medien-Elemente `EditorPane.tsx:448,457` | PASS |
| UI-10 About 0.8.7 | MIG-70; `AboutSection.tsx:30` `getVersion()`, Quelle `tauri.conf.json:4` | PASS |
| ST-1..ST-9, TR-1..TR-10 | Context & Research, Discovery-Abdeckung (architecture.md:601-603) | PASS |
| FL-4 / UI-Layout „neue Elemente markiert" | Q&A #4 hat FL-4, UI-6, ST-3 nachgezogen; `discovery.md:145` nicht | FIX F-5 |

## B) Constraint Mapping (UI-Anteil)

| Constraint | Architecture-Antwort | Status |
|------------|----------------------|--------|
| BR-5 Ziel nach Markierung / Zeilen-Menü | SVC-5 `pasteTargetDir`; Bestand: Rechtsklick setzt `menuTarget`, nicht `selectedPath` (`FileExplorer.tsx:571-586`) | PASS (Auflage O-3) |
| BR-8 ⌘V nur im Explorer | VAL-7; Container-Handler, Eingabefeld-Ausschluss `FileExplorer.tsx:370-377` | PASS |
| BR-9 nur Sichtbarkeit, nicht Fokus | SVC-7 aus `visibilityState`; fokusgekoppelte Stellen bleiben (`rendererPool.ts:102-126`, `useWindowFocus.ts:6,13`) | PASS |
| BR-10 Stufen, Reduced-Motion wie bisher | MIG-40 `@theme`-Override (Tailwind 4.3.3, `node_modules/tailwindcss/theme.css:438-440`), Reduced-Motion-Block unverändert (`globals.css:452-465`) | PASS (Hinweis N-5) |
| BR-11 Explorer sichtbar = Ansicht explorer + offen | SVC-10, Q&A #6; Explorer bleibt bei 0 px gemountet (`App.tsx:1578-1598`), Einklappen nur über `onResize` erfasst (`App.tsx:1584-1586`) | PASS |
| BR-12 Media pausiert/ausgeblendet, kein Auto-Resume | SVC-8; Upstream-Begründung (5502f82): Medien ignorieren `visibility:hidden` der Vorfahren → `hidden` am Element | PASS |
| BR-13 sichtbare Git-Konsumenten | SVC-11 inkl. Rail-Badge (`App.tsx:1617-1621` im Sidebar-Panel) und 5 Widgets (`GitWidgets.tsx:17-103`, `registry.ts:26-30`); Zen blendet nur Header/Statusleiste aus (`App.tsx:1509,1669`) | PASS |
| BR-17 ⌘S auf App-Ebene | SVC-12; Registry greift im Capture vor CodeMirror und stoppt das Event (`useGlobalShortcuts.ts:61-68`) → kein Doppel-Speichern über `Mod-s` (`EditorPane.tsx:240-250`) | PASS |
| BR-18 Icon-Set nicht im Start | SVC-14, MIG-52, MIG-63; Icon-Daten werden nur von `iconResolver.ts:1-4` importiert | PASS |
| EP-5 kein Workspace | `FileExplorer.tsx:349-363` rendert ohne Container/Handler | PASS |

## C) Realistic Data

| Item | Evidenz | Status |
|------|---------|--------|
| Datenbank/Migrationen | Terax ohne DB (architecture.md:109); UI-seitiger persistenter Zustand nur `localStorage` „Sidebar eingeklappt" (`useSidebarPanel.ts:54-60,88-99`, Werte `"1"`/`"0"`) | PASS |
| Externe APIs | keine im UI-Anteil | N/A — keine externe API in der UI-Perspektive |
| UI-sichtbare Datenformen | siehe Data Type Verdicts | PASS |

## D) Completeness + Dependencies (UI-Anteil)

| Item | Evidenz | Status |
|------|---------|--------|
| Tailwind `@theme`-Override für spin/pulse | `tailwindcss` 4.3.3 (`node_modules/tailwindcss/package.json:3`), Defaults `theme.css:438` (`linear infinite`), `:440`; Upstream-Muster `upstream/main:src/styles/globals.css:17-20` | PASS |
| `sonner`-API für UI-3/UI-4 | 2.0.8, `toast.message(message, data?)` | PASS |
| `useSyncExternalStore` / Ref-Cleanup für MediaPreview | React 19.2.8 installiert (`node_modules/react/package.json:7`) | PASS |
| JS-Animationsbibliothek `motion` (Q&A #24) | keine Abhängigkeit: `package.json` und `pnpm-lock.yaml` ohne `motion`; `usePresence.ts:8` „Replaces motion's AnimatePresence" | FIX F-1 |
| Versions-Abgleich Integrations-Tabelle | Perspektive `runtime` | N/A — andere Perspektive |

## F) Migration Completeness (UI-Anteil)

| Item | Evidenz | Status |
|------|---------|--------|
| Sweep Fenster-Sichtbarkeit | `grep -rnE "document\.hidden\|visibilityState\|visibilitychange" src`: 15 Treffer in 7 Dateien; alle außer `rendererPool.ts` in MIG-10, MIG-35 bis MIG-39 | PASS |
| Guard MIG-27 gegen eigene Tests | Allowlist nur `windowVisibility.ts` + `rendererPool.ts`; MIG-26/MIG-34/Test-Strategie nutzen `visibilityState`/`visibilitychange` in Testdateien | FIX F-3 |
| Sweep Icons | 8 Importdateien, alle `.tsx` (grep `fileIconUrl\|folderIconUrl\|iconResolver`); `--include="*.tsx"` verfehlt keine | PASS |
| MIG-54 `terax-icon-in` | Fork: 0 Treffer; MIG-40 legt die Klasse nicht an | FIX F-2 |
| Sweep Animationen / MIG-41 | `grep infinite src/styles/*.css` sieht nur `globals.css:440`; die Tailwind-Defaults stehen in `node_modules` | FIX F-6 |
| MIG-45 Watcher-Stellen | direkte `watchRemove` für tote Ordner `useFileTree.ts:178-180` und `watchedRef` als Kandidatenquelle `:163` nicht genannt | FIX F-4 |
| Target Patterns testbar (MIG-22, -23, -25..-41, -42..-51, -52..-63) | je Zeile Datei + Zielverhalten + Test (MIG-21, -26, -30, -32, -34, -41, -44, -47, -50) | PASS |

## E) Pattern Consistency, Gate 1b (UI-Anteil)

| Scanner-Empfehlung | Umsetzung in architecture.md | Status |
|--------------------|------------------------------|--------|
| REUSE `ContextMenuItem` + `selectedPath` | MIG-22, SVC-6 | PASS |
| REUSE `editor.undo`-Muster für `editor.save` | SVC-12, MIG-7, MIG-10 | PASS |
| REUSE `watchAdd`/`watchRemove` + Rust-Refcount | SVC-10, Registry kapselt beide (Upstream `createWatchRegistry({add: watchAdd, remove: watchRemove})`) | PASS (F-4) |
| REUSE Eager-Graph-Tracer | MIG-63 (Paket-Präfix-Abgleich `eager-graph.mjs:81-91`) | PASS |
| REUSE `binaryPreviewMode` | SVC-8, MIG-29: keine zweite Endungsliste | PASS |
| EXTEND `useExplorerFileDrop`, `FileExplorer`, `EditorPane`/`EditorStack`, `useFileTree`, `useSourceControl*`, `iconResolver`, `globals.css` | MIG-23, -22, -9/-33, -45, -48/-49, -52, -40 | PASS |
| NEW Fenster-Sichtbarkeit, `clipboardPaste.ts` | MIG-25, MIG-20 | PASS |
| AVOID neue `document.hidden`-Paare | Guard MIG-27 | PASS (F-3) |
| AVOID Upstream-Fokus-Kopplung `data-window-inactive` | MIG-40/MIG-41 mit `data-window-hidden` | PASS |
| AVOID Upstream-Umbau von `useExplorerFileDrop`/`useFileTree` | Constraints-Zeile „Fork-Fassungen als Basis" | PASS |
| Neue Abstraktionen mit Scanner-Referenz | `MediaPreview.tsx`/`mediaPlayback.ts` (Scan Zeile `binaryPreviewMode`), `FileIcon`/`iconEngine` (Scan Zeile `iconResolver`), `watchRegistry`/`statusConsumers` (Scan EXTEND) | PASS |
| Anti-Slop #1 k2 „Fenster sichtbar" → consolidate | Option im Katalog zulässig (K1–K4), kein Guard-Pflichtfeld; eingelöst über MIG-25..28, MIG-35..39, MIG-10; fokusgekoppelte Stellen haben andere Semantik (`rendererPool.ts:103,110` Fokus UND Sichtbarkeit) | PASS |
| Anti-Slop #2, #3 | Belegdomäne `code` | N/A — andere Perspektive |
| Linsen-Ausfall | keiner (architecture.md:558) | PASS |

## E2) Bindings Coverage, Gate 1c

N/A — kein `bindings_path`/`reconcile_path` übergeben.

## E3) Existing-Behavior Invariants, Gate 1d (UI-Anteil)

| INV | Beleg am Code/Test | Status |
|-----|--------------------|--------|
| INV-5 | `useExplorerFileDrop.ts:20-42` Zielregel; Zielmarkierung `:59-66` + `FileExplorer.tsx:270-277,564-567` | PASS |
| INV-8 | `EditorPane.tsx:240-250` (`Mod-s`), `:188-193` (`onSaved` nur bei `await saveRef.current()` true) | PASS |
| INV-9 | `shortcuts.ts:229-233`; `matchBinding` vergleicht `shift` exakt (`shortcuts.ts:369-374`) → `Mod+S` kann `Mod+Shift+S` nicht treffen | PASS |
| INV-10 (covered) | `binaryPreview.test.ts:21-50` prüft image/video/audio/pdf/card am Rückgabewert | PASS |
| INV-11 | `EditorPane.tsx:446-463`, `EditorStack.tsx:156` | PASS |
| INV-12 | `useFileTree.ts:228-247` (fs:changed liest geladene Ordner neu), `:220-225` (Freigabe bei Wurzelwechsel/Unmount) | PASS |
| INV-14 | `App.tsx:1596,1608,1620,1681`; `useSourceControl.ts:459-478` (Fokus-Auffrischung); keine weiteren Konsumenten von `SourceControlSummary` (grep) | PASS |
| INV-15 | `useSourceControlContext.ts:55-82` | PASS |
| INV-16 | `FileExplorer.tsx:201,380-426` | PASS |
| INV-17 | Verbraucher per grep (`TabActivityIndicator.tsx`, `AgentMissionControl.tsx`, `NotificationBell.tsx`, `AgentStatusWidget.tsx`); Reduced-Motion stoppt nur den Shimmer (`globals.css:461-464`) | PASS |
| INV-18 | `rendererPool.ts:102-126` (Cursor-Blinken über `setWindowActive`) | PASS |
| INV-19 (covered) | `eager-budget.test.ts:17-25`: zwei Fälle, beide Fenster, prüfen HEAVY-Treffer = leer | PASS |
| INV-20 | `iconResolver.ts:67,99` synchron | PASS |
| INV-22 | `AboutSection.tsx:4,30` | PASS |
| INV-23 | `App.tsx:477`, `useClaudeStatus.ts:55`, `SshAgentActivityPoller.tsx:141`, `useSpacePersistence.ts:86-100`, `useTerminalSession.ts:574-578` | PASS (Auflage O-2) |
| Scan-Invarianten übernommen | Scan Nr. 1–22 → INV-1..22, INV-23 zusätzlich; keine gestrichen | PASS |
| INV-1..4, 6, 7, 13, 21 | Belegdomäne `code`/`data`/`runtime` | N/A — andere Perspektive |

---

## Data Type Verdicts

| Feld | Arch-Typ | Evidenz | Verdict |
|------|----------|---------|---------|
| `CopyResult.created[]` (speist UI-6) | `string[]`, Frontend-Form `destDir/{finalName}` | Baum-Schlüssel entstehen über `joinPath` (`useFileTree.ts:29-32`), Auswahl-Abgleich über `entryIndexByPath` (`FileExplorer.tsx:279-283`) | PASS mit Auflage O-1 (gleiche Pfadform) |
| `CopyFailure.message` (UI-4 Beschreibung) | `string` unbegrenzt | `sonner` rendert `description` als ReactNode ohne Längenlimit | PASS |
| `CopyFailure.source` (UI-4) | `string` | absolute Pfade, Anzeige als Text | PASS |
| `sidebarCollapsed` | `boolean`, gespiegelt aus `localStorage` | `"1"`/`"0"` (`useSidebarPanel.ts:56,92-95`) | PASS |
| `data-window-hidden` am `html` | Präsenz-Attribut | Selektor `html[data-window-hidden]` (MIG-40), analog Upstream-Selektor `upstream/main:src/styles/globals.css:589-593` | PASS |
| Git-Widget-Liste (MIG-51) | Konstante aus `StatusbarWidgetId` | alle fünf IDs in `layout.ts:8-21` und `registry.ts:26-30` | PASS |
| `ShortcutId` `editor.save` | Union-Erweiterung | `shortcuts.ts:40-46`, Gruppe `"Editor"` existiert (`:57`) | PASS |
| UI-4 Zähler `{N}` | number | Singular/Plural wie Upstream `clipboardPaste.ts:47` | PASS |

## Bestands-Behauptungen

| # | Behauptung (architecture.md) | Beleg | Verdikt |
|---|------------------------------|-------|---------|
| B-1 | Explorer hat Zeilen- und Flächen-Kontextmenü (MIG-22, UI-1) | `FileExplorer.tsx:555-806`; Zeile `:662-760`, Fläche `:762-803` | hält |
| B-2 | `handleKeyDown` bricht bei leerem Baum ab (Research Log, MIG-22) | `FileExplorer.tsx:378` | hält |
| B-3 | Handler ignoriert Umbenennen/Anlegen/Suche und Eingabefelder (VAL-7) | `FileExplorer.tsx:370-377` | hält |
| B-4 | statische Icon-Importe `:38`, kein `visible`-Prop (MIG-22) | `FileExplorer.tsx:38`; `visible` 0 Treffer | hält |
| B-5 | Einzelauswahl `selectedPath` (INV-16, Q&A #4) | `FileExplorer.tsx:201` | hält |
| B-6 | ohne Wurzel tut ⌘V nichts (EP-5) | `FileExplorer.tsx:349-363` (kein Container, kein Handler) | hält |
| B-7 | Drop ruft `fs_copy` ohne Konfliktbenennung, Toast `Copy failed` (MIG-23) | `useExplorerFileDrop.ts:68-79`; `onCopied: tree.refresh` `FileExplorer.tsx:264-268` | hält |
| B-8 | Drop-Zielregel + Zielmarkierung (INV-5) | `useExplorerFileDrop.ts:20-42,59-66` | hält |
| B-9 | `EditorPaneHandle` ohne `save` (MIG-9) | `EditorPane.tsx:48-63` | hält |
| B-10 | `saveRef` als bestehender Speicherweg, `onSaved` nur bei echtem Schreiben (SVC-12, INV-8) | `EditorPane.tsx:142-143,188-193,240-250` | hält |
| B-11 | Video/Audio inline mit `controls`, `preload="metadata"`, kein `visible` (MIG-9) | `EditorPane.tsx:446-463`; `visible` 0 Treffer | hält |
| B-12 | `EditorStack` setzt `visible` nur am Wrapper (MIG-33) | `EditorStack.tsx:47-49,156` | hält |
| B-13 | Media-Preview nur im Editor (UI-9) | `<video\|<audio` nur `EditorPane.tsx:448,457` | hält |
| B-14 | `binaryPreviewMode` klassifiziert image/video/audio/pdf/card (REUSE, INV-10) | `binaryPreview.ts:56`; Test `binaryPreview.test.ts:21-50` | hält |
| B-15 | Upstream `5502f82` bringt `bindMediaPlayback` und eine zweite Endungsliste (Q&A #16) | `5502f82:src/modules/editor/lib/mediaPreview.ts:7,21` | hält |
| B-16 | `SurfaceLayer` eigener Hook `useDocumentHidden` (MIG-35) | `SurfaceLayer.tsx:36,77,130-141` | hält |
| B-17 | `useClaudeStatus` Poll-Guard `document.hidden` (MIG-36) | `useClaudeStatus.ts:55` | hält |
| B-18 | `SshAgentActivityPoller` Tick-Guard (MIG-37) | `SshAgentActivityPoller.tsx:141` | hält |
| B-19 | `useSpacePersistence` Flush bei hidden, `blur`/`beforeunload` (MIG-38) | `useSpacePersistence.ts:86-100` | hält |
| B-20 | `useTerminalSession` liest `document.hidden` und hat eigenen Listener (MIG-39) | `useTerminalSession.ts:551,574-578` (Listener auf Modulebene) | hält |
| B-21 | tmux-cwd-Poll prüft `document.hidden` (MIG-10) | `App.tsx:477` | hält |
| B-22 | Renderer-Pool koppelt Cursor-Blinken an Fokus + Sichtbarkeit (INV-18) | `rendererPool.ts:102-126` | hält |
| B-23 | `useWindowFocus.ts` ist Tauri-Fokus, bleibt (Anti-Slop #1) | `useWindowFocus.ts:6,13`; kein Treffer im Sichtbarkeits-Regex | hält |
| B-24 | Sichtbarkeits-Sweep deckt alle Altstellen (Sweep criterion) | grep: 15 Treffer / 7 Dateien, alle gemappt | hält |
| B-25 | `editor.undo`-Handler über `editorRefs`, nur bei Editor-Tab (SVC-12, Q&A #20) | `App.tsx:976-977,1002-1006` | hält |
| B-26 | `Mod+Shift+S` = `space.overview`, `Mod+S` frei, kein `editor.save` (MIG-7, INV-9) | `shortcuts.ts:40-46,229-233,369-374` | hält |
| B-27 | App-Shortcut-Schicht greift vor dem Editor (Grundlage SVC-12) | `useGlobalShortcuts.ts:61-68` (Capture, `stopImmediatePropagation`) | hält |
| B-28 | `FileExplorer` nur bei Ansicht `explorer`, bleibt bei eingeklappter Sidebar gemountet (Q&A #6) | `App.tsx:1578-1598` (`collapsible`, `collapsedSize={0}`, `key={sidebarView}`) | hält |
| B-29 | „eingeklappt" nur als Ref + `localStorage` (MIG-42) | `useSidebarPanel.ts:77,88-99` | hält |
| B-30 | Einklappen wird über `onResize` erfasst | `App.tsx:1584-1586` | hält |
| B-31 | Rail-Badge liegt im Sidebar-Panel, unsichtbar bei eingeklappter Sidebar (Research Log) | `App.tsx:1617-1621` | hält |
| B-32 | Zen-Modus blendet die Statusleiste aus (Research Log, SVC-11) | `App.tsx:1669`; Zen blendet sonst nur Header aus (`:1509`) | hält |
| B-33 | eine `useSourceControl`-Instanz speist Badge, Explorer-Farben (nur Präferenz), Widgets, Panel (INV-14) | `App.tsx:1596,1608,1620,1681`; grep `SourceControlSummary` nur statusbar/source-control | hält |
| B-34 | Git-Status-Pfadregel (INV-15) | `useSourceControlContext.ts:55-82` | hält |
| B-35 | Fokus- und Kontext-Auffrischung laufen immer (MIG-49) | `useSourceControl.ts:438-478` (nur `enabled` als Gate) | hält |
| B-36 | Git-Graph-Kontext nutzt den Snapshot (MIG-48) | `useSourceControlContext.ts:88-95` | hält |
| B-37 | fünf Git-Widgets lesen `ctx.sourceControl` (SVC-11, MIG-51, Research Log) | `GitWidgets.tsx:17-103`, `registry.ts:26-30` | hält |
| B-38 | Standard-Statusleiste zeigt `git-branch` und `git-sync` (Research Log) | `layout.ts:44-51`: standardmäßig verborgen nur `git-changes`, `git-staged` → auch `line-changes` sichtbar | hält, unvollständig (N-1) |
| B-39 | `iconResolver` statisch, synchrone URL (MIG-52, INV-20) | `iconResolver.ts:1-4,67,99` | hält |
| B-40 | 8 Icon-Aufrufer (SVC-14, MIG-55..61, MIG-22) | grep: TabBar, GitHistoryPane, ExplorerSearch, TreeRow, FileExplorer, CommandPalette, SourceControlPanel, FilePicker | hält (Detail N-2) |
| B-41 | Icon-Daten hängen nur am Resolver (SVC-14) | `@iconify-json`, `./fileIcons`, `./folderIcons` nur in `iconResolver.ts:1-4` | hält |
| B-42 | `FileIcon` blendet mit `terax-icon-in` ein (MIG-54) | Fork: `terax-icon-in` 0 Treffer; Upstream `globals.css:509-515` | fehlt im Bestand, Map ohne Anlage (F-2) |
| B-43 | Shimmer `linear infinite`, keine Pause, Reduced-Motion stoppt Shimmer (MIG-40, INV-17) | `globals.css:416-441,452-465` | hält |
| B-44 | Tailwind spin/pulse flüssig, per `@theme` überschreibbar (MIG-40) | `tailwindcss` 4.3.3 `theme.css:438-440` | hält |
| B-45 | INV-17-Verbraucher nutzen `animate-spin`/`animate-pulse` | grep `TabActivityIndicator.tsx`, `AgentMissionControl.tsx`, `NotificationBell.tsx`, `AgentStatusWidget.tsx` | hält |
| B-46 | JS-Animationen laufen über die Bibliothek `motion` (Q&A #24) | `motion` weder in `package.json` noch in `pnpm-lock.yaml`; `usePresence.ts:8` | hält nicht, Entscheid unberührt (F-1) |
| B-47 | About liest die Version aus `tauri.conf.json` (UI-10, INV-22) | `AboutSection.tsx:4,30`; `tauri.conf.json:4` | hält |
| B-48 | Toasts über `sonner` | `sonner` 2.0.8; `<Toaster>` `App.tsx:1695` | hält |
| B-49 | Upstream `clipboardPaste.ts` liefert die MIG-20-Funktionen | `upstream/main:src/modules/explorer/lib/clipboardPaste.ts:5,14,23,31,43,52` | hält |
| B-50 | Upstream-Vorlagen `FileIcon`, `iconEngine`, `iconResolver.test` | `git ls-tree upstream/main` | hält |
| B-51 | `useFileTree` nutzt `watchedRef` + direkte Aufrufe an `:117-126,217-224` (MIG-45) | zusätzlich `useFileTree.ts:163` (Kandidaten) und `:178-180` (`watchRemove` toter Ordner) | hält teilweise (F-4) |
| B-52 | Neu-Einlese-Muster vorhanden (MIG-45) | `useFileTree.ts:228-256` | hält |
| B-53 | `HEAVY` ohne Icon-Set, Paketabgleich per Präfix (MIG-63) | `eager-budget.test.ts:10`; `eager-graph.mjs:81-91` | hält |
| B-54 | INV-19 covered | `eager-budget.test.ts:17-25` | hält |

Nicht in der Prüfmenge (andere Evidenz-Domäne, P4): Rust-Kopierkern, SSH-Helper, SSRF (`code`); Lockfile-/Deps-Stände, `minimumReleaseAge` (`data`/`runtime`); WKWebView-Verhalten von `visibilityState` bei minimiert/verdeckt/anderem Space, rAF-Drosselung, ⌘S-Abfangen durch WebKit, Perf-Messprotokolle NFR-1/NFR-2 (`runtime`).

---

## Befundliste

| ID | Klasse | Check | Ziel-Datei | Zitat | Beleg | Belegquelle | Erwartete Beobachtung | Resolution | aus Vorlauf offen |
|----|--------|-------|------------|-------|-------|-------------|-----------------------|------------|-------------------|
| F-1 | fix | D | architecture.md (Q&A #24) | „Sollen auch JS-Animationen (Bibliothek `motion`) pausieren? … `motion` läuft über `requestAnimationFrame`" | `grep '"motion"' package.json` → 0; `pnpm-lock.yaml` ohne `motion`; `src/lib/usePresence.ts:8` „Replaces motion's `AnimatePresence`"; `globals.css:414` „replaces motion background-position animation" | dependency | Der Fork hat keine `motion`-Abhängigkeit; JS-Bewegung läuft nur über eigene rAF-Hooks | Q&A #24 Begründung korrigieren: „`motion` ist keine Abhängigkeit des Forks; JS-gesteuerte Bewegung nur über eigene rAF-Hooks (`usePresence.ts`), die WebKit bei unsichtbarer Seite drosselt". Entscheid „nur CSS" bleibt | nein |
| F-2 | fix | F | architecture.md (MIG-40, MIG-54) | MIG-54: „Platzhalter bis geladen, dann Icon mit `terax-icon-in`" | `grep -rn terax-icon-in src` → 0; Upstream `upstream/main:src/styles/globals.css:509-515` (`@keyframes terax-icon-in`, `.terax-icon-in { animation: … var(--dur-fast) … }`) | code | MIG-54 nutzt eine Klasse, die weder existiert noch in MIG-40 angelegt wird | MIG-40 Target Pattern ergänzen: „S6: `@keyframes terax-icon-in` + `.terax-icon-in` (Dauer `--dur-fast`, damit Reduced-Motion sie über die Token nullt)" | nein |
| F-3 | fix | F/E | architecture.md (MIG-27, Sweep criterion) | MIG-27: „`document.hidden`, `visibilityState`, `visibilitychange` nur in `windowVisibility.ts` und im bewusst fokusgekoppelten `terminal/lib/rendererPool.ts`" | Test Strategy architecture.md:409 „`visibilityState` umdefiniert, echtes `visibilitychange`-Event" (MIG-26); MIG-34 „unsichtbares Fenster pausieren"; der Guard enthält die Muster selbst als Literal | artifact | Der Guard in der beschriebenen Form schlägt auf `windowVisibility.test.ts`, `EditorStack.window-hidden.test.tsx` und sich selbst an | MIG-27 und Sweep-Zeile ergänzen: „Testdateien (`*.test.ts`, `*.test.tsx`) sind vom Scan ausgenommen" | nein |
| F-4 | fix | F | architecture.md (MIG-45) | „`watchedRef` + direkte `watchAdd`/`watchRemove` (`:117-126,217-224`)" | `useFileTree.ts:178-180` `watchedRef.current.delete(d)` + `watchRemove(toUnwatch)` für tote Ordner; `:163` `...watchedRef.current` als Kandidatenquelle; Upstream ersetzt beides (`upstream/main:useFileTree.ts:232,253` `watches.paths()`, `watches.removeMany`) | code | Bleibt die Tot-Ordner-Bereinigung direkt, ändert sie im entschärften Zustand nur die native Registrierung und nicht die gewünschte Menge; beim Wieder-Scharfschalten würden gelöschte Ordner neu registriert | MIG-45 Current Pattern um `:163,178-180` ergänzen, Target: „alle Watch-Mutationen inkl. Tot-Ordner-Bereinigung über die Registry (`removeMany`); in `useFileTree.ts` kein direkter `watchAdd`/`watchRemove`/`watchedRef` mehr" | nein |
| F-5 | fix | A | discovery.md (UI Layout & Context, Screen Explorer) | `discovery.md:145` „Baum: nach dem Einfügen Zielordner aufgeklappt, neue Elemente markiert" | Q&A #4 (architecture.md:674) hat FL-4, UI-6, ST-3 auf Einzelauswahl nachgezogen; `discovery.md:113,163,179` bereits geändert, `:145` nicht | artifact | Eine Discovery-Zeile widerspricht der entschiedenen Einzelauswahl | `discovery.md:145` → „Baum: nach dem Einfügen Zielordner aufgeklappt, erstes neues Element ausgewählt (architecture.md Q&A #4)" | nein |
| F-6 | fix | F | architecture.md (MIG-41, Sweep criterion Animationen) | MIG-41: „jede `infinite`-Animation hat `steps()`; Pause-Regel hängt am Sichtbarkeits-Attribut" | Tailwind-Defaults `spin 1s linear infinite`/`pulse … infinite` stehen in `node_modules/tailwindcss/theme.css:438-440`, nicht in `src/styles`; Upstream-Test prüft deshalb ausdrücklich `--animate-spin`/`--animate-pulse` (`upstream/main:src/styles/motionBudget.test.ts` Fall „covers the spinner and pulse utilities and the shimmer") | dependency | Fehlt der `@theme`-Override, laufen spin/pulse wieder flüssig, und Sweep sowie der beschriebene Test bleiben grün | MIG-41 ergänzen: „Test verlangt, dass `--animate-spin`, `--animate-pulse` und `terax-shimmer` als `infinite` mit `steps()` in `globals.css` stehen" (ohne Upstream-Fälle `terax-blink`/`terax-attention-pulse`, die der Fork nicht hat) | nein |
| O-1 | obligation | A (UI-6) | – | SVC-6: „nach Erfolg Zielordner aufklappen und erstes neu angelegtes Element auswählen + in Sicht scrollen" | `FileExplorer.tsx:279-283` setzt `selectedPath` zurück, sobald der Pfad nicht in `entryIndexByPath` steht; Schlüssel über `joinPath` (`useFileTree.ts:29-32`); Aufklappen lädt asynchron (`tree.expand`, `:275`) | code | Wird vor dem Laden des Zielordners ausgewählt oder weicht die Pfadform ab, ist die Auswahl sofort wieder leer | Auswahl erst setzen, wenn der Zielordner geladen und aufgeklappt ist und `created[0]` der Baum-Schlüsselform entspricht; Nachweis: vitest/e2e Einfügen in einen zugeklappten Ordner → erstes Element ausgewählt und gescrollt (implement, test) | nein |
| O-2 | obligation | E3 (INV-23) | – | SVC-7: „einmal in `src/main.tsx` installiert"; MIG-39: „Getter + Abo aus SVC-7" | `useTerminalSession.ts:574-578` registriert auf Modulebene, also beim Import vor dem Rumpf von `main.tsx`; `useClaudeStatus.test.tsx` importiert den Hook ohne `main.tsx` | code | Ein Abo vor der Installation muss spätere Wechsel bekommen, der Getter ohne Installation den aktuellen Wert liefern | Getter und Abo funktionieren vor `install` (oder Installation erfolgt beim ersten Abo idempotent); Nachweis: `windowVisibility.test.ts` Fall „Abo vor Installation erhält späteren Wechsel" (implement, test) | nein |
| O-3 | obligation | B (BR-5) | – | BR-5: „Kontextmenü einer Zeile → wie Markierung dieser Zeile" | Rechtsklick setzt nur `menuTarget` (`FileExplorer.tsx:571-586`), `selectedPath` bleibt (z.B. aktive Datei, `:303-311`) | code | Paste aus dem Zeilen-Menü nimmt die Zeile unter dem Rechtsklick, nicht die bisherige Auswahl | Zeilen-Menü übergibt `menuTarget` an `pasteTargetDir`; Nachweis: e2e/vitest Datei A ausgewählt, Rechtsklick auf Ordner B → Paste landet in B (implement, test) | nein |
| N-1 | note | – | architecture.md (Research Log) | „Standard-Statusleiste zeigt `git-branch` und `git-sync` (`layout.ts:44-51`)" | `layout.ts:44-51`: verborgen nur `git-changes`, `git-staged`; `line-changes` ist standardmäßig sichtbar | code | drei Standard-Konsumenten statt zwei; Schlussfolgerung „bleibt per Default live" unverändert | optional präzisieren | nein |
| N-2 | note | – | architecture.md (MIG-57) | „`fileIconUrl`/`folderIconUrl` synchron (`:26`)" | `ExplorerSearch.tsx:26,240` nur `fileIconUrl` | code | Detail ohne Folgen | optional präzisieren | nein |
| N-3 | note | – | discovery.md (UI Patterns) | `discovery.md:94` „`ContextMenuShortcut` in `FileExplorer.tsx`" | `ContextMenuShortcut` existiert (`components/ui/context-menu.tsx:228,253`), ist aber nirgends im App-Code genutzt; Upstream setzt ihn für den Hinweis (`upstream/main:FileExplorer.tsx:961-962`) | code | erste Nutzung im Fork, kein bestehendes Muster | für den ⌘V-Hinweis `ContextMenuShortcut` aus dem Design-System nehmen | nein |
| N-4 | note | – | architecture.md (SVC-7) | „einmal in `src/main.tsx` installiert" | Settings-Fenster lädt `globals.css` (`src/settings/main.tsx:1`), bekommt die Stufen, aber kein `data-window-hidden`; `ShortcutsSection.tsx:324` `animate-pulse` | code | im versteckten Settings-Fenster läuft der Puls weiter (WebKit drosselt verborgene Seiten) | keine Pflicht; bei Bedarf SVC-7 auch in `src/settings/main.tsx` installieren | nein |
| N-5 | note | – | discovery.md (BR-10) | BR-10: „`prefers-reduced-motion` schaltet sie wie bisher ab" | Reduced-Motion stoppt heute nur den Shimmer (`globals.css:452-465`); `motion-reduce`/`motion-safe` 0 Treffer → Spinner und Puls laufen auch bei reduzierter Bewegung | code | architecture.md hält den Bestand korrekt fest (INV-17, MIG-40 „unverändert"); die Discovery-Formulierung klingt umfassender | Abschalten von Spinner/Puls bei Reduced-Motion wäre neuer Scope | nein |
| N-6 | note | – | architecture.md (Q&A #11, Trade-offs) | „Linux/Windows-Builds melden Fehler beim Einfügen" | Menü-Eintrag `Paste` stünde dort immer im Menü und schlägt immer fehl; Upstream hat `IS_MAC`-Weiche für den Hinweis (`upstream/main:FileExplorer.tsx:124`) | code | dauerhaft fehlschlagender Menüpunkt auf Nicht-macOS | Eintrag auf Nicht-macOS ausblenden, ⌘V dort unbehandelt lassen (PM-Durchsicht Q&A #11 offen) | nein |
