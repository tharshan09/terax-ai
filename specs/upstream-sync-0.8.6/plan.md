# Plan Upstream-Sync Runde 3 — vom User bestätigt 2026-09-05

Reihenfolge: **W1 → W4 → W3 → W5 → W6**. W2 (Tab/Editor-Features) und Block D (Multi-Select, UI-Redesign, CLI Control Plane, Nested-Git, Agents-in-Panes) GEPARKT.
Methode wie 0.8.5: pro Welle eigener Branch + PR, `cherry-pick -x`, Review-Gate, Gesamt-Gate (check-types, vitest, cargo test, build), Test-Bridge-e2e, Release-Build; Install = User-Gate.

## W1 — kleine Fixes (Block A der discovery.md, 15 Commits)
4634739 70bfbde c1744ff 9f329a2 e9ba007 921ee2e 44ed574 9b9342b 7707ca6 ed3c7e1 cf30c25 (nur wenn 89c65f0 später kommt, sonst weglassen) 7037d55 28d7578 5477582 5c9083d (vorher prüfen: fängt unser W3-Quit-Guard Cmd+Q schon ab?).

## W4 — Deps regenerieren + Version 0.8.6
Cargo (tauri, cargo-group), npm prod/dev-Gruppen; NICHT die dependabot-Commits mergen, sondern `cargo update`/pnpm regenerieren. Version in package.json / Cargo.toml / tauri.conf.json / Cargo.lock auf 0.8.6.

## W3 — Notifications (angepasst, KEIN Pi-Support 7639523)
Kernproblem laut User: 3 Spaces × >10 Sessions (Claude Code), **keine Benachrichtigung** wenn eine Session fertig ist / Frage stellt / Yes-No braucht.
Befund aus route.ts (Stand heute): `if (focused && visible) return;` und OS-Notification **nur wenn Fenster NICHT fokussiert**. Ist Terax fokussiert (Normalfall beim Arbeiten), gibt es nur einen sonner-Toast (~4 s) + Bell-Eintrag → praktisch unsichtbar. Zusätzlich: SSH-Sessions haben keine Hooks (Remote-Hooks geparkt), nur sshAgentPoll.
Schritte:
0. Diagnose in der laufenden App: sind die Sessions lokal oder SSH? Sind Claude-Hooks aktiv (agent_hooks_status)? Kommt `pushNotification` überhaupt an? (Test-Bridge)
1. Pick e14f7f1 + f675a71 (Notification-Sound + Preference), 5f5b216 (Dedupe-Gate 2 s + Test-Button in Settings), 332a0c2 (Bell-Collapse) — Konflikte in notify/route/GeneralSection/NotificationBell von Hand.
2. **Fork-eigen:** Routing so ändern, dass „focused aber Agent nicht sichtbar" auch OS-Notification + Sound auslöst (Preference: „Notify even when Terax is focused"), Toast persistent bis Klick statt 4 s; Space-übergreifend (Tab in anderem Space = nicht sichtbar).
3. Falls SSH-Sessions betroffen: Remote-Hooks-Thema wieder aufmachen (siehe terax-ux-copy-notify Memory) oder sshAgentPoll auf „waiting for input" erweitern.

## W5 — offene Upstream-PRs übernehmen (eigenes Review-Gate, PR-Diffs als Patch)
- #1010 tmux pane-bleed (PTY-Resize-Flush beim Teardown) — JA
- #1119 Emoji-Breite (Unicode-11-Addon) — JA
- #1252 neue Terminal-Tabs sofort fokussieren — JA
- #1226 Shell-Name statt Username im Tab-Titel — JA (vorher prüfen, ob es unter SSH wirklich greift)
- #1250 Explorer-cwd auf aktiven Space scopen — EMPFOHLEN (User hat 3 Spaces), nicht explizit bestätigt
- #1247 Kontextmenü bei Mouse-Tracking — NEIN (User nutzt Trackpad/Claude Code, kein TUI-Rechtsklick-Bedarf)
- #1160 kitty keyboard — NEIN/beobachten (Shift+Enter läuft in Claude Code schon über ESC CR)
- #1254 gelöschte Workspace-Ordner — optional, klein

## W6 — Panes/Tabs-UX (Fork-Feature, eigene Discovery)
User-Wünsche (iTerm-Vorbild):
1. Tab auf einen anderen Tab ziehen → wird dort zum Split-Pane (cross-tab pane move; bereits als Follow-up in terax-feature-ideas notiert).
2. Panes innerhalb eines Splits per Drag umsortieren/tauschen (Upstream d6e3491/460657a „directional pane swapping" per Shortcut wäre Teil-Baustein).
3. Tab-Name folgt dem fokussierten Pane.
Vorhandener Stand prüfen: Pane-Drag&Drop session-preserving (PRs #37–#42), ⌘D/⌘⇧D, ⌘]/⌘[ .
