import { LOCAL_WORKSPACE } from "@/modules/workspace";
import { findLeafNode, isLeaf, type PaneNode } from "./panes";
import {
  isValidSessionName,
  killTmuxSession,
  listTmuxSessions,
  sanitizeSessionName,
} from "./tmux";

/**
 * Restart-safe local terminals (opt-in). When the preference is on, a new local
 * terminal launches inside a Terax-managed tmux session instead of a bare
 * shell. Because the tmux server is a daemon that outlives Terax, quitting or
 * updating the app detaches the client but leaves the session (and everything
 * running in it, e.g. a Claude Code agent) alive; the persisted session name
 * reattaches on the next launch via the existing tmux spawn path.
 *
 * The managed prefix marks a session as OURS: it is killed on an explicit
 * tab/pane close (so it does not leak), but never on app shutdown, and a user's
 * own tmux tab (Cmd+Shift+M) is left untouched because it lacks the prefix.
 * The installed app uses `terax-rs-`; a side-by-side test build shares the
 * tmux server and gets its own prefix from the Rust side, injected before any
 * page script runs. Without that value nothing counts as ours: a leaked
 * session is better than killing another build's.
 */
const PRODUCTION_PREFIX = "terax-rs-";
const PREFIX_GLOBAL = "__TERAX_MANAGED_TMUX_PREFIX__";
const PREFIX_SHAPE = /^terax-(?:[a-z0-9]+-)?rs-$/;

/** Mirror of `variant::managed_tmux_prefix` (Rust): the managed prefix for a
 *  build's variant suffix, null being the installed app. Both sides are held
 *  to `managedTmuxPrefix.cases.json`. */
export function managedTmuxPrefix(suffix: string | null): string {
  if (suffix === null) return PRODUCTION_PREFIX;
  const clean = suffix.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  // "terax-rs-rs-" would fall inside the installed app's namespace.
  const tag = clean === "" || clean === "rs" ? "variant" : clean;
  return `terax-${tag}-rs-`;
}

/** This build's managed prefix, or null when it was not handed over. */
export function currentManagedPrefix(): string | null {
  const value: unknown = Reflect.get(globalThis, PREFIX_GLOBAL);
  return typeof value === "string" && PREFIX_SHAPE.test(value) ? value : null;
}

/** Prefixes a user may not name a session into: ours, and the installed
 *  app's, whose cleanup would otherwise kill it. */
function reservedPrefixes(own: string | null): string[] {
  return own === null || own === PRODUCTION_PREFIX
    ? [PRODUCTION_PREFIX]
    : [own, PRODUCTION_PREFIX];
}

export function isReservedSessionName(
  name: string,
  own: string | null = currentManagedPrefix(),
): boolean {
  return reservedPrefixes(own).some((p) => name.startsWith(p));
}

/** Why the name the user typed for a NEW session cannot be used, or null when
 *  it can. Sanitizing runs first, so "my app" is accepted and becomes "my-app";
 *  only input that survives as nothing, or that lands in a reserved prefix,
 *  is refused. The prefix is reserved because a user session named into it
 *  would be picked up by the managed-session cleanup and killed with its tab. */
export function newSessionNameError(input: string): string | null {
  const name = sanitizeSessionName(input);
  // One check, not two: sanitizing already drops everything outside the
  // allowlist, so the only way past it is input that survives as nothing.
  if (!isValidSessionName(name)) {
    return "Enter a name using letters, digits, - or _.";
  }
  if (isReservedSessionName(name)) {
    return "That prefix is reserved for Terax sessions.";
  }
  return null;
}

export function isManagedSession(
  name: string | null | undefined,
  prefix: string | null = currentManagedPrefix(),
): name is string {
  return prefix !== null && typeof name === "string" && name.startsWith(prefix);
}

/** A fresh, unique managed session name, or null when this build does not
 *  know its prefix (the tab then opens a plain shell). The random suffix is
 *  persisted with the leaf, so it is stable across restarts (that is what
 *  makes the reattach land on the same session). `rand` is injectable for
 *  deterministic tests. */
export function newManagedSession(
  rand: () => string = defaultRand,
  prefix: string | null = currentManagedPrefix(),
): string | null {
  return prefix === null ? null : prefix + rand();
}

function defaultRand(): string {
  // tmux session names allow [A-Za-z0-9_-]; a hex slice stays valid and unique.
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  // Fallback for a context without crypto.randomUUID: uniqueness (not secrecy)
  // is all we need, and the output stays within the tmux-name charset.
  return (Date.now().toString(36) + Math.random().toString(36).slice(2)).slice(
    0,
    12,
  );
}

/** The managed session name of a tab's active leaf, or null when that leaf is a
 *  plain shell. Drives the restart-safe badge in the status bar. */
export function activeManagedSession(
  tree: PaneNode,
  activeLeafId: number,
): string | null {
  const leaf = findLeafNode(tree, activeLeafId);
  return isManagedSession(leaf?.tmuxSession) ? leaf.tmuxSession : null;
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

/** The managed sessions in `existing` that no restored leaf references: dead
 *  weight from a path that unbound a session without killing it (picker
 *  switch-away, workspace switch, an in-pane `Ctrl-b d` detach). Pure core of
 *  the boot reaper. */
export function orphanedManagedSessions(
  existing: readonly string[],
  referenced: ReadonlySet<string>,
  prefix: string | null = currentManagedPrefix(),
): string[] {
  return existing.filter(
    (s) => isManagedSession(s, prefix) && !referenced.has(s),
  );
}

/** Kill every LOCAL managed tmux session that no restored tab references.
 *  Runs once at boot, after spaces hydration: whatever legitimately survives a
 *  restart is exactly the set of sessions the restored pane trees still name,
 *  so anything else with our prefix is a leak — one sweep covers every orphan
 *  path without ever racing a live, still-referenced agent. A user's own tmux
 *  sessions never match the prefix, and neither do another build's. Errors
 *  are swallowed: no tmux installed (or none running) simply means nothing to
 *  reap. */
export async function reapOrphanedManagedSessions(
  referenced: ReadonlySet<string>,
): Promise<void> {
  const prefix = currentManagedPrefix();
  if (prefix === null) return;
  let names: string[];
  try {
    names = (await listTmuxSessions(LOCAL_WORKSPACE)).map((s) => s.name);
  } catch {
    return;
  }
  for (const name of orphanedManagedSessions(names, referenced, prefix)) {
    void killTmuxSession(LOCAL_WORKSPACE, name).catch((e) =>
      console.error("[terax] managed session reap failed:", e),
    );
  }
}
