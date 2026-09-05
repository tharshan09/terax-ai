# Upstream-Sync crynta → Fork, Runde 3 (Stand 2026-09-05)

Vorgänger: `specs/upstream-sync-0.8.5/` (DONE 2026-07-19). merge-base bleibt `d77476e` (nur Cherry-Picks, kein Merge).
Fork: origin/main `293f8de`, Version 0.8.5. Upstream: `47d3c8b` (2026-09-05), Release **v0.8.6 = 2026-07-27** (Tag zeigt auf `1fdbc50`).

## Lage
- `v0.8.5..upstream/main` = 145 Commits. Bis `5c2f4cd` (2026-07-15) im letzten Sync bewertet → **133 neu**.
- Davon: ~45 test-only, ~25 deps/CI/nix/docs, **~60 substanzielle** (Fixes + Features).
- Bereits gepickt (`-x`): 2930d8e 3f4d680 4d3160d 68caf02 7649926 786ceb5 89e399a a71fcfc ac88362 ae9e690 b23cd00 c1b789b cb75fae ef55e36.
- Voll-Merge weiterhin NICHT sinnvoll (239 fork-eigene Dateien seit merge-base; App.tsx/TabBar/useTabs/rendererPool/settings-store/lib.rs sind Dauer-Konfliktzonen).
- Dry-Run: jeder Kandidat einzeln per `cherry-pick -n` auf main getestet (Ergebnis unten CLEAN/CONFLICT; Konflikte oft nur Test-Dateien/TERAX.md oder Ketten-Abhängigkeit).

## Kandidaten (Upstream-Commits)

### A — kleine Fixes, hoher Nutzen, meist CLEAN → Welle 1
| Commit | Was | Dry-Run |
|---|---|---|
| 4634739 | readline-Remaps (Zeile/Wort/Delete) nur im Normal-Screen → vim/tmux/less bekommen native Keys | CLEAN |
| 70bfbde | fish conda-Prompt-Rekursion | CLEAN |
| c1744ff | Sidebar-Breite über Window-Resize erhalten | CLEAN |
| 9f329a2 | natural sort (numerisch) im File-Tree (tree.rs) | CLEAN |
| e9ba007 (=681d001) | Mod+Shift+Z = Redo auf macOS | CLEAN |
| 921ee2e (=8514332) | kein natives Kontextmenü auf leerer Tab-Bar | CLEAN |
| 44ed574 | minimaler Code-Scrollbar im Editor | CLEAN |
| 9b9342b | Preview: Hinweis bei Cookie-Auth im sandboxed iframe | CLEAN |
| 7707ca6 (=47d3c8b) | Hooks vor conditional return (AiChat) | CLEAN |
| ed3c7e1 | proc-macro dylibs nicht strippen (Release-Build) | CLEAN |
| cf30c25 | Font-Felder im Starter-Theme (nur mit 89c65f0 sinnvoll) | CLEAN |
| 7037d55 | Explorer-Suche: Sidebar-Scroll-Bleed (1 Zeile) | CONFLICT trivial (ExplorerSearch.tsx) |
| 28d7578 | Tab-Close aktiviert nicht mehr den Tab; kein Fokus-Rahmen bei Language-Override | CONFLICT klein (TabBar.tsx) |
| 5477582 | Settings-Fenster auf macOS nicht system-floating (#957) | CONFLICT klein (lib.rs) |
| 5c9083d | Cmd+Q läuft durch Close-Guard (neues app_menu.rs) — **prüfen, ob unser W3-Quit-Guard Cmd+Q schon abfängt** | CONFLICT klein (lib.rs/mod.rs Registrierung) |

### B — Workflow-Features (Tabs/Terminal/Editor) → Welle 2, Handarbeit
| Commit | Was | Dry-Run |
|---|---|---|
| 6af950d | „Close tabs to the right" / „Close others" (+Dialoge) | CONFLICT App.tsx/TabBar/useTabs |
| 40ad56b | Running-process-Close-Bestätigung abschaltbar | CONFLICT CloseDialogs/tabCloseGuards/GeneralSection |
| a975822 | Hidden-files-Toggle ⌘⇧. | CONFLICT App.tsx/shortcuts (+Tests) |
| 4e2f7f7 | Cursor-Style-Setting | CONFLICT settings-store/useTerminalSession/GeneralSection |
| 93b6b24 | konfigurierbare Wrap-Spalte im Editor | CONFLICT settings-store/EditorSection |
| 89c65f0 | Terminal-Font-Overrides per Theme | CONFLICT nur validateTheme.test.ts |
| 1fdbc50 | Svelte-Highlighting | CONFLICT externalFormat.ts/test |
| 40c4c89 | Preview-Tabs für Git-Diffs | CONFLICT useTabs.ts |
| 2e86730 | Explorer-Pfade ins Terminal ziehen | CONFLICT App.tsx/terminal index/rendererPool |

### C — Agents/Notifications (für Claude-Code-Workflow relevant) → Welle 3
| Commit | Was | Dry-Run |
|---|---|---|
| 7639523 | Pi-Agent-Notifications (agent.rs, agent_detect.rs) | CONFLICT TERAX.md/agent.rs (unser claude_settings_path-Shim) |
| 332a0c2 | Agent-Alerts-Liste einklappbar | CONFLICT NotificationBell.tsx (unser Dismiss/Clear-all) |
| e14f7f1 + f675a71 | Notification-Sound + Preference | e14f7f1 CLEAN, f675a71 CONFLICT (notify/route/settings/General) |
| 5f5b216 | Notification-Delivery härten (notificationGate: nur wenn nicht sichtbar/fokussiert) | CONFLICT notify/route/GeneralSection |
| f1b92fc / 81e718c / ae7dd20 | Upstream-Tab-Agent-Status (Icon statt Badge, attention-clear) — **wir haben eigene Impl (PR52)** → wahrscheinlich SKIP, ggf. Ideen übernehmen | CONFLICT agentActivity.ts |

### D — groß / eigenes Projekt / User-Entscheidung
- **Explorer Multi-Select + Batch-Move/Delete** (4bc1c9e 866ec9c 4921464 409f80c a98e1b9 801fe1e 035fcc8; ~2k Zeilen, neues fs/mutate.rs-Batch mit Workspace-Bindung) — nützlich, aber schwer; Security-Review nötig (Pfad-Jail).
- **UI-Redesign** (2825090 c67f021 9fd09f5 66f61a6 fd630a4; floating panes, neuer Default-Theme „graphite", nativer Backdrop) — reine Optik, globals.css/App.tsx/Header Vollkonflikt. Nur wenn gewünscht.
- **CLI Control Plane** (21cbca6 aa65cb1 0ec16d8 + 2dd6361 b3f053b; ~3k Zeilen, Sidecar-Binary, auth. Socket, `terax open <file>` aus dem Terminal, pane-aware) — potenziell sehr nützlich für Terminal-Workflow, aber tief in pty/shell_init/build.rs/release.yml. Eigenes Projekt.
- **Nested Git Repositories** (3d53686, 1.1k) — kollidiert mit unserem SSH-Git-Routing (useSourceControl*). Skip, außer Bedarf.
- **Launch coding agents in split panes** (c1ec0e6 0b5e81b, 900 Zeilen; Header-Menü) — Fork-Konflikte in Header/TabBar/useTabs/settings; Nutzen mittel.
- 3 Upstream-Feature-Branches unmerged: `ui/redesign` (49 ahead), `feat/ghostty-webgpu-terminal` (30 ahead, = PR #1223 26k Zeilen), `feat/cli-control` (69 ahead, ist in main gelandet).

### SKIP
Open-With-Nachzieher a61bce2 (Open-With nicht gesynct) · LSP-Guide fa68ae3 (LSP nicht gesynct) · CJK-IME bd577d8 (565 Zeilen rendererPool; kein Bedarf) · AI-Lane 33cc6aa/tests · Windows 02c0ae9/fd630a4-Mica · Icon f86ba9f · docs/nix/CI-Signing (5676de7 d23e16f) · alle `test(...)`/`build(deps)` (deps stattdessen regenerieren: tauri + cargo group + npm-Gruppen; danach Version 0.8.6 bumpen).

## Offene Upstream-PRs mit Relevanz für uns (macOS, tmux/SSH, Claude Code im Terminal)
Hinweis: unreviewed Community-PRs → bei Übernahme eigenes Review-Gate.
| PR | Was | Warum relevant |
|---|---|---|
| #1010 | flush pending PTY resize on teardown (tmux pane-bleed, #981) | **Top**: wir sind 100 % tmux; Fork-Teardown hat keinen Flush (geprüft) |
| #1119 | Unicode-11-Addon: breite Emoji 2 Zellen (🟢 etc.) | Claude Code/TUIs nutzen Emoji → Zeilen-Shear |
| #1247 | natives Kontextmenü unterdrücken bei Mouse-Tracking | tmux mouse mode / TUIs |
| #1252 | neue Terminal-Tabs sofort fokussieren | tägliche Reibung |
| #1250 | Explorer-cwd auf aktiven Space scopen | wir nutzen Spaces + cwd-follow |
| #1254 | gelöschte Workspace-Verzeichnisse beim Boot heilen | Robustheit |
| #1246 / #1251 / #1249 | Cmd+W im Preview-iframe; Buffer nach git discard neu laden; MD-Links nativ öffnen | kleine Fixes (mydd7-Serie 04.09.) |
| #1217 | macOS Header/Traffic-Lights in Fullscreen | Optik macOS |
| #1215 / #1161 / #956 / #962 | IME-Guard schluckt Navigations-Keys; IME-Punctuation doppelt; Option+Arrow keyCode 229; Keystrokes direkt nach Tab-Open verloren | Input-Zuverlässigkeit |
| #1160 | kitty keyboard protocol (xterm 6.1 beta) → Shift+Enter in TUIs | Claude Code/pi Shift+Enter; aber Beta-xterm |
| #1226 | Shell-Name im Tab statt Username-OSC-Title | Tab-Lesbarkeit unter SSH |
| #1037 / #1091 | GitHub-Style Markdown-Preview; externe Bilder + Math | unser HTML/MD-Preview |
| #926 / #924 / #921 / #1229 | Side-by-side-Diff; Commit-History-Panel; Git-Gutter; Refs im Graph | Git-Lane (Juli, evtl. verwaist) |
| #1223 | libghostty WebGPU-Backend (Draft, 26k) | nur beobachten |

## Empfehlung
Wieder selektive Wellen mit Review-Gate (Playbook wie 0.8.5):
W1 = Block A (15 Commits, fast alles CLEAN) · W2 = Block B nach User-Auswahl · W3 = Block C (Agents) · W4 = deps regenerieren + Version 0.8.6 · W5 optional = PR-Übernahmen (#1010, #1119, #1247, #1252, #1250) mit eigenem Review · D nur auf ausdrücklichen Wunsch.
