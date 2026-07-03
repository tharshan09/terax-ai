import { isLeaf, type PaneNode } from "./panes";

/**
 * Restart-safe local terminals (opt-in). When the preference is on, a new local
 * terminal launches inside a Terax-managed tmux session instead of a bare
 * shell. Because the tmux server is a daemon that outlives Terax, quitting or
 * updating the app detaches the client but leaves the session (and everything
 * running in it, e.g. a Claude Code agent) alive; the persisted session name
 * reattaches on the next launch via the existing tmux spawn path.
 *
 * The `terax-rs-` prefix marks a session as OURS: it is killed on an explicit
 * tab/pane close (so it does not leak), but never on app shutdown, and a user's
 * own tmux tab (Cmd+Shift+M) is left untouched because it lacks the prefix.
 */
const MANAGED_PREFIX = "terax-rs-";

export function isManagedSession(
  name: string | null | undefined,
): name is string {
  return typeof name === "string" && name.startsWith(MANAGED_PREFIX);
}

/** A fresh, unique managed session name. The random suffix is persisted with
 *  the leaf, so it is stable across restarts (that is what makes the reattach
 *  land on the same session). `rand` is injectable for deterministic tests. */
export function newManagedSession(rand: () => string = defaultRand): string {
  return MANAGED_PREFIX + rand();
}

function defaultRand(): string {
  // tmux session names allow [A-Za-z0-9_-]; a hex slice stays valid and unique.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

/** Managed session names anywhere in a pane subtree, for leak-safe cleanup when
 *  the user explicitly closes the tab/pane that owns them. */
export function collectManagedSessions(node: PaneNode): string[] {
  const out: string[] = [];
  walk(node, out);
  return out;
}

function walk(node: PaneNode, out: string[]): void {
  if (isLeaf(node)) {
    if (isManagedSession(node.tmuxSession)) out.push(node.tmuxSession);
    return;
  }
  for (const child of node.children) walk(child, out);
}

/** Managed sessions in `before` that are gone from `after` (a null `after`
 *  means the whole subtree was removed). Lets a pane close kill exactly the
 *  sessions it removed while leaving the ones that survive in sibling panes. */
export function removedManagedSessions(
  before: PaneNode,
  after: PaneNode | null,
): string[] {
  const remaining = new Set(after ? collectManagedSessions(after) : []);
  return collectManagedSessions(before).filter((s) => !remaining.has(s));
}
