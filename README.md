<div align="center">
  <img src="public/logo.png" width="120" height="120" alt="Terax" />
  <h1>Terax</h1>

  <p><strong>An SSH-native remote workspace.</strong><br/>A personal fork of <a href="https://github.com/crynta/terax-ai">crynta/terax-ai</a> by <a href="https://github.com/tharshan09">@tharshan09</a>.</p>

  <p>
    <a href="https://github.com/crynta/terax-ai"><img src="https://img.shields.io/badge/fork%20of-crynta%2Fterax--ai-blue" alt="fork of crynta/terax-ai" /></a>
    <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey" alt="platform" />
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-green" alt="license" /></a>
    <img src="https://img.shields.io/badge/built%20with-Tauri%202%20%C2%B7%20Rust%20%C2%B7%20React%2019-orange" alt="built with" />
    <img src="https://img.shields.io/badge/bundle-~8%20MB-brightgreen" alt="bundle size" />
  </p>

  <img src="docs/terminal.png" width="100%" alt="Terax terminal" />
</div>

> [!NOTE]
> This fork extends stock Terax to make a remote SSH host a first-class workspace. The additions below ship from source, so [build from source](#build-from-source) to run them. For the base app's full feature tour and prebuilt installers, see [crynta/terax-ai](https://github.com/crynta/terax-ai).

## Why this fork exists

I run my dev environment on remote servers over SSH, inside tmux, and drive almost everything through Claude Code in the terminal.

Stock Terax already speaks SSH: you can open a remote terminal and browse and edit remote files. But everything *around* the terminal stayed local. Source control, the status bar's Claude Code stats, and tmux handling all assumed a local shell, so a remote host was really just another terminal tab.

This fork closes that gap. Source control, Claude Code's live stats, tmux session switching, and cwd-follow all work **over SSH**, exactly like they do locally. The remote box you actually work on behaves like a real workspace, not a tab.

## What's new in this fork

| Addition | What it does |
| --- | --- |
| **Source control over SSH** | The full git panel (status, side-by-side diffs, commit graph, branches, checkout, stage/commit/push) runs on the remote host over a shared SSH connection. Review and commit remote repos without leaving the app. |
| **Claude Code stats over SSH** | Model, context %, cost, and +/- line counts appear in the status bar even when Claude runs in a remote tmux session, not just locally. |
| **tmux session switcher** | A command-palette picker pops up on SSH connect: attach, open-in-new-tab, create, rename, or kill tmux sessions on the host. |
| **cwd-follow under tmux** | The file explorer and source-control panels follow `cd` even on hosts where tmux swallows the shell's `OSC 7` cwd signal. |
| **Search over SSH** | File-name search (explorer) and full-text content search (command palette) both run on the remote host, so they work over SSH exactly like locally. |
| **Per-tab agent activity** | A tab shows a spinner while a coding agent (Claude Code, Codex, Gemini) is working in any of its panes, and a pulsing dot when a pane is waiting for your input. Aggregated across split panes. |
| **Customizable status bar** | Reorderable, toggleable widgets: git branch and ahead/behind, working-tree line changes, workspace env (including the SSH host), and opt-in Claude Code stats. |
| **Two-finger tab swipe** | A native macOS (AppKit) two-finger horizontal swipe to switch between tabs. |

### How the SSH layer works

Transport is the **system `ssh` binary with ControlMaster multiplexing**: no bundled SSH crate, no extra daemon on the host. Hosts come from your `~/.ssh/config`, and auth is **keys or agent only**. Git, tmux, and the remote stat reads all reuse the one multiplexed connection, so they are fast and add no new credentials. The model is *trust-the-host-account*: if your key can reach the host, the app can act as that account there, the same boundary as your own shell.

## Security

Terax owns all OS access in the Rust process; the webview never touches the filesystem, processes, or network directly. This fork hardens every boundary that untrusted input can reach, and locks each invariant with a test.

| Boundary | Hardening |
| --- | --- |
| **Filesystem** | A secret-path deny-list (`.env`, `~/.ssh`, cloud and kube configs, shell rc files, and more) applies on **both read and write** and is never bypassed. Filesystem mutations are jailed to authorized workspace roots, and search/grep only walk those roots. Symlink deception is refused: an innocent-named path that resolves through a leaf *or* parent symlink to a protected target is blocked. |
| **Preview and iframe** | PDF preview is gated on a real `%PDF-` magic-byte check before rendering, so a file that only *looks* like a PDF is never handed to the HTML engine where it could run scripts. Local HTML preview renders in an opaque origin with no reach into the app's asset scope. Theme color values pass an allowlist that rejects `url()` and other fetching or escaping shapes. |
| **AI tool surface** | grep and glob results filter out secret files before they reach the model, and the agent and shell write path denies sensitive directories and shell rc files. Reads of your own secrets from the editor still work; the untrusted agent path does not. |
| **SSH** | Unknown host keys prompt for confirmation instead of silent first-connect trust. Remote path arguments are POSIX-quoted, and remote symlinks resolve via `realpath` before the deny-list check. |
| **Supply chain** | The transitive `dompurify` dependency is pinned to a patched range. The auto-updater, which pointed at the upstream repository, is **removed**: the app never fetches or self-installs code. |

> [!IMPORTANT]
> The trust boundary is the host account, not the app. Anything your shell can do on a host, the app can do there too. The hardening above protects against untrusted *content* (a malicious repo, a crafted file, an agent tool call), not against a host you have chosen to trust with your key.

<details>
<summary><strong>More additions</strong> (markdown, terminal and editor UX, panes, themes)</summary>

- **Markdown and preview** - KaTeX math in both the markdown preview and the AI chat, a raw/rendered HTML preview toggle, and a unified document stack.
- **Terminal and editor UX** - selection-aware native copy/paste (Cmd/Ctrl+C copies a selection, else sends SIGINT), IME fixes, a UI font independent of the terminal font, and opening unrenderable files with the system default app.
- **Cmd+Click file paths** - Cmd/Ctrl+Click a file path in terminal output (for example one an agent just printed) opens it in a tab: HTML and Markdown rendered, `~` expanded, and a `:line` suffix jumps to that line.
- **Pane drag and drop** - reorder split panes by dragging a pane's grab handle onto another pane's edge; the live terminal session moves with it. Plus combinable active/inactive focus styles for split panes.
- **More built-in themes** - One (Atom One), Vesper, and Terminal dark themes, plus a Tokyo Day light variant, on top of the existing set.

</details>

## A look around

The app itself, from upstream: the WebGL terminal, code editor, file explorer, source control with a git graph, the web preview pane, and the bring-your-own-key / local AI side panel.

<table>
  <tr>
    <td width="50%"><img src="docs/editor.png" alt="Code editor" /><br/><sub><strong>Editor</strong> - CodeMirror with language support and inline AI completion.</sub></td>
    <td width="50%"><img src="docs/source-control.png" alt="Source control" /><br/><sub><strong>Source control</strong> - status, diffs, commit graph, branches, over SSH too.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/ai-workflow.png" alt="AI workflow" /><br/><sub><strong>AI side panel</strong> - bring-your-own-key or local models, with tool use.</sub></td>
    <td width="50%"><img src="docs/web-preview.png" alt="Web preview" /><br/><sub><strong>Web preview</strong> - a live preview pane beside the terminal.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/themes.png" alt="Themes" /><br/><sub><strong>Themes</strong> - a large built-in set, plus the fork's additions.</sub></td>
    <td width="50%" valign="middle"><sub>Everything in the base app is documented upstream at <a href="https://github.com/crynta/terax-ai">crynta/terax-ai</a>, including screenshots, the full feature tour, and prebuilt installers.</sub></td>
  </tr>
</table>

## Build from source

This fork ships from source. There are no prebuilt fork releases.

**Prerequisites**
- Rust (stable) - https://rustup.rs
- Node 20+ and [pnpm](https://pnpm.io)
- Tauri prerequisites for your platform - https://tauri.app/start/prerequisites/

**Run**
```bash
pnpm install
pnpm tauri dev          # development
pnpm tauri build        # production bundle (.app + .dmg on macOS)
```

**Checks**
```bash
pnpm lint                                                        # frontend lint
pnpm check-types                                                 # frontend type-check
pnpm test                                                        # frontend tests
cd src-tauri && cargo clippy --all-targets --locked -D warnings  # Rust lint
cd src-tauri && cargo test --locked                              # Rust tests
```

## Credit and license

Built on **[crynta/terax-ai](https://github.com/crynta/terax-ai)** by [@crynta](https://github.com/crynta) and contributors. All the credit for Terax itself goes to them; this fork only adds the SSH-native remote-workspace layer and the security hardening described above.

Licensed under **Apache-2.0**, same as upstream. See [LICENSE](LICENSE).
