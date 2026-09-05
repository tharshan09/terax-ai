# Upstream-Sync 0.8.5 — Tracking

Feature: crynta-Upstream (v0.8.5, Tag-Commit `0baf265`, 2026-07-10) selektiv in den Fork ziehen.
Route: selektive Wellen (User-bestätigt 2026-07-17).

## ✅ SYNC ABGESCHLOSSEN (2026-07-19)
- **Alle Wellen gemergt auf origin/main = `3d3a54d`:** W0/PR #61 (Swipe+OSC52-Fixes) · W1/PR #62 (6 Picks) · W2/PR #64 (Deps + Version 0.8.5) · W3/PR #63 (Datenverlust-Kern). Alle 4 Review-Gates APPROVED, 0 blocking; Protokolle als PR-Kommentare.
- **Gesamt-Gate final grün:** tsc 0 · vitest 481/481 · cargo check/clippy/test grün · pnpm build ✓. Test-Bridge-e2e: alle 6 Bereiche PASS (Details unten).
- **Release-Build 0.8.5 gebaut** aus `3d3a54d`: `src-tauri/target/release/bundle/macos/Terax.app` + `bundle/dmg/Terax_0.8.5_aarch64.dmg` (Version + adhoc-Signatur verifiziert). **INSTALLIERT & LIVE** (User-OK): /Applications/Terax.app = 0.8.5, re-signed, läuft.
- **Bewusst NICHT gesynct** (für künftige Syncs): LSP-Serie 13 Commits (eigenes Projekt), Editor-Rework (653dd15/2219adb/a25fb40/6980581), force/openAnyway-Large-File-Pfad (kein UI-Trigger), adoptDiskText (tot ohne Format-on-Save), AI-Lane, Upstream-Tab-Status, Open-With/Pane-Swap (W4 entfällt: „nur Fixes"), 78a0b3d (Fork hatte den Fix), CI-Bump 1005caa. merge-base zu upstream bleibt `d77476e` (Cherry-Picks, kein Merge).

## Stand Phase 0 (2026-07-17)
- Adapter angelegt: `.claude/playbook.md` (aus Memory-Wissen, kein Interview nötig).
- Delta vermessen: merge-base `d77476e` (unverändert seit Sync 2026-07-01). 65 Commits `main..upstream/main`; davon 8 per `-x` gepickt (2930d8e, 3f4d680, 4d3160d, 68caf02, 89e399a, b23cd00, c1b789b, ef55e36) + 6 erledigt/geskippt (bba1b5f schon-drin, a3ebccd Linux, 3d1ba19 WSL, 52b90c1 WSL-fish, c0a51d5 AI-depri, 9bee3be deps-regeneriert als PR #35) → **~51 neue zu bewerten**.
- Umfang: 171 Dateien, +12 395 / −2 455. Voller Merge = **128 Konflikt-Dateien** (merge-tree) → selektive Wellen wie beim letzten Sync.
- Grobe Cluster: LSP-Subsystem NEU (~12 Commits) · Editor-Ausbau (~10) · Terminal/Panes/Tabs (pty response order!, pane swaps, agent status on tabs ↔ Kollision Fork-#52) · AI (depri; aber 78a0b3d Security path-filtering, 882641e provider errors) · fs-Umbau 40a8ef2 (↔ fork fs-Gates) · markdown static previews cb75fae (Security) · Open-With-Bundle · Deps · Docs/TERAX.md.
- WICHTIG: Working Tree enthält 2 fertige uncommitted Features (Trackpad-Swipe-Flip+Toggle, OSC52-Clipboard-Fix via NSPasteboard) — müssen VOR Merge-Wellen landen. User-Frage läuft.

## Wellen-Status (Phase 4)
- [x] Plan freigegeben (User, 2026-07-17): **alle Wellen**; Extras/W4: **entfällt** („keins — nur Fixes")
- [x] **W1 implementiert → PR #62 offen** (6 Picks, alle Plan-Annahmen hielten; Gates im Worktree: tsc 0 · vitest 470 grün · biome 0 Fehler (1 tolerierte Bestands-Muster-Warning markdownExtras.ts, dokumentiert) · cargo check 0 · cargo test da_filter 23 grün). Manuelle Auflösungen: MarkdownPreviewPane (Fork-Plugins + mode="static" koexistieren), TERAX.md-Hunk verworfen, cmThemes 3-way.
- [x] **Review-Gate W1 PASSED**: Opus-Diff-Review APPROVED 0 Findings (alle Picks byte-/logikgetreu, da_filter byte-identisch, Streamdown-Props konfliktfrei) + Stufe-2-Stichproben ✓ (Secret-Grep, TERAX.md, cmThemes wertgleich). Protokoll als PR-#62-Kommentar.
- [x] **PR #61 + PR #62 GEMERGT auf origin/main** (User-Merge-Gate erteilt, 2026-07-19). Lokaler main gepullt: `1dded7f` → `cf7efaa` (fast-forward, `git pull origin main`). TCC-Blocker vom 2026-07-19 durch Session-Neustart gelöst (~/Documents wieder lesbar).
- [x] W1-Worktree entfernt + Branch sync/w1-upstream-fixes gelöscht (2026-07-19). **Gesamt-Gate auf main `cf7efaa` GRÜN:** tsc 0 · vitest 472/472 · cargo check 0 (zeigt noch v0.8.2 → W2) · pnpm build ✓.
- [x] **W2 implementiert → PR #64 offen** (Commit 532cfc2): tauri 2.11.3→2.11.5 (ba0e276+3e654c3), ignore 0.4.27, bytes 1.12.1, 18 npm-Ranges (831860b/a069d6f/841c726), Version 0.8.5 in package.json/Cargo.toml/tauri.conf. Gates grün (tsc 0 · vitest 472 · cargo check `terax v0.8.5` · build ✓). 2 dokumentierte Abweichungen: pnpm-workspace-Overrides react-grab 0.1.47 + react-doctor 0.5.8 (react-scan pinnt auf floating `latest`, Transitive scheitern am minimumReleaseAge-Gate; Pins = exakt bisher ausgelieferte Versionen) + `pnpm dedupe` (doppelte @codemirror/state+view-Typkopien nach scoped Bump).
- [x] **W3 implementiert → PR #63 offen** (Commit e5f2c92): mtime in ReadResult::Text (+`#[serde(default)]`) + fs_write_file→Result&lt;u64&gt; + fs_stat symlink_metadata-Fix; native.ts mtime; eol.ts+9 Tests; useDocument reimplementiert (diskMtimeRef-Konfliktbaseline, EOL-Erhalt, reload/save-Race-Recheck, workspace/trusted überall erhalten); useAppCloseGuard+CloseDialogs (busyTerminal VOR dirty-Count); EditorPane onSaved nur bei echtem Write. Ausgelassen wie geplant: adoptDiskText, force/FORCE_MAX, externalFormat/lsp. 2 dokumentierte Abweichungen: SSH-Remote-Helper liefert mtime (sonst falscher Dauer-Konflikt bei Remote-Saves) + stat-after-write im SSH-Pfad. Gates grün (tsc 0 · biome 0 neu · vitest 481 · cargo check/clippy/test 370 grün · build ✓).
- [x] **Review-Gate W2 PASSED → PR #64 GEMERGT** (2026-07-19): APPROVED, 0 blocking (F1 Low informational: Windows-only windows-sys-Cross-Refs re-unifiziert, macOS-inert). Override-Pins drift-frei gegen alten Lock verifiziert, keine Major-Bumps, AI-SDK-Refs identisch (kein Hand-Merge). Protokoll: PR-#64-Kommentar. W2-Agent-Worktree + Branch entfernt.
- [x] **Review-Gate W3 PASSED → PR #63 GEMERGT** (2026-07-19): APPROVED, 0 blocking (4 Findings Low/Info/Nit: mtime==0 selbstheilend non-destruktiv; ms-Auflösung wie Upstream; fs_stat war schon in main un-gejailt, Fix leakt nichts Neues; native.ts invoke&lt;void&gt; harmlos). Security-Invarianten belegt: guard::-Aufrufe 8/8 identisch platziert, trusted fail-closed, fs_is_pdf unangetastet, guard.rs nicht im Diff. Scope-treu, 0 verbotene Symbole. Protokoll: PR-#63-Kommentar.
- [x] **main gepullt = `3d3a54d`** (beide Merges drin), alle Agent-Worktrees + Branches entfernt. **Gesamt-Gate 2 GRÜN:** pnpm install ✓ · tsc 0 · vitest 481/481 · cargo check `terax v0.8.5` (tauri 2.11.5) · pnpm build ✓.
- [x] **Test-Bridge-e2e ALLE 6 BEREICHE PASS (2026-07-19):** Nach kurzer Unterbrechung (User startete Prod → per AskUserQuestion „Jetzt testen" freigegeben, Prod beendet, Dev+Bridge neu). Ergebnisse: (1) clipboard_write_text-invoke → pbpaste ✓. (2) OSC52 e2e im App-Terminal (frischer Tab/neue terax-rs-Session, tmux-DCS-Passthrough nötig — lokales tmux `set-clipboard external` reicht OSC52 selbst nicht durch, Prüfgegenstand war der App-Handler) → pbpaste ✓ + Toast „Clipboard set by a terminal program" ✓. (3) trackpadTabSwipe: Store default true ✓, Settings→General zeigt „Trackpad swipe to switch tabs"-Toggle (AX-verifiziert) ✓, Gesture-Gate App.tsx:1036 verdrahtet ✓ (physische Geste = User-Test nach Install; AX kann Radix-Switch nicht klicken). (4) fs_stat Symlink → kind=="symlink" ✓ (Datei → "file" ✓). (5) Save-Konflikt: dirty Buffer + externer Write + Cmd+S → Toast „File changed on disk … Overwrite", Save BLOCKIERT (Disk behielt externe Version), Overwrite-Klick schreibt App-Stand ✓. (6) W1-Smoke: .env-Highlighting (6 Token-Spans, 3 Klassen) ✓, Markdown static Preview (h1 + 2 GFM-Task-Checkboxen + fenced code) ✓. Gotchas fürs nächste Mal: `__TAURI_INTERNALS__.invoke` statt `__TAURI__` (kein withGlobalTauri); Toast-Asserts in-App sampeln (sonner ~4s); Settings = eigenes Fenster ohne Bridge → open_settings_window-invoke + AX; Editor-Open per Explorer-DOM-Klick (pointer+mouse-Event-Sequenz); CM6-Buffer via DOM-Mutation dirty machen. Aufgeräumt: Testdateien/Session weg, Dev beendet, **Prod-Terax wieder gestartet ✓**. Eigene Steuereinheits-Stichproben ✓ DONE: (1) W3-file.rs-Diff entfernt KEINE guard::/enforce_/fs_is_pdf/trusted-Zeile, nur mtime-Rückgabe + symlink_metadata; (2) useDocument behält trusted:true + workspace auf jedem invoke; (3) W2-Version 0.8.5 in allen 3 Dateien, Overrides eng gepinnt + kommentiert; (4) fs_write_file-Frontend-Aufrufer (themeFiles.ts:37, native.ts:183, useDocument.ts:54) — die zwei Nicht-Editor-Aufrufer ignorieren die Rückgabe → Result&lt;u64&gt;-Umstellung bricht nichts.

## Offene Gates
- [x] User: Route bestätigt → **selektive Wellen** (2026-07-17)
- [x] User: uncommitted Features → **als PR**: #61 (Branch `fix-swipe-clipboard`, Commits `4969f0b` clipboard + `1b6d163` swipe; lib.rs-Hunks chirurgisch gesplittet via temporärem Flip-Revert). User reviewt selbst vor Merge; Opus-Diff-Review als Stufe-1-Legwork gespawnt.
- [x] Discovery-Dossier: specs/upstream-sync-0.8.5/discovery.md
- [x] Weichen aus Dossier mit User geklärt → Wellenplan (plan-review.md)
- [x] PR #61 gemergt (User-Gate erteilt)
- [ ] Wellen W2+W3 implementieren (Phase 4) → Review-Gates → Merge/Verify → Test-Bridge-e2e → Release-Build (Install nur mit User-OK)

## Arbeitszustand (2026-07-19)
- HEAD auf `main` = `cf7efaa` (origin/main gepullt, #61+#62 drin). User-Freigabe liegt vor: „alle sauber mergen" → W2/W3-PRs nach bestandenem Review-Gate mit `--merge` mergen.

## Discovery-Ergebnis (2026-07-17)
- Dossier: specs/upstream-sync-0.8.5/discovery.md. Zählung: 7 PICK · 15 MERGE-HAND · 13 LSP (Weiche) · 8 SKIP · 6 REGEN · 2 Version. Riskanteste: 40a8ef2 (fs vs. Security-Gates), 653dd15 (GeneralSection vs. PR#61-Toggle), d6e3491/460657a (Pane-Swap vs. Split-Core).
- **Stichprobe (Steuereinheit):** ac88362 ✓ konfliktfrei (nur da_filter.rs, Fork unverändert) · agentActivity.ts ✓ Fork-unverändert (Tab-Status-Claim hält) · **cb75fae ✗ „base-identisch" falsch** — MarkdownPreviewPane.tsx ist im Fork geändert (HTML-Preview); Patch +2 Zeilen, vermutlich 3-way-sauber, aber herabgestuft auf „Pick mit Prüfung".
- Von mir per Empfehlung entschieden (kein User-Trade-off): Tab-Status → Fork behalten, Upstream-Badge skip · 78a0b3d Security-Pick ja (mit Reachability-Check) · Docs 57bbc57 nur neue docs/architecture/* · CI-Bump 1005caa skip · Deps regenerieren statt mergen.

## User-Weichen (2026-07-17)
- LSP-Subsystem: **später, eigenes Projekt** (13 Commits geskippt)
- Editor: **nur Datenverlust-Kette** (40a8ef2→662dbbb→85a5653, fs-Gates erhalten, Pflicht-Review) + saubere Picks
- Version: **auf 0.8.5 heben**, manuell (Release-Commit nicht picken)
- Extras (Open-With / Pane-Swap): **Frage übersprungen → OFFEN**, vor W4 einmal nachfragen; blockiert W1–W3 nicht

## Finaler Wellenplan (Plan-Review GO-mit-Änderungen, Korrekturen eingearbeitet; plan-review.md)
- **W0:** PR #61 mergen (User-Gate; Diff-Review APPROVED 0 Findings, Protokoll im PR). Kein Datei-Overlap mit W1 → W1 darf parallel starten.
- **W1 (1 PR, von main):** In Upstream-Chronologie: sauber `-x`: ac88362, 786ceb5, a71fcfc · Pick+TERAX.md-Hunk-drop: ae9e690 (786ceb5 VOR ae9e690, gemeinsames languageDefinitions.ts) · Handarbeit: cb75fae (2 Z. in fork-geänderter MarkdownPreviewPane.tsx), 7649926 (~10 Z. 3-way in cmThemes.ts, KEIN Dep nötig). **GESTRICHEN: 78a0b3d** (Fork hat filterReadableHits/checkReadable bereits — ✓ selbst stichprobiert search.ts:40,95,133).
- **W2 (1 PR):** Deps regenerieren (cargo update --precise auf tauri 2.11.4 non-breaking ✓, pnpm-Gruppen), Locks nie mergen; Version manuell auf 0.8.5.
- **W3 (1 PR, REIMPLEMENTIERUNG statt Hand-Merge):** Datenverlust-Kern portieren: (a) 40a8ef2-Teilmenge: mtime in Rust ReadResult (file.rs:104) + ai/lib/native.ts + **fs_stat-Symlink-Fix** (file.rs:292 nutzt metadata() → Symlink-Zweig toter Code — ✓ selbst verifiziert; auf symlink_metadata umstellen), `force`/FORCE_MAX_READ_BYTES DEFER (kein UI-Trigger im Fork); (b) 662dbbb-Kern: EOL erhalten, Save-Konflikt-Dialog, Quit-Guard (useAppCloseGuard.ts/CloseDialogs.tsx neu, im Fork base-identisch absent), OHNE adoptDiskText (toter Code ohne Format-on-Save); (c) 85a5653-Kern: NUR useDocument.ts Race-Recheck + useAppCloseGuard Ordering; EditorPane/externalFormat/lsp-Hunks ENTFALLEN (setzen geskippte Formatter-Registry/LSP voraus). Fork-useDocument divergiert (SSH-workspace-Param, trusted-Flag) → fs-Gates erhalten, Voll-Eskalation im Review-Gate.
- **W4 (optional, offene Weiche):** Open-With und/oder Pane-Swap (nach Redundanz-Check) — User-Frage ausstehend.
- Zurückgestellt: LSP-Serie (eigenes Projekt), Editor-Rework, AI-Lane, Upstream-Tab-Status (Fork behalten), Docs-Churn (nur neue docs/architecture/* in W1 optional), CI-Bump.

## Telemetrie
| Agent-Rolle | Modell | Tokens | Dauer | Fehlschleifen | Verdikt |
|---|---|---|---|---|---|
| Discovery Upstream-Dossier | opus | 121 868 | 12,2 min | 0 | geliefert; Stichprobe: 1 Genauigkeitsfehler (cb75fae) |
| Diff-Review PR #61 | opus | 53 673 | 5,1 min | 0 | APPROVED, 0 Findings |
| Plan-Review Wellenplan | opus | 120 932 | 10,4 min | 0 | GO-mit-Änderungen (8 Korrekturen); Stichprobe 2/2 Claims bestätigt |
| W1-Implementierung (6 Picks) | opus | 110 967 | 11,6 min | 0 | PR #62 offen, Gates grün, 0 Plan-Abweichungen |
| Diff-Review PR #62 (W1) | opus | 39 277 | 3,0 min | 0 | APPROVED, 0 Findings, merge-ready |
| W2-Implementierung (Deps+Version) | opus | 131 287 | 15,7 min | 0 | PR #64, Gates grün, 2 dokumentierte Abweichungen (beide nötig) |
| W3-Implementierung (Datenverlust-Kern) | opus | 171 403 | 14,1 min | 0 | PR #63, Gates grün (481 Tests), 2 sinnvolle Abweichungen (SSH-mtime) |
| Diff-Review PR #64 (W2) | opus | 77 791 | 5,1 min | 0 | APPROVED, 0 blocking (1 Low informational) |
| Diff-Review PR #63 (W3, Voll-Eskalation) | opus | 104 683 | 6,6 min | 0 | APPROVED, 0 blocking (4 Low/Info/Nit), Security-Invarianten belegt |
