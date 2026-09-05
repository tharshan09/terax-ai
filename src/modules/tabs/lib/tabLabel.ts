import { isManagedSession } from "@/modules/terminal/lib/managedTmux";
import { findLeafNode } from "@/modules/terminal/lib/panes";
import type { Tab } from "./useTabs";

/**
 * The label shown on a tab. Non-terminal tabs use their stored title; terminal
 * tabs prefer a user-set custom name, then a bound tmux session, then fall back
 * to the last segment of the cwd. In a split, the FOCUSED pane's session/cwd
 * drives the label (like the window title), so the tab reads as whatever the
 * user is working in right now. Keeping this pure makes the "custom name
 * survives a cd" invariant testable without rendering the bar.
 */
export function labelFor(t: Tab): string {
  if (t.kind === "editor") return t.title;
  if (t.kind === "preview") return t.title;
  if (t.kind === "markdown") return t.title;
  if (t.kind === "html") return t.title;
  if (t.kind === "ai-diff") return t.title;
  if (t.kind === "git-diff") return t.title;
  if (t.kind === "git-history") return t.title;
  if (t.kind === "git-commit-file") return t.title;
  if (t.customTitle) return t.customTitle;
  // A tmux tab's cwd is "~" forever (tmux swallows OSC 7), so surface the
  // session name instead of an indistinguishable "~" for every such tab. A
  // managed restart-safe session's random name is noise, so those keep the
  // cwd-derived label (they are a plain terminal that merely runs in tmux).
  // The focused leaf is the truth. The tab-level session only stands in for a
  // single-pane tab (older persisted shapes); in a split, a plain pane must not
  // borrow a sibling's session name.
  const leaf = findLeafNode(t.paneTree, t.activeLeafId);
  const session =
    leaf?.tmuxSession ??
    (t.paneTree.kind === "leaf" ? t.tmuxSession : undefined);
  if (session && !isManagedSession(session)) return session;
  const cwd = leaf?.cwd ?? t.cwd;
  if (!cwd) return t.title;
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "/";
}
