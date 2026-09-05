# perf-multisession — Progress (externes Gedächtnis der /feature-Session)

**Gestartet:** 2026-07-22 · **Plan:** `specs/perf-multisession/PLAN.md` (verifizierter Audit-Plan, ersetzt Discovery+Architektur)
**Route:** L, Wellen-Loop ab Phase 4 (Phasen 1–3 durch Audit-Plan abgedeckt; Plan-Review skip: bereits 4 adversariale Prüfer im Audit). AC-Specs: GIVEN/WHEN/THEN stehen bereits im Plan → kein ac-generator (dokumentierte Abweichung von Modus B).

## Entscheidungen (User, 2026-07-22 — Abschnitt 5 des Plans)

1. **W1 Timeout-Budgets:** Poll-Klasse **6 s** (tmux_pane_cwd, claude_status, claude_status_batch — pro Remote-Aufruf/Host, NICHT pro Batch), fs-Klasse **30 s** (fs_read_dir, fs_read_file, fs_canonicalize, fs_stat — nur Remote-Pfad; lokale Ops ohne Kill-Timeout).
2. **W2b Backpressure:** Option (ii) **Rust-Sichtbarkeits-Push** (Flusher-Coalescing-Fenster für unsichtbare Sessions). Korrektheits-AC: kein Ausgabeverlust beim Sichtbarwerden.
3. **W3 Umfang:** **Memoisieren, dann messen.** Architektur-Entkopplung (activeId/leafCwd aus App-Render) nur bei nachgewiesen weiterhin linearer Commit-Zeit.
4. **W4:** erst nach Messung nach W1–3 entscheiden.

## Wellen-Status

| Welle | Inhalt | Status | Branch/PR |
|---|---|---|---|
| W1 | Freeze-Fix: SSH/FS-Commands Timeout + async/spawn_blocking (+ Review-Fix: search/grep async + 30s) | **MERGED + VERIFIED** (e2e wedged-Repro litha-claude, Quittung im PR) | PR #65 ✅ |
| W2a | Claude-Stats-Poll inFlight+hidden-Guard | **MERGED + VERIFIED** (kein Pile-up @6s-Budgets, hidden-Pause live) | PR #66 ✅ |
| W2b | PTY-Backpressure (+ Review-Fix: cap-aware early flush 1 MiB + hint-cache-Reset) | **MERGED + VERIFIED** (30k-Zeilen-Hidden-Flood lückenlos, Screenshot-Beweis) | PR #67 ✅ |
| W3 | O(N) App-Re-Render (Memoisierung, Per-Tab-Layer, Indicator-Selektor; + Review-Fix B.4 dead code) | **MERGED + VERIFIED** (`main` `293f8de`; Messung: 35 ms median bei 6 UND 20 Tabs — AC erfüllt) | PR #68 ✅ |
| W4 | Pool-Tuning | **GEPARKT** (User-Entscheid 2026-07-22 auf Messbasis: 96 ms Verdrängungs-Switch akzeptabel; Wiedervorlage nur, falls es im Alltag mit 0.8.5 stört) | – |

**FEATURE ABGESCHLOSSEN 2026-07-22.** Alle Wellen durch implement→Review-Gate→Merge-Gate→Merge→Verify; W4 geparkt.

**Release 0.8.5 (Stand `293f8de`, W1–W3) gebaut, adhoc-signiert, in /Applications installiert, läuft (2026-07-22 abends).**

## Telemetrie

### Welle 1

| Agent-Rolle | Modell | Tokens | Dauer | Fehlschleifen | Verdikt |
|---|---|---|---|---|---|
| Impl W1 (Worktree) | Opus 4.8 | 203k | 22,5 min | 0 (1 Infra-Stall, per Continuation fortgesetzt) | DONE: PR #65, alle Gates grün (313 lib + 60 Integr.-Tests, 481 Vitest, Typecheck, Build; Clippy Baseline 4) |
| Impl W1 Review-Fix (Continuation) | Opus 4.8 | 227k | 4,8 min | 0 | DONE: search/grep async + 30s (`18140d1`), Gates erneut alle grün; kein JS-Impact (Tauri-injizierte Params) |
| Diff-Review W1 (unified-reviewer) | Opus 4.8 | 111k | 12,2 min | 0 | APPROVED, 0 Findings; wait_child/Zombie/Doppel-wait sauber; Frontend-Konsumenten verkraften Timeout-Err (batch→all-absent mit WORKING_HOLD-Schutz, tmux-Poll catch-skip) |
| Claim-Verifier W1 | Opus 4.8 | 81k | 6,4 min | 0 | DONE: 5/6 CONFIRMED + Zusatzcheck sauber; 1 Fund: fs_search/fs_grep_interactive weiter sync+wait-forever (User-Hotpath, Freeze-Lücke) |
| Secret-Scan (gitleaks, mechanisch) | – | – | – | – | PASS (no leaks, 39,5 KB Diff) |
| Stichprobe Fable (wait_child + Budget-Zuordnung ssh.rs) | Fable 5 | – | – | – | PASS: kill+reap im Timeout-Arm, laute Logs, `list_subdirs` bewusst `None` |

### Welle 2

| Agent-Rolle | Modell | Tokens | Dauer | Fehlschleifen | Verdikt |
|---|---|---|---|---|---|
| Impl W2a (Worktree) | Sonnet | 85k | 6,1 min | 0 | DONE: PR #66, Gates grün (484 Vitest inkl. 3 neue, Typecheck, biome, Build); Abweichung Closure-Flag statt useRef sauber begründet |
| Impl W2b (Worktree) | Opus 4.8 | 186k | 20,5 min | 0 | DONE: PR #67, Gates grün (317 lib inkl. 7 neue Flusher-Tests, 485 Vitest inkl. 4 neue, Typecheck, Build, Clippy Baseline) |
| Diff-Review W2b (unified-reviewer) | Opus 4.8 | 84k | 9,1 min | 0 | APPROVED, 0 Findings (alle 5 Leitplanken verifiziert; 2 non-blocking Beobachtungen: optimistischer lastVisibleHint bei IPC-Reject ≤64ms in Toleranz; Tail-Reorder-Fenster pre-existing) |
| Claim-Verifier W2b | Opus 4.8 | 90k | 8,7 min | 0 | 5/6 hart CONFIRMED; 2 Edge-Funde → Fix-Nachtrag: (1) MAX_PENDING-Flood-Drop bei ~64 MB/s statt ~1 GiB/s für hidden Tabs (Cap-aware early flush), (2) optimistischer lastVisibleHint ohne catch-Reset (aktiver Tab könnte bei 64ms kleben) |
| Secret-Scan W2b (gitleaks) | – | – | – | – | PASS |
| Stichprobe Fable (FlushControl/run_flusher) | Fable 5 | – | – | – | PASS: kein Lost-Wakeup (Store unter Wait-Lock), Prädikat im Loop, mem::take atomar; MAX_PENDING-Frage an Claim-Verifier notiert |
| Impl W2b Review-Fix (Continuation) | Opus 4.8 | 239k | 10,2 min | 0 | DONE: Cap-Guard + catch-Reset (`2ad7d4c`), 379 Rust-Tests grün (2 neue, Flood-Test 5/5), alle Gates grün |
| Stichprobe Fable (Fix: coalesce-Konsum, push_pending, catch-Rollback) | Fable 5 | – | – | – | PASS |
| Diff-Review W2a (unified-reviewer) | Opus 4.8 | 49k | 4,9 min | 0 | 1 LOW-Fund (B.7 Guard-Parität `cancelled`); Qualität/Tests/Lifecycle explizit sauber; Fund → Fix-Nachtrag |
| Secret-Scan W2a (gitleaks) | – | – | – | – | PASS (6,6 KB Diff) |
| Stichprobe Fable (Hook-Diff W2a) | Fable 5 | – | – | – | PASS: Guard+finally korrekt, Bestandslogik unangetastet, stiller catch ist Bestand |

### Welle 3

| Agent-Rolle | Modell | Tokens | Dauer | Fehlschleifen | Verdikt |
|---|---|---|---|---|---|
| Impl W3 (Worktree) | Opus 4.8 | 198k | 22,9 min | 0 | DONE: PR #68, Gates grün (494 Vitest inkl. 6 neue Render-Count-Tests, Typecheck, Build, biome nur Bestands-Warnings); Beweis: React Compiler an, löst O(N) NICHT (Baseline alle 20 re-rendern) |
| Diff-Review W3 (unified-reviewer) | Opus 4.8 | 95k | 8,4 min | 0 | 1 LOW-Fund (B.4: aggregateAgentStatus produktions-tot + Regel dupliziert) → Fix-Nachtrag; alle Staleness-/W2b-/Mount-Risiken explizit sauber; React-Compiler-Notwendigkeits-Analyse bestätigt |
| Claim-Verifier W3 | Opus 4.8 | 89k | 7,2 min | 0 | 6/6 CONFIRMED, keine Staleness; Prop-Matrix über alle Grenzen; W2b-Kette lückenlos; Keys stabil; 1 Formulierungs-Vorbehalt (Test misst alte Baseline nicht selbst — kein Defekt) |
| Secret-Scan W3 (gitleaks) | – | – | – | – | PASS |
| Stichprobe Fable (App-Callbacks, TerminalTabLayer, getBundle-Ref-Muster) | Fable 5 | – | – | – | PASS |

## e2e-Verify 2026-07-22 (W1+W2a+W2b, Test-Bridge, User-OK für Prod-Quit lag vor)

- Setup: `pnpm tauri dev` + `TERAX_TEST_BRIDGE` (**Gotcha:** gebautes Debug-Binary reicht NICHT — Frontend-Bridge lädt nur unter `import.meta.env.DEV`, also Vite-Dev-Server nötig). Prod-App vorher beendet, danach wieder gestartet (läuft, alter Build).
- W1: wedge litha-claude tmux-Server (PID via `tmux display-message -p '#{pid}'`, `kill -STOP/-CONT`). UI reaktiv (6 Evals ~540 ms konstant), 6s-Budget-Kills laut geloggt, Batch = 1 Exec/Host, saubere Erholung. VERIFIED.
- W2a: Warn-Kadenz ~15 s statt 2–3 s → kein Pile-up; hidden ⇒ Polls pausieren (live gesehen). VERIFIED.
- W2b: `{ sleep 5; seq 1 30000; echo W2B_DONE2; }` in frischem Tab, vor Zünder in Hintergrund geschaltet; bufferLines 25050 während hidden, Screenshot: `…30000, W2B_DONE2` lückenlos, keine OVERFLOW-Notice; `visible`-Flags pro Session korrekt; DormantRing für slotlose Session aktiv. VERIFIED (Emit-Rate ~16× per Rust-Ratio-Test belegt; e2e-Emit-Zählung ohne Instrumentierung nicht möglich).
- Bridge-Gotchas fürs nächste Mal: Tab-Klick braucht volle Pointer-Event-Sequenz (`pointerdown→click`), `click()` allein wirkt nicht; xterm-WebGL-Renderer ⇒ Textinhalt NICHT im DOM (Screenshot oder `__teraxTerm()`-Stats nutzen); Injection per synthetischem `ClipboardEvent("paste")` + Enter-keydown aufs `.xterm-helper-textarea` funktioniert; `__teraxTerm()` liefert Pool-/Session-/Ring-Stats inkl. `visible`-Flags.
- **INCIDENT (behoben):** erster Full-Screen-Screenshot erwischte den Browser des Users (privater Inhalt) statt der App (App lag auf anderem Space) → Datei sofort gelöscht, danach nur noch nach Fokus-Bestätigung (`document.hasFocus()` via Bridge) gecaptured. Regel: nie blind full-screen capturen.

## Log

- 2026-07-22: Session gestartet, Adapter `.claude/playbook.md` geladen, 4 offene Entscheidungen mit User geklärt (alle Empfehlungen bestätigt). W1-Impl-Agent gespawnt.
- 2026-07-22: W1-Impl-Agent hatte 1 Infra-Stall (600 s Watchdog), per Continuation fortgesetzt — kein inhaltlicher Fehler.
- 2026-07-22: W1 DONE (PR #65, `cf0a2f2`). Abweichungen laut Impl-Report: `master_alive` bewusst ohne Timeout gelassen (nur lokaler Socket, begründet); `fs_read_file` State→AppHandle (Muster git/commands.rs); `tests/fs_search.rs` rief `fs_read_dir` direkt → `fs_read_dir_blocking` pub exponiert. Review-Gate gestartet (unified-reviewer + Claim-Verifier, beide Opus) + Secret-Scan PASS + eigene Stichprobe PASS.
- 2026-07-22: W2a (Sonnet) + W2b (Opus) parallel gespawnt — Datei-Level-Conflict-Scan gegen W1 und untereinander: disjunkt (W1 ließ lib.rs unangetastet; W2b bekommt lib.rs für Command-Registrierung exklusiv).
- 2026-07-22 Claim-Verifier W1: 5/6 CONFIRMED (Kill/Reap real getestet mit echtem `sleep 30`; Batch-Budget pro Host; lokale Ops ohne Kill; laut; JoinError→Err). **FUND (Fix in Welle):** `fs_search` (search.rs:54) + `fs_grep_interactive` (grep.rs:239) sync auf Main + `None` über `ssh::search`/`ssh::grep` (ssh.rs:1030/1051), aufgerufen debounced as-you-type (`useContentSearch.ts:31`, `ExplorerSearch.tsx:115`) → wedged Host friert Suche/UI weiter ein. Geplanter Fix: async + spawn_blocking + `Some(REMOTE_FS_TIMEOUT)`; wird mit Diff-Review-Funden gebündelt an Impl-Agent zurückgegeben. Nachrangig notiert (kein W1-Fix): `list_subdirs`, `tmux_list_sessions` u. a. sync+None auf selteneren User-Pfaden — Kandidaten für späteres Hardening.
- 2026-07-22 MERGE-BLOCK 1 (User-OK): PR #65 + #66 squash-gemergt → `main` `87d1cbd` + `d03f67d`, origin aktuell. Mechanisches Gate auf finalem main: cargo test 313+26+27+7 ✓, tsc ✓, vitest 57/484 ✓, Build ✓. **GOTCHA fürs Gate:** `pnpm vitest run` im Haupt-Checkout globbt `.claude/worktrees/` mit (Suite ~4×, useUiFonts-Artefakt-Failures in Worktree-Kopien) → immer `--exclude "**/.claude/**"` oder Worktrees vorher aufräumen. Gemergte Worktrees (perf-w1, W2a) entfernt; W2b-Worktree läuft noch. **User-Entscheid: e2e-Verify (Test-Bridge, wedged-Repro) gebündelt NACH W2-Merge** — ein Dev-Build, ein Prod-Quit-Fenster (Quit-OK separat einholen!).
- Wedged-Repro für W1-Verify (aus Impl-Report): SSH-Tab öffnen → auf dem Host `kill -STOP` auf den Prozess hinter der Verbindung (Socket lebt, Kommandos hängen) → vorher: UI-Freeze beim Poll; nachher: Poll-Fehler nach 6 s, UI reaktiv. Auflösen mit `kill -CONT`.
