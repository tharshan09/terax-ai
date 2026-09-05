# Terax — Performance-Regression bei vielen Sessions: Audit + Umsetzungsplan

**Stand:** 2026-07-22
**Zweck:** Dieses Dokument ist die verifizierte Diagnose + der wellen-strukturierte Umsetzungsplan.
Eine **neue Session** soll ihn per `/feature` (Wellen-Loop) abarbeiten. Es wurde noch **kein Code geändert**.

**Symptom (User):** „Je mehr Terminal-Sessions/Tabs offen sind, desto langsamer wird die App
und desto teurer/hakeliger der Tab-Wechsel; gelegentlich hängt die App ganz."

**Wie diese Audit entstand:** 3 Untersuchungs-Agenten (Tab-Switch, Polling, SSH/PTY-Lifecycle)
→ danach **4 adversariale Prüfer** mit frischem Kontext, die jede Diagnose zu *widerlegen* versuchten
und gezielt nach übersehenen Ursachen suchten. Alle Befunde unten sind per echtem Code (Datei:Zeile)
belegt; die Freeze-These zusätzlich gegen die offizielle Tauri-v2-Doku.

---

## 1. Verifizierte Diagnose (Scorecard)

### Die drei Original-Diagnosen

| # | Diagnose | Verdict | Korrektur nach Re-Audit |
|---|----------|---------|-------------------------|
| 1 | Renderer-Pool Cliff bei `POOL_MAX_SIZE=5` verteuert Tab-Wechsel | ✅ bestätigt, **überzogen** | „synchron" gilt nur für die **Serialize-Hälfte** (Opfer-Scrollback) + WebGL-Teardown. Der **Replay** ist von xterm in 12-ms-Slices per `setTimeout` gechunked, der Repaint per Doppel-`requestAnimationFrame` vertagt → Frame-Jank, kein langer Sync-Block. Der Cliff ist ein **Working-Set-Cliff** (zuletzt besuchte Leaves vs. 5 Slots), **nicht** nach roher Open-Tab-Zahl. |
| 2 | SSH-Polling skaliert; Claude-Stats-Poll ohne Guard | ✅ **voll bestätigt** | Genau **4** `setInterval` in `src/`, kein übersehener N-Timer. #2 (Claude-Stats) skaliert **zeitlich** (Selbst-Aufstauen bei langsamem SSH), nicht mit N. |
| 3 | Sync Tauri-SSH-Commands blockieren Main-Thread ohne Timeout → **Freeze** | ✅ **voll bestätigt** (Tauri-Doku-belegt) | Braucht eine **wedged** Verbindung (das `master_alive`-Vorgate schützt saubere/tote Hosts). `fs_read_*` ist eine **separate, user-aktions-getriggerte** Klasse ohne Gate. Fehlendes Timeout ist **absichtlich** (Pfad geteilt mit langsamen fs-Ops). |

**Load-bearing Fakt (Diagnose 3):** Tauri-v2-Doku wörtlich: *"Commands without the async keyword are
executed on the main thread unless defined with `#[tauri::command(async)]`."* → **ein einziger** hängender
sync-Command friert die gesamte UI ein. Es gibt keinen Worker-Pool, den man erschöpfen müsste — die mildere
„Pool-Erschöpfung"-Alternative wurde **widerlegt**.

### Zwei übersehene Ursachen (neu in der Re-Audit)

| Neu | Impact | Skaliert mit | Mechanismus |
|-----|--------|--------------|-------------|
| **A. O(N) App-Re-Render pro Switch/cd** | **HOCH** | **Open-Tab-Zahl** | `WorkspaceSurface` mountet alle Tabs (Keep-Alive), nicht memoisiert; jeder Wechsel + jedes echte `cd` rendert die ganze `App` neu inkl. O(total-tabs) Filter/Map über **alle 8 Stacks** + Neuberechnung großer `useMemo`-Blöcke. **Das ist vermutlich, was der User als „mehr Tabs → langsamer Wechsel" fühlt**, weil es an der Tab-*Zahl* hängt (der Pool hängt am Working-Set). |
| **B. Keine Hintergrund-PTY-Backpressure** | **MITTEL** | **aktive Sessions** | Flusher-Thread pro PTY streamt Ausgabe an den Main-Thread **unabhängig von Tab-Sichtbarkeit**; `deliverPtyBytes` läuft pro Chunk dort. N laute Agents = ~250·N Main-Thread-Callbacks/s — proportional zur Ausgabe **ALLER** Sessions, nicht nur des sichtbaren Tabs. Kein Leck (Speicher gedeckelt), reine CPU/Main-Thread-Last. |

Kleiner (nachrangig):
- **TabActivityIndicator** (`TabActivityIndicator.tsx:12-16`, gerendert pro Tab in `TabBar.tsx:235`): zustand-Selektor alloziert 2 Arrays + walkt Pane-Baum bei **jeder** Agent-Store-Änderung → O(N_tabs × N_transitions). `Object.is`-Bailout verhindert nur den Re-Render, nicht den Selektor-Lauf.
- **~10 Pref-Subscriptions pro gemountetem Pane** (`useTerminalSession.ts:1007-1048`) → O(N) redundante `applyFontSize`-Aufrufe (`rendererPool.ts:994`) bei Zoom/Pref-Änderung. Kein Steady-State, macht Zoom bei vielen Tabs hakelig.
- **`claude_status_batch_local`** (`claude.rs:635-654`): O(N) Datei-Reads + O(N²) `merge_presence` (`claude.rs:557-579`) pro 3s-Tick. Läuft auf **Worker-Thread**, nicht Main → niedriger Impact.

### Nachweislich SAUBER (kein Handlungsbedarf — Suchfläche ausgeschlossen)

- **Event-Listener-/`listen()`-Leaks:** sauber (Singleton-Guards, cleanup vorhanden).
- **Observer-Akkumulation (Resize/Mutation):** sauber (pro Slot ≤5, disconnect bei dispose).
- **Zombie-Threads/-Prozesse:** sauber (`Session::Drop` killt Child, `drop_session`, Waiter-Reap, `disconnect_all()` bei Exit).
- **Globale Rust-Locks pro Ausgabe:** sauber (`pty_write` nimmt nur kurze `.read()`, klont Arc; pro-Session `writer`-Mutex + `pending`-Condvar; kein Cross-Session-Lock).
- **Persistenz-Hotpath:** sauber (`useSpacePersistence` 3s-Debounce + JSON-Dedup; kein Scrollback persistiert).
- **Memory-Wachstum:** weitgehend sauber (DormantRing 1 MiB/Session, notifications auf 50, Pool reapt auf 1 warm). Einzige Ausnahme: triviale nie-geräumte Sets (`authorizedCwds`, `triggeredTmuxPick`, `installedClaudeHosts`) — vernachlässigbar.

---

## 2. Kausalmodell: 3 Symptome → Ursachen

- **„App hängt ganz"** → Diagnose 3 (sync SSH auf wedged ControlMaster). **Schwerste Ausprägung.**
- **„Wechsel wird teurer mit mehr Tabs"** → **zwei** Treiber:
  (A) O(N) App-Re-Render *[neu, hängt an Tab-Zahl]* + Pool-Opfer-`serialize()`+WebGL-Teardown *[hängt am Working-Set]*.
- **„Alles wird zäh mit vielen Sessions"** → **(B) fehlende Hintergrund-Backpressure** *[neu]* + TabActivityIndicator-Selektor.

---

## 3. Umsetzungsplan (Wellen für `/feature`)

Jede Welle ist ein **kohärenter, isoliert mergebarer + verifizierbarer Increment** (passend zum
`/feature`-Wellen-Loop: implement → Review-Gate → Merge-Gate → Deploy → Verify in derselben Welle).
Reihenfolge = nach Schwere/Hebel. Wellen 1–2 sind risikoarm und liefern den größten Gewinn.

### Welle 1 — P0: Freeze-Fix (SSH/FS-Commands nie den Main-Thread blockieren)

**Ziel:** Aus „App hängt manchmal ganz" ein sauberes „Poll schlägt fehl und wird verworfen" machen,
ohne legitime langsame Remote-Ops abzuschneiden.

**Betroffene Dateien:**
- `src-tauri/src/modules/ssh.rs` — `run_remote_capture` (799–840), `run_remote_json` (659–751), optional `master_alive` (774–792).
- Aufrufer-Commands (sync → async): `tmux_pane_cwd` (`tmux.rs:370`), `claude_status` (`claude.rs:371`), `claude_status_batch` (`claude.rs:610`), `fs_read_dir` (`fs/tree.rs:65`), `fs_read_file` (`fs/file.rs:64`), `fs_canonicalize` (`fs/file.rs:296`), `fs_stat` (`fs/file.rs:310`).
- Registrierung: `lib.rs:349-443` (`invoke_handler`) — `generate_handler` verträgt async, Signatur-Änderung genügt.
- Vorlage: `git/process.rs:239-307` (`run_git_uncached`) — `SharedChild` + Waiter-Thread + `rx.recv_timeout(dur)` + `child.kill()`.

**Ansatz (zweistufig, beides zusammen ergibt den robusten Fix):**
1. **Timeout pro Aufruf** in `run_remote_capture`/`run_remote_json`: neuen Parameter `timeout: Duration`
   (bzw. `Option<Duration>`) einführen und das bare `child.wait()` (`ssh.rs:831` / `:700`) durch das
   Git-Muster ersetzen (`SharedChild` + Waiter + `recv_timeout` + `kill`+`wait` bei Timeout).
   → **Pro-Aufruf-Budget löst den „shared path"-Einwand** (`SshAgentActivityPoller.tsx:34-38`):
   Polls (`tmux_pane_cwd`/`claude_status`/`claude_status_batch`) bekommen ein **kurzes** Budget (z. B. 5–8 s);
   `fs_read_file` (potenziell große Datei) ein **großzügiges** (z. B. 30 s).
2. **Commands async + `spawn_blocking`:** die o. g. Commands zu `pub async fn` machen und die blockierende
   Arbeit in `tauri::async_runtime::spawn_blocking(...).await` kapseln. → Der **Main-Thread bleibt
   responsiv**, selbst wenn ein Aufruf über sein Budget läuft; schlimmster Fall ist ein kurzzeitig
   belegter Blocking-Pool-Thread, der durch den Timeout aus (1) sicher reklamiert wird.

**`crates.io`-Abhängigkeit:** `SharedChild` kommt aus `shared_child` — prüfen, ob schon im
`src-tauri/Cargo.toml` (git nutzt es bereits → wahrscheinlich vorhanden).

**Akzeptanzkriterien (GIVEN/WHEN/THEN):**
- GIVEN eine wedged SSH-Verbindung (Socket lebt, Remote-Kommando hängt), WHEN ein Poll feuert,
  THEN bleibt die UI voll bedienbar (Tastatureingaben/Tab-Wechsel reagieren) und der Poll schlägt
  nach dem Budget mit Fehler fehl statt die App einzufrieren.
- GIVEN ein langsamer, aber gesunder Remote-`fs_read_file` (< großzügiges Budget), WHEN geöffnet,
  THEN wird die Datei geladen (nicht fälschlich abgeschnitten).
- GIVEN ein normaler Poll, THEN unverändertes Verhalten/Latenz.

**Test/Verifikation:**
- Reproduktion des wedged-Zustands: z. B. Remote-Host mit `kill -STOP` auf den tmux-Serverprozess,
  oder eine künstlich hängende Remote-Command-Variante im Dev-Build.
- Bestehende `ssh.rs`-Tests (`master_alive_*`, `run_remote_capture_rejects_unsafe_hosts` ab `:1127`) grün halten.
- Manuell über die **Test-Bridge** (siehe Memory `terax-test-bridge`): App mit SSH-Tab, Verbindung wedgen,
  prüfen dass ⌘-Tab / Eingaben weiter reagieren.

**Risiken/Gotchas:**
- Async-Umstellung ändert die Fehler-/Cancel-Semantik nicht sichtbar, aber alle Aufrufstellen im
  Rust prüfen (werden die Commands intern non-IPC aufgerufen?).
- `master_alive` bleibt sync/lokal-Socket ok; optional ein kurzer Timeout via SharedChild für Robustheit.
- **Kein** globaler Fix-Timeout — bewusst pro-Aufruf, sonst Regression bei langsamen fs-Ops.

---

### Welle 2 — P1: Poll-Hygiene + Hintergrund-Backpressure

Zwei billige, unabhängige, hoch-wirksame Fixes.

**2a — Claude-Stats-Poll Overlap-/hidden-Guard**
- Datei: `src/modules/statusbar/lib/useClaudeStatus.ts` (Interval `:72`, `POLL_MS=2000` `:18`).
- Fix: `inFlight`-Flag (wie tmux-Poll `App.tsx:465-467`) + `document.hidden`-Guard im `poll()`.
- AC: GIVEN SSH-Roundtrip > 2 s, WHEN das Intervall feuert, THEN kein zweiter überlappender `invoke`
  (kein Pile-up); GIVEN Fenster minimiert, THEN kein Poll.

**2b — Hintergrund-PTY-Backpressure** *(neuer Befund)*
- Dateien: `src-tauri/src/modules/pty/session.rs:242-269` (Flusher), `src/modules/terminal/lib/useTerminalSession.ts:522-530` (`deliverPtyBytes`).
- Ziel: Main-Thread-Last soll ~mit der Ausgabe des **sichtbaren** Tabs skalieren, nicht aller Sessions.
- Optionen (in der Umsetzungs-Session entscheiden):
  - (i) Frontend: für Sessions **ohne Slot** (bereits DormantRing) das per-Chunk-`deliverPtyBytes`
    weiter drosseln/coalescen (größere Batches, seltener) — geringstes Risiko, rein additiv.
  - (ii) Rust: Flusher für versteckte Sessions auf ein größeres Coalescing-Fenster umschalten
    (Sichtbarkeits-Hinweis vom Frontend an die Session pushen). Mehr Aufwand, mehr Wirkung.
- AC: GIVEN N laute Hintergrund-Agents, WHEN ein Tab sichtbar ist, THEN bleibt die Main-Thread-Callback-Rate
  im aktiven Tab dominiert (messbar geringere Gesamt-Callback-Rate als heute bei gleicher Ausgabe).
- **Gotcha:** Korrektheit wahren — beim Sichtbarwerden muss der Ring vollständig/korrekt nachgespielt
  werden (kein Ausgabeverlust). DormantRing-Cap (`dormantRing.ts:1`) unverändert lassen.

---

### Welle 3 — P2: Struktureller Re-Render-Fix (O(N) App-Re-Render) *(neuer Befund)*

**Ziel:** Tab-Wechsel + `cd` von der Gesamt-Tab-Zahl entkoppeln.

**Betroffene Dateien:**
- `src/app/components/WorkspaceSurface.tsx` (nicht memoisiert; mountet alle Tabs).
- Stacks: `TerminalStack.tsx:89`, `EditorStack.tsx:94`, `PreviewStack.tsx:67`, `DocStack.tsx:56` (Filter/Map über alle Tabs).
- `src/modules/terminal/PaneTreeView.tsx:39` (nicht memoisiert).
- `src/app/App.tsx` — `shortcutHandlers` (`:892`), `commandPaletteItems` (`:1286`); `setLeafCwd` (`useTabs.ts:1076`).

**Ansatz:**
- Stacks + `PaneTreeView` + `WorkspaceSurface` mit `React.memo` + stabilen Props kapseln.
- Pro-Stack-Filter/Map memoisieren, sodass ein reiner `activeId`-Wechsel nicht O(N) über alle Tabs reconciled.
- Prüfen, ob `activeId` und schnelllebige Werte (`leafCwd`) vom großen `App`-Render entkoppelt werden können
  (z. B. via separatem Context/Store-Selektor statt Prop-Drilling durch die ganze `App`).
- **Nebenschauplatz (optional in dieser Welle):** TabActivityIndicator-Selektor (`TabActivityIndicator.tsx:12`)
  auf stabile/memoisierte Ableitung umstellen, damit nicht pro Agent-Transition N Selektoren allozieren.

**AC:** GIVEN 20 offene Tabs, WHEN zwischen zwei Tabs gewechselt wird, THEN bleibt die React-Commit-Zeit
nahezu konstant (nicht linear mit Tab-Zahl); Messung via React-Profiler vorher/nachher.

**Gotcha:** Die schweren xterm-Blätter (`TerminalPane`) sind bereits `memo` — **nicht** kaputt machen.
PTY-Ausgabe/Keystrokes berühren React-State nicht (verifiziert) — dabei belassen.

---

### Welle 4 — P3 (optional): Renderer-Pool-Tuning

**Niedrigere Priorität als ursprünglich gedacht** — weil der Replay ohnehin gechunkt ist und der Cliff
working-set-basiert. Nur angehen, wenn nach Welle 1–3 der Switch bei großem Working-Set noch hakt.

- `POOL_MAX_SIZE` (`rendererPool.ts:22`) adaptiv/höher (Trade-off: mehr WebGL-Kontexte = mehr GPU-RAM).
- WebGL-Kontext beim Rebind **behalten** statt disposen (`disposeSlotWebgl` `:540` / `scheduleUnhide` `:628-645`).
- Der real dominante Sync-Kostentreiber bleibt: Opfer-`serialize()` (`:506/:725-732`) × Panes — hier
  ggf. `SNAPSHOT_SCROLLBACK_CAP` (`:25`, 5000) senken oder Serialize aus dem Sync-Pfad verlagern.

---

## 4. Cross-cutting: Test- & Mess-Strategie

- **Test-Bridge** (Memory `terax-test-bridge`): dev-only Bridge, um die echte App e2e zu treiben
  (JS-Eval im WebView, Store-Asserts, synthetische Shortcuts). Für Welle 1–3 die primäre e2e-Methode.
- **Vorher/Nachher messen** (gegen „falsche Diagnose"-Risiko):
  - Freeze (W1): wedged-Verbindung, prüfen dass Input weiter reagiert.
  - Backpressure (W2b): Main-Thread-Callback-Rate bei N lauten Agents.
  - Re-Render (W3): React-Profiler-Commit-Zeit pro Switch bei 5 vs. 20 Tabs.
- **Build-Gotchas** (Memory `terax-local-tmux-cwd-follow-fix`): DMG-Bundling flaky, adhoc re-sign nötig,
  Prozessname ist `terax` (lowercase).
- **Feedback-Regel** (Memory `feedback-dont-close-running-app`): die laufende Prod-`Terax.app` des Users
  **nicht** ungefragt schließen, um einen Dev-Build zu starten.

---

## 5. Offene Entscheidungen für die Umsetzungs-Session

1. **Timeout-Budgets** (W1): konkrete Werte für Poll- (5–8 s?) vs. fs-Budget (30 s?) festlegen.
2. **Backpressure-Tiefe** (W2b): Frontend-only (i, risikoarm) oder Rust-Sichtbarkeits-Push (ii, wirksamer)?
3. **W3-Umfang:** nur memoisieren, oder `activeId`/`leafCwd` architektonisch aus dem `App`-Render lösen?
4. **W4 überhaupt?** Erst nach Messung entscheiden.

---

## 6. Referenz: Datei:Zeile-Index (verifiziert)

**Freeze (W1):** `ssh.rs` 659/700/774/799/810/815/831 · `git/process.rs` 239-307 · `tmux.rs` 370/379 ·
`claude.rs` 371/519/610/614/635-654 · `fs/tree.rs` 65 · `fs/file.rs` 64/296/310 · `lib.rs` 349-443
**Polls (W2a):** `App.tsx` 140/465-467/483 · `useClaudeStatus.ts` 18/72 · `SshAgentActivityPoller.tsx` 34-38/39/122-138/163 · `sshAgentPoll.ts` 40 · `AgentMissionControl.tsx` 35/165
**Backpressure (W2b):** `session.rs` 242-269 · `useTerminalSession.ts` 522-530 · `dormantRing.ts` 1
**Re-Render (W3):** `WorkspaceSurface.tsx` · `TerminalStack.tsx` 89 · `EditorStack.tsx` 94 · `PreviewStack.tsx` 67 · `DocStack.tsx` 56 · `PaneTreeView.tsx` 39 · `App.tsx` 892/1286 · `useTabs.ts` 35/1076 · `TabActivityIndicator.tsx` 12-16 · `TabBar.tsx` 235 · `agentStore.ts` 62
**Pool (W4):** `rendererPool.ts` 22/25/443/506/524/540/563/574/628-645/725-732/994 · `useTabs.ts` 35
