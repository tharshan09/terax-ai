# Upstream-Sync 0.8.5 — Discovery-Dossier

Repo: `tharshan09/terax-ai` (Fork) ← `crynta/terax-ai` (Upstream v0.8.5, Tag `0baf265`, 2026-07-10)
merge-base: `d77476e` · Fork-HEAD: `1dded7f` · Upstream-HEAD: `5c2f4cd`
Analyse-Stand: 2026-07-17 · Reine Analyse, keine Entscheidung/kein Code geändert.

---

## 1. Executive Summary

- 51 neue Commits (65 total minus 14 abgehandelt). Verdikte: **7 PICK · 15 MERGE-HANDARBEIT · 13 LSP (Weiche: ganze Serie MERGE oder SKIP) · 8 SKIP · 6 REGENERIEREN · 2 Version (cosmetic/Weiche)**. Summe = 51.
- **Größter Brocken = das komplett NEUE LSP-Subsystem (~13 Commits, ~2500 LOC neue Dateien).** Konfliktarm in seinen *eigenen* Dateien, aber verzahnt mit dem Editor-Umbau und den Fork-Hotspots `App.tsx (+489)`, `lib.rs (+175)`, `store.ts (+193)`, `EditorPane.tsx`, `StatusBar.tsx`, `GeneralSection.tsx`. → eigene Welle / Weiche.
- **Höchster Nutzen ohne LSP = die Editor-Datenverlust-Kette** `40a8ef2 (fs mtime/force/symlink-stat)` → `662dbbb (EOL, Save-Konflikt-Erkennung, Quit-Guard)` → `85a5653 (Save/Reload-Races)`. Verhindert Datenverlust; muss die Fork-fs-Gates (PDF-Magic-Byte, Jail, Symlink-Refuse) erhalten.
- **Tab-Agent-Status-Kollision geklärt:** merge-base hatte `agentActivity.ts` bereits. Fork ließ es UNVERÄNDERT und baute PR#52 `TabActivityIndicator.tsx` auf den Mission-Control-`agentStore`. Upstream schrieb `agentActivity.ts` neu (zustand, 4 Phasen) + `AgentTabBadge.tsx`. **Beide pane-aware, aber andere Datenquelle** → Empfehlung Fork behalten, Upstream skippen.
- **Security-Override-Pick:** `78a0b3d` (AI-Such-Pfad-Filterung) — aber Fork hat `agent.ts` um 243 Zeilen entkernt; erst prüfen ob AI-Tools überhaupt erreichbar sind.
- **Sauberste Picks (Fork-Datei unverändert seit base):** `ac88362` (da_filter), `cb75fae` (markdown), `ae9e690` (dotenv), `786ceb5` (md-notes), `a71fcfc` (keybind). `da_filter.rs`, `useAppCloseGuard.ts`, `CloseDialogs.tsx`, `extensions.ts`, `vite.config.ts`, `launchDir.ts`, `cmThemes.ts` sind alle base-identisch.
- **AI-Lane (5 Commits) → SKIP** (depriorisiert; `agent.ts` entkernt). **Deps (6) → REGENERIEREN** (pnpm/cargo update pro Gruppe, Locks nie mergen).
- **Uncommitted-Zone (OSC52-Clipboard) ist isoliert** — kein Upstream-Commit außer dem geskippten `a3ebccd` berührt `osc-handlers/rendererPool/clipboard`. Nur die Trackpad-Swipe-Files (`lib.rs/App.tsx/store.ts/GeneralSection.tsx`) überlappen mit Upstream-Hotspots → uncommitted zuerst landen.
- **Version:** Fork 0.8.2 vs Upstream 0.8.5. Updater deaktiviert + About zeigt Build-Commit → Versionsstring kosmetisch. Empfehlung: manuell auf 0.8.5 heben, `0baf265` NICHT picken.
- **3 riskanteste Commits:** `40a8ef2` (fs — Security-Gate-Regression-Gefahr), `653dd15` (Settings-Umbau — kollidiert mit forkiertem GeneralSection + uncommitted Toggle), `d6e3491`/`460657a` (Pane-Swap — kollidiert mit Fork-Split-Pane-Core `useTabs +296/-141`).

---

## 2. Klassifikations-Tabelle (alle 51 Commits)

Konfliktrisiko: 🟢 niedrig · 🟡 mittel · 🔴 hoch. Reihenfolge = chronologisch (oldest-first).

| # | Hash | Titel | Cluster | Verdikt | Risiko | Begründung |
|---|------|-------|---------|---------|--------|-----------|
| 1 | d96da41 | refactor(proc): move windows job object out of pty | LSP-prereq | LSP/SKIP | 🟡 | Windows-Job-Object → macOS-irrelevant; Fork hat `proc.rs` als Datei + `pty/job.rs`. Nur nötig falls `033b7aa` es braucht. |
| 2 | 3c3ded3 | feat(lsp): rust language server process host | LSP | LSP-MERGE | 🟡 | ~840 LOC neue rust-Dateien; berührt `lib.rs(+8)`, `Cargo.toml(+1)`, `modules/mod.rs(+1)` → Hotspot-Nähte. |
| 3 | 08d83e3 | feat(lsp): frontend client, session manager, editor integration | LSP | LSP-MERGE | 🔴 | 1197 LOC; berührt `EditorPane`, `extensions`, `useDocument`, `store.ts(+86)`, `package.json`, `vite.config`. Fundament. |
| 4 | aa43406 | feat(lsp): statusbar opt-in pill + settings section | LSP | LSP-MERGE | 🟡 | `StatusBar.tsx` + `GeneralSection.tsx` (beide forkiert) + neue `LspServersGroup`. |
| 5 | 1c7f3e4 | docs: lsp subsystem in TERAX.md | Docs | SKIP¹ | 🟢 | Nur sinnvoll wenn LSP übernommen; TERAX.md forkiert. |
| 6 | 033b7aa | feat(lsp): process-group kill, memory watchdog, exit cleanup | LSP | LSP-MERGE | 🟡 | `lib.rs(+14)`, `Cargo.toml(+1)`, neue `rss.rs/session.rs`. Baut auf #2. |
| 7 | d401f3b | feat(lsp): resource-bounded sessions, cross-file nav, formatting | LSP | LSP-MERGE | 🔴 | `App.tsx(+68/-)` (Fork-Hotspot +489) + `store.ts`. |
| 8 | 1ddf798 | feat(lsp): editor chrome, diagnostics counts, status pill | LSP | LSP-MERGE | 🔴 | `EditorPane`, `StatusBar`, `GeneralSection`, `globals.css` + neue `chromeTheme/diagnostics`. |
| 9 | 7250e4a | docs: lsp resource model | Docs | SKIP¹ | 🟢 | TERAX.md; LSP-abhängig. |
| 10 | fef9f22 | fix(lsp): age-guard idle eviction | LSP | LSP-MERGE | 🟢 | nur `sessionManager.ts` (LSP-eigen). |
| 11 | 653dd15 | feat(settings): dedicated editor tab | Editor/Settings | MERGE | 🔴 | Verschiebt 122 Zeilen aus `GeneralSection.tsx` (forkiert +171, + uncommitted Toggle); legt `EditorSection` an (im Fork ABWESEND). |
| 12 | 2219adb | feat(editor): completion icons, themed lsp chrome, vim cursor | Editor | MERGE | 🔴 | Großer Theme-Umbau: `cmThemes(+385)`, `extensions(+157)`, `chromeTheme(+138)`. |
| 13 | 3791846 | feat(lsp): presets for 13 more languages | LSP | LSP-MERGE | 🟢 | `presets.ts` (LSP-eigen, additiv). |
| 14 | e874b39 | feat(lsp): cmd-hover, hover highlight, statusbar polish | LSP | LSP-MERGE | 🟡 | `client.ts`, `CwdBreadcrumb`, `StatusBar`. |
| 15 | 1fd11b0 | fix(editor): freeze extension singletons, autosave clamp | Editor | MERGE | 🟡 | `AiDiffPane`, `chromeTheme`, `extensions`, `store.ts`. Baut auf #12. |
| 16 | a25fb40 | feat(editor): biome/prettier formatters, format on save | Editor | MERGE | 🟡 | `EditorPane`, `externalFormat`, `useDocument`, `EditorSection`(abwesend). |
| 17 | ba0e276 | build(deps): bump tauri 2.11.3→2.11.4 (cargo) | Deps | REGEN | 🟢 | `cargo update -p tauri`. |
| 18 | 1005caa | build(deps): bump tauri-action 0→1 (gh-actions) | CI/Deps | SKIP/REGEN | 🟢 | `release.yml`/`signpath-test.yml`; Fork released evtl. nicht darüber → prüfen. |
| 19 | 57bbc57 | docs: align verify with CI, architecture guides | Docs | MERGE (partial) | 🟡 | Neue `docs/architecture/*` = wertvoll & konfliktfrei; `TERAX.md/README/CONTRIBUTING`-Churn kollidiert mit Fork-Rewrite → nur neue Dateien nehmen. |
| 20 | cb75fae | fix(markdown): render file previews statically | Markdown | **PICK** | 🟢 | 2 Props (`mode="static"`, `parseIncompleteMarkdown={false}`); Fork hat `<Streamdown>`-Block. |
| 21 | 78a0b3d | Harden AI search tool path filtering | AI/Security | **PICK** (Security-Override) | 🟡 | Filtert grep/glob-Hits durch `checkReadable` (Fork exportiert es). `search.ts` leicht forkiert. Erst prüfen ob AI-Tools live. |
| 22 | a71fcfc | fix(shortcuts): move zen mode off editor's redo | Terminal/Shortcuts | **PICK** | 🟢 | 1-Zeilen-Rebind; `shortcuts.ts` forkiert (+23) aber Stelle isoliert. |
| 23 | 831860b | build(deps): npm-prod-minor-patch (9 updates) | Deps | REGEN | 🟢 | `pnpm update` betroffene Pakete. |
| 24 | fe4e074 | feat(ai): shortcut to toggle AI chat mini window | AI | SKIP | 🟢 | AI-depri. |
| 25 | 40a8ef2 | feat(fs): async file commands, mtime, forced reads, symlink-stat | fs | **MERGE** (kritisch) | 🔴 | Kollidiert mit gehärtetem Fork-`fs/file.rs` (690 LOC, PDF-Gate/Jail/Symlink-Refuse). Prereq für Datenverlust-Fixes. Symlink-stat = echter Fix. Gates MÜSSEN bleiben. |
| 26 | 662dbbb | fix(editor): preserve line endings, detect save conflicts, block quit | Editor/Datenverlust | **MERGE** | 🟡 | `useAppCloseGuard`+`CloseDialogs` base-identisch (sauber), neue `eol.ts`, aber `useDocument.ts` forkiert (+40/-18). Braucht #25-mtime. |
| 27 | 6980581 | feat(editor): find&replace, goto line, indent, large-file, formatter registry | Editor | MERGE | 🔴 | 716 LOC; `EditorPane(+141)`, `store(+55)`, `shortcuts(+43)`, `EditorSection`(abwesend), `chromeTheme`. |
| 28 | 42b51e7 | feat(lsp): find references picker, ruff preset | LSP | LSP-MERGE | 🟡 | `client(+182)`, neue `locationsPanel`, `presets`, `sessionManager`. |
| 29 | 9ec7328 | fix(editor): resolve diff pane language before mount | Editor | MERGE | 🟡 | `AiDiffPane`/`GitDiffPane` (Fork hat beide). |
| 30 | 7b1fae6 | feat(editor): improve AI autocomplete placement/quality | AI/Editor | SKIP | 🟡 | AI-Autocomplete → AI-depri. |
| 31 | 786ceb5 | feat(editor): markdown notes GFM, fenced code, clickable tasks | Editor | **PICK** | 🟢 | Neue `markdownExtras.ts` + `languageDefinitions` (base-identisch). Additiv. |
| 32 | 7b69f5d | docs: TERAX.md for editor subsystem | Docs | SKIP¹ | 🟢 | Editor-abhängig; TERAX.md forkiert. |
| 33 | 85a5653 | fix(editor): close save/reload races, formatter mtime, lsp format | Editor/Datenverlust | **MERGE** | 🟡 | `useDocument`, `EditorPane`, `externalFormat`, `useAppCloseGuard`, `lsp/client`. Braucht #25. LSP-Teil optional. |
| 34 | 9616cc8 | feat(ai): add current frontier models | AI | SKIP | 🟡 | Modell-Liste; AI-depri. `config.ts` base-identisch aber `agent.ts`/lock. |
| 35 | 882641e | fix(ai): surface provider errors safely | AI/Security | SKIP | 🟡 | Info-Leak-Härtung im AI-Agent; `agent.ts` im Fork entkernt (-243) → SKIP, revisit wenn AI genutzt. |
| 36 | ae9e690 | feat(editor): dotenv syntax highlighting | Editor | **PICK** | 🟢 | `languageDefinitions`/`languageResolver` base-identisch. |
| 37 | 7649926 | fix(editor): refine Kanagawa JSX colors | Editor | PICK (Dep-Risiko) | 🟡 | `cmThemes` base-identisch — ABER Diff nimmt evtl. #12 (`2219adb` cmThemes-Umbau) als Basis an. Verifizieren. |
| 38 | e63ca2f | feat(editor): independent font sizing | Editor | MERGE | 🟡 | `App.tsx`, `store`, `EditorSection`(abwesend), `globals.css`. |
| 39 | 0baf265 | chore(release): v0.8.5 | Version | Weiche/SKIP | 🟢 | Nur Versionsstrings; manuell setzen statt picken. |
| 40 | a7506be | nix: update sources to 0.8.5 | Version/nix | SKIP | 🟢 | `nix/sources.json`; Fork nutzt kein nix-Flow relevant. |
| 41 | a069d6f | build(deps): npm-prod-minor-patch (4 updates) | Deps | REGEN | 🟢 | `pnpm update`. |
| 42 | 3e654c3 | build(deps): cargo group (3 updates) | Deps | REGEN | 🟢 | `cargo update`. |
| 43 | d6e3491 | feat: directional pane swapping shortcuts | Panes | MERGE | 🔴 | `useTabs(+296/-141)`, `panes(+122)`, `App.tsx` — Fork-Split-Pane-Core. Evtl. Redundanz zu Fork-Drag&Drop. |
| 44 | 841c726 | build(deps-dev): npm-dev group (9 updates) | Deps | REGEN | 🟢 | `pnpm update -D`. |
| 45 | 460657a | fix(terminal): preserve pane layout during swaps | Panes | MERGE | 🔴 | `panes`, `PaneTreeView`, `App.tsx`, neue `shortcutScope`. Fork-Pane-Core. Braucht/ergänzt #43. |
| 46 | b9d6039 | feat(bundle): open files via OS "Open With" | Bundle | MERGE | 🟡 | `lib.rs(+87)`, `tauri.conf.json`, `App.tsx`, `launchDir`(base-identisch). Neue OS-Integration. |
| 47 | a2c8329 | feat(bundle): open multiple files via "Open With" + tests | Bundle | MERGE | 🟡 | `lib.rs(+163/-)`, `App.tsx`, `launchDir`. Baut auf #46. |
| 48 | 3e9f374 | feat(tabs): show terminal agent status on tabs | Tabs | SKIP (Weiche) | 🔴 | Parallel-Impl zu Fork-#52; schreibt `agentActivity.ts` neu + `AgentTabBadge`. Fork behalten. |
| 49 | 0dc259d | refactor(agents): harden tab status badge | Tabs | SKIP (Weiche) | 🟡 | Härtung von #48; nur relevant falls #48 übernommen. |
| 50 | ac88362 | fix(pty): preserve terminal response order | Terminal | **PICK** | 🟢 | `da_filter.rs` base-identisch → sauberer Pick. Korrektheits-Fix (Response-Ordering). |
| 51 | 5c2f4cd | fix(ai): route status-bar AI button through key-aware toggle | AI | SKIP | 🟡 | AI + `StatusBar`(forkiert). AI-depri. |

¹ Docs 1c7f3e4/7250e4a/7b69f5d = SKIP solange LSP/Editor nicht übernommen; sonst als Teil der jeweiligen Welle mitnehmen (TERAX.md-Konflikt beachten).

**Zählung:** PICK = 5 harte (cb75fae, a71fcfc, 786ceb5, ae9e690, ac88362) + 2 bedingte (78a0b3d Security-Override, 7649926 Dep-Risiko) = **7**. MERGE-HANDARBEIT = 653dd15, 2219adb, 1fd11b0, a25fb40, 57bbc57, 40a8ef2, 662dbbb, 6980581, 9ec7328, 85a5653, e63ca2f, d6e3491, 460657a, b9d6039, a2c8329 = **15**. LSP-Serie = d96da41, 3c3ded3, 08d83e3, aa43406, 1c7f3e4, 033b7aa, d401f3b, 1ddf798, 7250e4a, fef9f22, 3791846, e874b39, 42b51e7 = **13**. SKIP = 7b69f5d, fe4e074, 7b1fae6, 9616cc8, 882641e, 5c2f4cd, 3e9f374, 0dc259d = **8**. REGENERIEREN = ba0e276, 831860b, a069d6f, 3e654c3, 841c726, 1005caa = **6**. Version = 0baf265, a7506be = **2**. **Summe = 7+15+13+8+6+2 = 51 ✓**

---

## 3. Security- / Datenverlust-Deep-Dives

### 40a8ef2 — fs async commands (KRITISCH, 🔴)
Upstream-Diff basiert auf `05dd86c` (schlankes Upstream-`file.rs`). Der **Fork-`file.rs` ist 690 LOC** und komplett anders: `fs_is_pdf` (Magic-Byte-Gate für die sandbox-lose PDF-iframe), `fs_check_readable`, Jail/Deny-List in `fs_read_file`/`fs_write_file`, Random-Suffix-Staging gegen Symlink-Angriffe, großer Adversarial-Test-Block. Der Upstream-Commit bringt vier *orthogonale* Verbesserungen, die per Hand auf die Fork-Gates gesetzt werden müssen — **nie ersetzen**:
1. `mtime` in `ReadResult::Text` + Rückgabe aus `fs_write_file` (u64) → Voraussetzung für Save-Konflikt-Erkennung (662dbbb/85a5653).
2. `force: Option<bool>` + `FORCE_MAX_READ_BYTES` (50 MB) für "trotzdem öffnen" großer Dateien (6980581 large-file-open).
3. **`fs_stat` Symlink-Fix (echter Bug):** Fork nutzt `meta.file_type().is_symlink()` auf `std::fs::metadata` — das FOLGT Symlinks, meldet also NIE `Symlink`. Upstream nutzt `symlink_metadata` → korrekt. **Security-Gewinn.**
4. Kommandos werden `async`. Ändert nur das Fn-Signaturen-Umfeld, nicht die Gate-Logik.

**Netto-Security = neutral-bis-positiv**, ABER Regressions­gefahr hoch: ein naives Übernehmen der Upstream-Fn-Bodies würde PDF-Gate/Jail/Symlink-Refuse killen. → Pflicht-Review-Gate.

### 662dbbb — save conflicts / EOL / quit-guard (Datenverlust, 🟡)
- Neue `eol.ts` (LF/CRLF-Erhalt beim Speichern) — konfliktfrei, neue Datei.
- `useAppCloseGuard.ts` (**base-identisch im Fork** → sauber): erweitert den Quit-Block auf **dirty editors**, nicht nur laufende Terminals. Verhindert stillen Verlust ungespeicherter Editor-Änderungen beim Quit. Echter Datenverlust-Fix.
- `CloseDialogs.tsx` (base-identisch → sauber): differenzierte Meldung.
- `useDocument.ts` (forkiert +40/-18): mtime-basierte Save-Konflikt-Erkennung → hängt an 40a8ef2.

### 85a5653 — save/reload races (Datenverlust, 🟡)
Schließt Races zwischen Speichern und externem Reload, Formatter-mtime-Handling. Berührt `useDocument`, `EditorPane`, `externalFormat`, `useAppCloseGuard` + einen LSP-Format-Teil (`lsp/client.ts`, `useLspExtension` — beim Merge weglassbar wenn LSP nicht übernommen). Braucht 40a8ef2-mtime.

**→ Diese drei (40a8ef2 → 662dbbb → 85a5653) bilden die Datenverlust-Kette und sind der höchste Nutzen dieser Sync-Runde außerhalb von LSP.**

### 78a0b3d — AI search path filtering (Security, 🟡)
Filtert jeden grep/glob-Treffer der AI-Such-Tools durch `checkReadable` (Fork exportiert es in `ai/lib/security.ts:241`), bevor auto-approved Ergebnisse zurückgehen. Verhindert, dass die AI Inhalte/Existenz von Dateien außerhalb der Readable-Zone leakt. Legitime Härtung. **Caveat:** Fork hat `agent.ts` um 243 Zeilen entkernt — vor dem Pick verifizieren, dass die AI-Such-Tools (`ai/tools/search.ts`, im Fork +15/-3 modifiziert) überhaupt noch erreichbar sind. Wenn AI-Runtime tot → dormanter Code, dann optional.

### cb75fae — markdown static previews (schwach-Security, 🟢)
Setzt `mode="static"` + `parseIncompleteMarkdown={false}` auf `<Streamdown>`. Kein echtes XSS-Gate — es *deaktiviert* die Streaming-Incomplete-Markdown-Reparatur für vollständige Dateien (Korrektheit/Robustheit). Fork hat den `<Streamdown>`-Block (Zeile 94). 2-Zeilen-Pick.

### 882641e — provider errors safely (Info-Leak, 🟡) → SKIP
"Surface provider errors safely" verhindert, dass rohe Provider-Fehler (können Tokens/Endpoints enthalten) ungefiltert in die UI gelangen. Reale, aber AI-Lane-gebundene Härtung; `agent.ts` im Fork entkernt → SKIP, revisit falls AI-Chat je genutzt.

### ac88362 — pty response order (Korrektheit, 🟢) → PICK
Begrenzt synthetische DA-Antworten auf Startup-Queries, damit xterm.js die Response-Reihenfolge späterer Capability-Query-Batches erhält. `da_filter.rs` ist **base-identisch im Fork** → sauberer Pick, kein Risiko für die Fork-PTY-Anpassungen (die betreffen Session/spawnEpoch, nicht den DA-Filter).

---

## 4. Cluster-Analysen

### 4.1 LSP-Subsystem (13 Commits) — Abhängigkeitsgraph
```
d96da41 (proc-refactor, Windows-Job-Object)      [macOS: optional/skip]
   │
   ▼
3c3ded3 (rust host: env/framing/mod/session.rs)  ── Backend-Fundament
   │        + lib.rs(+8), Cargo.toml(+1), modules/mod.rs(+1)
   ▼
033b7aa (process-group kill, rss watchdog)        ── baut auf 3c3ded3
   
08d83e3 (frontend client/sessionManager/editor)  ── Frontend-Fundament (1197 LOC)
   │        + EditorPane, extensions, useDocument, store.ts, package.json, vite.config
   ├──► aa43406 (statusbar pill + LspServersGroup + GeneralSection)
   ├──► d401f3b (resource-bounded, cross-file-nav)  + App.tsx, store.ts
   ├──► 1ddf798 (editor chrome, diagnostics)        + chromeTheme, DiagnosticsBadge, StatusBar, globals.css
   ├──► fef9f22 (age-guard idle eviction)           sessionManager only
   ├──► 3791846 (13 language presets)               presets.ts additiv
   ├──► e874b39 (cmd-hover, hover highlight)         client, CwdBreadcrumb, StatusBar
   └──► 42b51e7 (find references, ruff preset)       client, locationsPanel, presets
   
653dd15 (dedicated editor settings tab)  ── verschiebt Editor-Settings aus GeneralSection; legt EditorSection an
2219adb (themed lsp chrome, cmThemes+385) ── Editor-Theme-Fundament, das viele LSP/Editor-Chrome-Commits voraussetzen
docs: 1c7f3e4, 7250e4a
```
**Reihenfolge-Regel:** `3c3ded3 → 033b7aa` (Backend) und `08d83e3 → {aa43406, d401f3b, 1ddf798, fef9f22, 3791846, e874b39, 42b51e7}` (Frontend). `1ddf798`/`e874b39` brauchen die Editor-Chrome-Basis aus `2219adb`. **SSH-Interop:** Der LSP-Rust-Host spawnt Sprachserver **lokal** (`session.rs`, process-group). Das ist **lokal-only** — über den Fork-SSH-Workspace würde LSP nur auf lokalen Dateien greifen, nicht auf Remote-Workspaces (kein SSH-Transport im LSP-Layer). Das mindert den Nutzen für den SSH-zentrischen Fork-Workflow deutlich.

**Konfliktprognose LSP-Serie:** Eigene Dateien (`src/modules/lsp/*`, `src-tauri/src/modules/lsp/*`) = neu, konfliktfrei. Kollision nur an den Nähten: `App.tsx`, `lib.rs`, `store.ts`, `StatusBar.tsx`, `GeneralSection.tsx`, `EditorPane.tsx`, `extensions.ts`, `useDocument.ts`, `Cargo.toml`, `modules/mod.rs`, `vite.config.ts`, `globals.css`, `package.json`. Als kohäsive Branch-Serie machbar, aber Aufwand hoch.

### 4.2 Editor-Ausbau (11 Commits, teils LSP-verzahnt)
Datenverlust-Kern: 40a8ef2/662dbbb/85a5653 (siehe §3). Feature-Teil: find&replace+goto+indent (6980581), Formatter-Registry biome/prettier (a25fb40), Markdown-Notes (786ceb5, PICK), dotenv (ae9e690, PICK), Font-Sizing (e63ca2f), Kanagawa-Farben (7649926), Diff-Pane-Language (9ec7328), Extension-Singletons (1fd11b0). **Verzahnung:** 6980581/a25fb40/85a5653 referenzieren `chromeTheme.ts` (aus 1ddf798/2219adb) und `EditorSection.tsx` (aus 653dd15, im Fork ABWESEND). Der Editor-Feature-Block ist also nur teilweise LSP-unabhängig; sauber isoliert sind nur 786ceb5, ae9e690 (und mit Dep-Check 7649926).

### 4.3 Terminal/Panes/Tabs (6 Commits)
- `ac88362` PICK (§3), `a71fcfc` PICK (1-Zeilen-Rebind).
- **Pane-Swap `460657a`+`d6e3491`:** neue Fähigkeit "Panes richtungsbasiert tauschen/verschieben". Kollidiert frontal mit dem Fork-Split-Pane-Core (`useTabs.ts +296/-141`, `panes.ts +122/-17`, `PaneTreeView.tsx +143/-15`). **Redundanz prüfen:** Fork hat bereits Pane-Fokus-Navigation (⌘]/⌘[) + Drag&Drop (session-preserving). Directional-*Swap* ist evtl. neu, aber der Merge muss die Fork-Invariante "Pane-Move erhält Session" (zoomResizeFix) respektieren.
- **Tab-Agent-Status `3e9f374`+`0dc259d`:** siehe §Executive + Weiche 3. Fork behalten.

### 4.4 AI-Lane (5 Commits) → SKIP
`agent.ts` im Fork um 243 Zeilen entkernt (AI-Runtime getrimmt). 5c2f4cd/fe4e074/9616cc8/882641e/7b1fae6 alle AI-depri. Einzige Ausnahme: 78a0b3d (Security, §3, mit Reachability-Check).

### 4.5 fs (1) / markdown (1) / Bundle-Open-With (2)
- fs: 40a8ef2 (§3). markdown: cb75fae (PICK).
- Open-With (b9d6039+a2c8329): OS-"Open With"→Dateien in Terax öffnen; `lib.rs`(+87/+163) & `App.tsx` Hotspots, `tauri.conf.json` fileAssociations (Fork hat noch keine), `launchDir.ts` base-identisch. Nette, in sich geschlossene Feature-Welle mittlerer Priorität.

### 4.6 Deps (6) — Regenerier-Rezept
Fork nutzt **pnpm** (`pnpm-lock.yaml`, kein npm/yarn-Lock). Locks NIE mergen — regenerieren:
- npm-Gruppen (841c726 dev, a069d6f/831860b prod): die in den jeweiligen `package.json`-Hunks genannten Pakete auf die Zielversion setzen und `pnpm update <pkg>...` bzw. `pnpm install` → neuer `pnpm-lock.yaml`. `pnpm lint && pnpm check-types && pnpm test` als Gate.
- cargo-Gruppen (3e654c3, ba0e276 tauri 2.11.3→2.11.4): `cargo update -p <crate>@<version>` im `src-tauri`, dann `cargo clippy --all-targets --locked -- -D warnings && cargo nextest run --locked`.
- 1005caa (gh-actions tauri-action 0→1): reine Workflow-YAML-Änderung; **manuell** in `release.yml`/`signpath-test.yml` prüfen (Fork hat eigene Release-Infra) — wahrscheinlich SKIP.

### 4.7 Docs (4)
57bbc57 bringt **wertvolle neue** `docs/architecture/{two-process-model,security-model,pty-shell-integration,ai-subsystem,terminal-renderer-pool}.md` + `docs/contributing/testing.md` (konfliktfrei) — aber auch `TERAX.md(+101/-79)`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `PR-Template`-Churn, die mit dem Fork-Rewrite (README als Fork-Showcase) kollidieren. → nur die neuen `docs/`-Dateien nehmen. 1c7f3e4/7250e4a/7b69f5d nur bei LSP/Editor-Adoption.

---

## 5. Wellen-Vorschlag

**Welle 0 — Uncommitted landen (VOR allem):** Trackpad-Swipe-Flip+Toggle & OSC52-Clipboard-Fix committen + push. OSC52-Zone (`osc-handlers/rendererPool/clipboard`) ist von Upstream isoliert; nur `lib.rs/App.tsx/store.ts/GeneralSection.tsx` überlappen mit späteren Hotspots (unkritisch, dieselben Dateien werden ohnehin per Hand gemergt). Konflikt: keiner mit Upstream.

**Welle 1 — SAFE Quick-Wins (cherry-pick -x):** `ac88362`, `cb75fae`, `ae9e690`, `786ceb5`, `a71fcfc`, `78a0b3d`(nach Reachability-Check), `7649926`(nach cmThemes-Dep-Check). Konfliktprognose: 🟢 nahezu null (alle Zieldateien base-identisch oder additiv). Gate: pnpm+cargo grün.

**Welle 2 — Deps regenerieren:** npm-Gruppen via `pnpm update`, cargo via `cargo update` (§4.6). 1005caa manuell prüfen. Konflikt: keiner (regeneriert). Gate: Lint/Types/Test/Clippy/Nextest.

**Welle 3 — Datenverlust-Kern (Hand-Merge, HÖCHSTER NUTZEN):** `40a8ef2` → `662dbbb` → `85a5653`, in dieser Reihenfolge. fs-Gates (PDF/Jail/Symlink) erhalten (Pflicht-Review-Gate). LSP-Format-Fragment aus 85a5653 weglassen. Konflikt: 🟡🔴 `fs/file.rs` + `useDocument.ts` (`useAppCloseGuard`/`CloseDialogs` sauber). 

**Welle 4 — Feature-Adds (optional, mittlere Prio):** (a) Open-With `b9d6039`+`a2c8329`; (b) Pane-Swap `460657a`+`d6e3491` nur nach Redundanz-Check ggü. Fork-Drag&Drop. Konflikt: 🔴 `lib.rs`/`App.tsx`/`useTabs`/`panes`. Splitbar; bei Zeitdruck zurückstellen.

**Welle 5 — Editor-Feature-Rework (Weiche, hoher Aufwand):** `653dd15`+`2219adb`+`6980581`+`a25fb40`+`e63ca2f`+`9ec7328`+`1fd11b0` + `docs 7b69f5d` + `docs 57bbc57`(nur neue Dateien). Konflikt: 🔴 `GeneralSection`/`EditorPane`/`store`/Settings + Kollision mit Welle 0 (uncommitted GeneralSection). Nur wenn Editor Priorität hat.

**Welle 6 — LSP-Subsystem (Weiche, größter Aufwand):** ganze 13-Commit-Serie als eigene Branch (§4.1-Reihenfolge). Setzt Welle 5 (Editor-Chrome) für volle Integration voraus. **Lokal-only** (kein SSH-Transport) → für SSH-Workflow begrenzter Nutzen. Empfehlung: eigenes Projekt/spätere Runde, nicht in dieser Sync-Runde.

**Zurückgestellt/SKIP:** AI-Lane (5c2f4cd, fe4e074, 9616cc8, 882641e, 7b1fae6), Tab-Status (3e9f374, 0dc259d — Fork behalten), 0baf265/a7506be (Version manuell), 1005caa (CI), reine LSP/Editor-Docs solange Subsysteme nicht adoptiert.

---

## 6. Weichen (nummeriert, je mit Empfehlung)

1. **LSP-Subsystem übernehmen?** (13 Commits, ~2500 LOC neu + Hotspot-Nähte). → *Empfehlung: NEIN in dieser Runde / eigenes Projekt.* Lokal-only (kein SSH), hoher Merge-Aufwand an `App.tsx`/`lib.rs`/`store.ts`, mittlerer Nutzen bei Terminal-first-Workflow.
2. **Editor-Feature-Block: komplett / nur Datenverlust-Fixes / skip?** → *Empfehlung: nur Datenverlust-Kette (40a8ef2+662dbbb+85a5653) + die 2-3 sauberen Picks (786ceb5, ae9e690).* Rest (653dd15/2219adb/6980581/a25fb40/e63ca2f) zurückstellen (kollidiert mit uncommitted GeneralSection, hoher Aufwand, EditorSection abwesend).
3. **Upstream Tab-Agent-Status (3e9f374+0dc259d) vs Fork-#52 `TabActivityIndicator`?** → *Empfehlung: Fork BEHALTEN, Upstream SKIP.* Fork ist Mission-Control-integriert (`agentStore`) & pane-aware; Upstream ist Parallel-Impl auf eigener `agentActivity`-zustand-Quelle. Optional später die 4-Phasen-Granularität (working/attention/finished/idle + reduced-motion + theme colors) manuell in `TabActivityIndicator` nachziehen — kein Pick, sondern gezielte Übernahme der Idee.
4. **Version auf 0.8.5 heben?** → *Empfehlung: JA, manuell* `package.json`+`Cargo.toml`+`tauri.conf.json` auf `0.8.5` (oder `0.8.5-terax`). `0baf265` NICHT picken (kosmetisch, Updater deaktiviert, About zeigt Build-Commit). `a7506be` (nix) SKIP.
5. **Open-With-Feature (b9d6039+a2c8329)?** → *Empfehlung: JA-optional (Welle 4).* Nette OS-Integration, in sich geschlossen; `lib.rs`/`App.tsx`-Konflikt mittel. Bei Zeitdruck zurückstellen.
6. **Pane-Swap-Shortcuts (460657a+d6e3491)?** → *Empfehlung: erst Redundanz-Check.* Kollidiert mit Fork-Split-Pane-Core; evtl. teilweise durch Fork-Drag&Drop/⌘]-Navigation abgedeckt. Nur übernehmen, wenn "Panes richtungsbasiert tauschen" echten Mehrwert bringt und die Session-Preserving-Invariante gewahrt bleibt.
7. **78a0b3d (AI-Search-Härtung) trotz AI-depri picken?** → *Empfehlung: JA (Security-Override) — nach Reachability-Check.* Erst verifizieren, dass die AI-Such-Tools im Fork überhaupt erreichbar sind (`agent.ts` −243). Tot → dann SKIP.
8. **fs-Umbau 40a8ef2 per Hand auf die Fork-Gates portieren?** → *Empfehlung: JA, mit Pflicht-Review.* symlink-aware-`fs_stat` ist ein echter Fix, mtime/force sind Voraussetzung für die Datenverlust-Fixes; PDF-Magic-Byte-/Jail-/Symlink-Refuse-Gates MÜSSEN erhalten bleiben.
9. **Docs 57bbc57: nur neue `docs/architecture/*` übernehmen, TERAX/README-Churn verwerfen?** → *Empfehlung: JA.* Neue Architektur-Guides wertvoll & konfliktfrei; Fork-README/TERAX.md nicht überschreiben.
10. **CI-Dep-Bump 1005caa (tauri-action 0→1)?** → *Empfehlung: manuell prüfen, wahrscheinlich SKIP.* Fork hat eigene `release.yml`/`signpath-test.yml`; released evtl. nicht über diese Action.
