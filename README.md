<div align="center">
  <img src="public/logo.png" width="128" height="128" alt="Terax" />
  <h1>Terax</h1>

  <p><strong>A personal fork by <a href="https://github.com/tharshan09">@tharshan09</a>: an SSH-native remote workspace.</strong></p>

  <p>
    <a href="https://github.com/crynta/terax-ai"><img src="https://img.shields.io/badge/fork%20of-crynta%2Fterax--ai-blue" alt="fork of crynta/terax-ai" /></a>
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="platform" />
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" /></a>
    <img src="https://img.shields.io/badge/built%20with-Tauri%202%20%C2%B7%20Rust%20%C2%B7%20React%2019-orange" alt="built with" />
  </p>
</div>

---

> **A fork of [crynta/terax-ai](https://github.com/crynta/terax-ai)**: the same lightweight Tauri + Rust + React terminal-first dev workspace, extended to make a remote SSH host a *first-class* workspace. The additions below ship from this fork's source, so [build from source](#build-from-source) to run them.

## Why I built this

I run my dev environment on remote servers over SSH, inside tmux, and I drive almost everything through Claude Code in the terminal.

Stock Terax already speaks SSH: you can open a remote terminal and browse and edit remote files. But everything *around* the terminal stayed local: source control, the status bar's Claude Code stats, tmux session handling. A remote host was, in effect, just another terminal tab.

This fork closes that gap. Source control, Claude Code's live stats, tmux session switching and cwd-follow all work **over SSH**, exactly like they do locally, so the remote box I actually work on behaves like a real workspace, not a tab. And because most of my terminals just run coding agents these days, the fork also keeps track of them: every Claude Code session across local tabs and SSH hosts shows up in one Mission Control overview, agents can notify you when they finish or need input, and local terminals can opt into tmux-backed sessions that survive app restarts. If you also live on a remote server in tmux and run Claude Code in the terminal, this fork is built for your setup.

## What's different from upstream

| Addition | What it does |
| --- | --- |
| **Source control over SSH** | The full git panel (status, side-by-side diffs, commit graph, branches, checkout, stage/commit/push) runs on the remote host over a shared SSH connection. Review and commit remote repos without leaving the app. |
| **Paste and drop files over SSH** | Cmd+V in the explorer pastes files and folders copied in the Finder, and a Finder drop copies them, into a local folder or onto the SSH host. Names clash Finder-style (`a copy.txt`), nothing is overwritten, and an interrupted copy never shows up half-written. |
| **Images over SSH** | The image preview reads remote images through the SSH connection instead of looking the path up on your Mac. Secret paths such as `~/.ssh` stay refused, also through symlinks. |
| **Search over SSH** | Both file-name search (explorer) and full-text content search (command palette) run on the remote host, so they work over SSH exactly like locally. |
| **Claude Code stats over SSH** | Model, context %, cost and +/- line counts appear in the status bar even when Claude runs in a remote tmux session, not just locally. |
| **Keepalive and reconnect** | SSH tabs no longer close on idle; a dropped connection offers "Press Enter to reconnect" in the same tab. |
| **Agent Mission Control** | One overview (`Mod+Shift+G`) of every running coding agent across all tabs and hosts, grouped by *needs input / working / idle*, filterable; Enter jumps to the agent's tab. `Mod+Shift+A` cycles through agents waiting for input. |
| **Agent activity in tmux, local and SSH** | tmux swallows the terminal markers agent detection relies on, so agents inside tmux used to be invisible. A per-host batched poll (Claude's statusLine stats plus the pane's foreground command) restores the tab spinner and keeps even an *idle* Claude listed, in local tmux tabs and on remote hosts alike. |
| **Agent notifications** | Claude Code, Codex and Gemini can notify you when they finish or wait for input, also from inside tmux and on SSH hosts (hooks write their own marker to the pane). Focus and finish preferences, plus clear-all and per-row dismiss in the notification list. |
| **Restart-safe sessions** | Opt-in: new local terminals run inside a Terax-managed tmux session, so whatever runs there (say, a long-running agent) survives quitting or updating the app. Tabs reattach on the next launch, marked by a status-bar badge. A boot-time reaper kills leaked sessions; your own tmux sessions are never touched. |
| **tmux session switcher** | A command-palette picker pops up on SSH connect (and locally on `Cmd+Shift+M`): attach, open in a new tab, create, rename or kill tmux sessions, also with very long session names. |
| **cwd-follow under tmux** | The file explorer and source-control panels follow `cd` even where tmux swallows the shell's `OSC 7` cwd signal, locally and over SSH. |
| **Customizable status bar** | Reorderable, toggleable widgets: git branch and ahead/behind, working-tree line changes, workspace env (incl. the SSH host), and opt-in Claude Code stats. |
| **Panes and tabs** | Split panes with combinable active/inactive focus styles and optional pane headers. Drag a pane onto another pane's edge to reorder, into its middle to trade places, or onto the tab strip to give it its own tab; the live terminal session moves with it. Tabs can be merged and renamed. |
| **Two-finger trackpad tab-swipe** | A native macOS (AppKit) two-finger horizontal swipe to switch between tabs. |

### How the SSH features work

Transport is the **system `ssh` binary with ControlMaster multiplexing**: no bundled SSH crate, no extra daemon on the host. Hosts come from your `~/.ssh/config`; auth is **keys/agent only**. Git, tmux, file copies and the remote stat reads all reuse the one multiplexed connection, so they are fast and add no new credentials. The model is *trust-the-host-account*: if your key can reach the host, the app can act as that account there, the same boundary as your own shell.

## Other additions

- **Security hardening**: host-key prompting (no silent first-connect trust), workspace-jailed filesystem mutations, a secret-path deny-list on every read and write, tightened iframe/asset scope, an OSC 52 clipboard-write policy, and an "open with default app" executable guard, each covered by tests.
- **Markdown and preview**: KaTeX math in both the markdown preview and the AI chat, a raw/rendered HTML preview toggle, and a unified document stack. Video and audio previews pause while their tab or the window is hidden.
- **Terminal and editor UX**: selection-aware native copy/paste (Cmd/Ctrl+C copies a selection, else sends SIGINT), copy from remote tmux via OSC 52 with honest feedback, IME fixes, a UI font independent of the terminal font, and opening unrenderable files with the system default app.
- **Cmd+Click file paths**: Cmd/Ctrl+Click a file path in terminal output (e.g. one an agent just printed) opens it in a tab: HTML/Markdown rendered, `~` expanded, a `:line` suffix jumps to that line.
- **Build info**: the About tab shows the git commit and date of the running build; the updater (which pointed at upstream releases) is disabled.
- **More built-in themes**: One (Atom One), Vesper and Terminal dark themes, plus a Tokyo Day light variant, on top of the existing set.

## Upstream base

Terax itself (the WebGL terminal, the code editor, the file explorer, source control with a git graph, the web preview pane, and the BYOK / local AI side-panel) is documented upstream. See **[crynta/terax-ai](https://github.com/crynta/terax-ai)** for the full feature tour, screenshots, and prebuilt installers.

This fork is synced with upstream **v0.9.0 without the new Ghostty terminal** (fork version 0.8.7): the SSRF-hardened AI proxy, stepped animations that pause while the window is hidden, watchers and git status only for what is on screen, a lazily loaded icon set with a budget on the built startup bundle, and dependencies on the v0.9.0 level. The Ghostty terminal is parked until its macOS issues are resolved upstream.

## Build from source

This fork ships from source; there are no prebuilt fork releases.

**Prerequisites**
- Rust (stable): https://rustup.rs
- Node 20+ and [pnpm](https://pnpm.io)
- Tauri prerequisites for your platform: https://tauri.app/start/prerequisites/

**Run**
```bash
pnpm install
pnpm tauri dev          # development
pnpm tauri build        # production bundle
```

**Checks**
```bash
pnpm lint && pnpm check-types && pnpm test                         # frontend
cd src-tauri && cargo clippy --all-targets --locked -- -D warnings # Rust lint
cd src-tauri && cargo test --locked                                # Rust tests
```

## Credit & license

Built on **[crynta/terax-ai](https://github.com/crynta/terax-ai)** by [@crynta](https://github.com/crynta) and contributors; all the credit for Terax itself goes to them. This fork only adds the SSH-native remote-workspace layer described above.

Licensed under **Apache-2.0**, same as upstream. See [LICENSE](LICENSE).
