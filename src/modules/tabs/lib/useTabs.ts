import { basename, titleFromUrl } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useSpaces } from "@/modules/spaces/lib/useSpaces";
import {
  collectManagedSessions,
  newManagedSession,
  removedManagedSessions,
} from "@/modules/terminal/lib/managedTmux";
import {
  attachSubtree,
  countLeaves,
  type DropEdge,
  findLeafNode,
  hasLeaf,
  leafIds,
  moveLeaf,
  nextLeafId,
  type PaneNode,
  removeLeaf,
  type SplitDir,
  sameLayout,
  setLeafCwd as setLeafCwdInTree,
  setLeafTmuxSession as setLeafTmuxSessionInTree,
  siblingLeafOf,
  splitLeaf,
  swapLeaves,
  withLeavesFrom,
} from "@/modules/terminal/lib/panes";
import { killTmuxSession } from "@/modules/terminal/lib/tmux";
import { disposeSession } from "@/modules/terminal/lib/useTerminalSession";
import {
  currentWorkspaceEnv,
  LOCAL_WORKSPACE,
  type WorkspaceEnv,
} from "@/modules/workspace";
import {
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { applyDocView } from "./applyDocView";
import { resolveFileTabOpen } from "./resolveFileTabOpen";
import {
  activeAfterHide,
  appendToSpace,
  applyGapTarget,
  assignToGroup,
  dissolveGroup,
  type GapTarget,
  type GroupState,
  groupFromTab,
  moveGroupAcrossSpaces,
  moveGroupBlock,
  newGroupId,
  normalizeGroupColor,
  normalizeGroupName,
  normalizeGroups,
  removeFromGroup,
  type TabGroup,
  tabForSpaceSwitch,
  visibleTabsInSpace,
  withGroup,
  withoutGroup,
} from "./tabGroups";

// Matches the renderer slot pool size — over this we'd evict an active leaf.
export const MAX_PANES_PER_TAB = 4;

/** Managed tmux session for a new LOCAL terminal when restart-safe mode is on;
 *  undefined otherwise (a plain shell). Only the primary leaf gets one, so a
 *  split pane stays a plain shell (matching the tmux-tab convention). Gated on a
 *  local ambient env: a workspace-less tab spawns on `currentWorkspaceEnv()`, so
 *  minting a managed session while an SSH/WSL env is active would create it on
 *  the remote host, where the local-targeted cleanup could never reach it.
 *  The gate alone is not enough — the ambient env can switch between mint and
 *  MOUNT — so every tab that gets a managed session is also pinned to
 *  `workspace: LOCAL_WORKSPACE` (spawn-env == mint-env, always). */
function managedSessionForNewLocalTab(): string | undefined {
  if (currentWorkspaceEnv().kind !== "local") return undefined;
  return usePreferencesStore.getState().restartSafeSessions
    ? (newManagedSession() ?? undefined)
    : undefined;
}

/** Kill Terax-managed tmux sessions on an explicit tab/pane close so they do
 *  not leak. Managed sessions are always local, so this always targets the
 *  local host, never the ambient SSH env. Idempotent on the backend. */
function killManagedSessions(names: string[]): void {
  for (const name of names) void killTmuxSession(LOCAL_WORKSPACE, name);
}

type TabBase = {
  spaceId: string;
  /** Restored from disk, not yet activated: rendered as a placeholder, not mounted. */
  cold?: boolean;
  /** Group in the same space; absent = loose. */
  groupId?: string;
};

export type TerminalTab = TabBase & {
  id: number;
  kind: "terminal";
  title: string;
  cwd?: string;
  paneTree: PaneNode;
  activeLeafId: number;
  blocks?: boolean;
  /**
   * Execution environment for every pane in this tab. Locked at tab creation
   * (SSH tabs are born remote; local tabs leave it undefined == Local).
   * Switching a tab's env is not a concept — open a new tab instead.
   */
  workspace?: WorkspaceEnv;
  /** tmux session this tab is attached to, if any. Drives the title and marks
   *  the tab as tmux-bound for the session switcher. */
  tmuxSession?: string;
  /** Transient: an SSH tab that should pop the tmux picker once its shell
   *  connects (cleared after the first prompt). Not meant to persist. */
  pickTmuxOnConnect?: boolean;
  /** AI agent cannot read buffer / context of this terminal. */
  private?: boolean;
  /** User-set label that overrides the cwd-derived name. Survives cd. */
  customTitle?: string;
};

export type EditorTab = TabBase & {
  id: number;
  kind: "editor";
  title: string;
  path: string;
  dirty: boolean;
  /** Env the file lives in (e.g. an SSH host), captured when opened. */
  workspace?: WorkspaceEnv;
  /**
   * True while the tab is in the transient "preview" state — opened by a
   * single-click in the explorer and not yet pinned by the user. A preview tab
   * is replaced by the next single-click rather than accumulating.
   */
  preview: boolean;
  overrideLanguage?: string | null;
};

export type PreviewTab = TabBase & {
  id: number;
  kind: "preview";
  title: string;
  url: string;
};

export type MarkdownTab = TabBase & {
  id: number;
  kind: "markdown";
  title: string;
  path: string;
  /**
   * Env the file lives in, captured when opened. A markdown tab opened on an
   * SSH/WSL host must keep reading from that host after the ambient workspace
   * changes, instead of resolving the env at render time.
   */
  workspace?: WorkspaceEnv;
};

export type HtmlTab = TabBase & {
  id: number;
  kind: "html";
  title: string;
  path: string;
  /**
   * Env the file lives in, captured when opened. Drives the render strategy:
   * Local renders via the asset protocol (full fidelity), remote via srcdoc.
   */
  workspace?: WorkspaceEnv;
};

export type AiDiffStatus = "pending" | "approved" | "rejected";

export type AiDiffTab = TabBase & {
  id: number;
  kind: "ai-diff";
  title: string;
  path: string;
  /** "" for newly created files. */
  originalContent: string;
  proposedContent: string;
  /** Tool-call approval id used to resolve the AI SDK approval. */
  approvalId: string;
  status: AiDiffStatus;
  isNewFile: boolean;
};

export type GitDiffTab = TabBase & {
  id: number;
  kind: "git-diff";
  title: string;
  path: string;
  repoRoot: string;
  mode: "-" | "+";
  originalPath: string | null;
};

export type GitHistoryTab = TabBase & {
  id: number;
  kind: "git-history";
  title: string;
  repoRoot: string;
};

export type GitCommitFileDiffTab = TabBase & {
  id: number;
  kind: "git-commit-file";
  title: string;
  repoRoot: string;
  sha: string;
  shortSha: string;
  subject: string;
  path: string;
  originalPath: string | null;
};

export type Tab =
  | TerminalTab
  | EditorTab
  | PreviewTab
  | MarkdownTab
  | HtmlTab
  | AiDiffTab
  | GitDiffTab
  | GitHistoryTab
  | GitCommitFileDiffTab;

export type TabPatch = Partial<{
  title: string;
  cwd: string;
  path: string;
  dirty: boolean;
  url: string;
  /** Empty string resets a terminal tab to its cwd-derived name. */
  customTitle: string;
  overrideLanguage: string | null;
}>;

export const DEFAULT_SPACE_ID = "default";

const NO_GROUPS: TabGroup[] = [];

function gapIndexOf(target: number | GapTarget): number {
  return typeof target === "number" ? target : target.index;
}

// Returns the tab at position `idx` among the visible tabs of the given space,
// or undefined when idx is out of range.
export function pickTabBySpaceIndex(
  tabs: Tab[],
  idx: number,
  spaceId: string,
  groups: TabGroup[] = NO_GROUPS,
): Tab | undefined {
  return visibleTabsInSpace({ tabs, groups }, spaceId)[idx];
}

/** The one place a single tab changes space; it leaves its group on the way. */
export function changeTabSpace(
  tabs: Tab[],
  tabId: number,
  targetSpaceId: string,
): Tab[] {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab || tab.spaceId === targetSpaceId) return tabs;
  const moved = { ...withoutGroup(tab), spaceId: targetSpaceId } as Tab;
  return tabs.map((t) => (t.id === tabId ? moved : t));
}

// Next active after close, scoped to the closing tab's space. null = last tab of
// its space, which callers treat as "refuse to close".
/** Point `tab` at `leafId` and re-derive the tab-level mirror fields from
 *  that leaf: `cwd` (explorer / git follow, subtitles) and `tmuxSession`
 *  (tmux cwd poll target, picker attach-vs-new, persistence). Every mutator
 *  that changes the focused pane goes through here so the mirror never
 *  describes a pane that is not focused. */
export function syncTabToLeaf(tab: TerminalTab, leafId: number): TerminalTab {
  const leaf = findLeafNode(tab.paneTree, leafId);
  const next: TerminalTab = { ...tab, activeLeafId: leafId };
  if (leaf?.cwd !== undefined) next.cwd = leaf.cwd;
  if (leaf?.tmuxSession !== undefined) next.tmuxSession = leaf.tmuxSession;
  else delete next.tmuxSession;
  return next;
}

export type MergeRefusal = "cap" | "incompatible" | "invalid";

/** Why a pane did not become a tab of its own. `collapsed`: the split it came
 *  from closed under the drag (a shell exited, either the pane's own or its
 *  sibling's). `space-changed`: the user switched space while dragging, so the
 *  strip the drop was measured against is no longer the pane's own. */
export type BreakOutRefusal = "collapsed" | "space-changed";

/** What a break-out leaves behind so it can be undone: the pane, the tab it was
 *  born into, and the source tab's layout as it stood. The whole tree, not just
 *  the neighbor it sat against: re-attaching to a neighbor restores the side but
 *  can change the shape (a pane beside a nested split comes back inside it), and
 *  a button labelled Undo may not restructure anything. */
export type BrokenOutPane = {
  tabId: number;
  leafId: number;
  sourceTabId: number;
  prevTree: PaneNode;
  prevActiveLeafId: number;
};

function sameEnv(
  a: WorkspaceEnv | undefined,
  b: WorkspaceEnv | undefined,
): boolean {
  const x = a ?? LOCAL_WORKSPACE;
  const y = b ?? LOCAL_WORKSPACE;
  if (x.kind !== y.kind) return false;
  if (x.kind === "ssh" && y.kind === "ssh") return x.host === y.host;
  if (x.kind === "wsl" && y.kind === "wsl") return x.distro === y.distro;
  return true;
}

/** Panes inherit their tab's workspace / private / blocks semantics, so two
 *  tabs must agree on them before a pane crosses between them. Returns the
 *  narrowed pair when they do, otherwise the refusal. Only `canMergeTabs` needs
 *  it today; the per-pane budget differs, which is why the count is left to the
 *  caller. */
function terminalPair(
  source: Tab | undefined,
  target: Tab | undefined,
): { source: TerminalTab; target: TerminalTab } | MergeRefusal {
  if (source?.kind !== "terminal" || target?.kind !== "terminal")
    return "invalid";
  if (source.id === target.id) return "invalid";
  if (source.blocks || target.blocks) return "incompatible";
  if (Boolean(source.private) !== Boolean(target.private))
    return "incompatible";
  if (!sameEnv(source.workspace, target.workspace)) return "incompatible";
  return { source, target };
}

/** Whether `source` may be merged into `target` as a split. The whole source
 *  tree crosses, so the cap counts both sides. Shared by the tab-strip
 *  hit-test (so an impossible drop is never offered) and the state mutation. */
export function canMergeTabs(
  source: Tab | undefined,
  target: Tab | undefined,
): MergeRefusal | null {
  const pair = terminalPair(source, target);
  if (typeof pair === "string") return pair;
  return countLeaves(pair.source.paneTree) + countLeaves(pair.target.paneTree) >
    MAX_PANES_PER_TAB
    ? "cap"
    : null;
}

/** Place a NEW tab so it sits at `gapIndex` within its own space's strip.
 *  Unlike {@link reorderTabsByGap} the tab is not already in the list, so the
 *  gap needs no correction for a slot it used to occupy. */
export function insertTabAtSpaceGap(
  tabs: Tab[],
  tab: Tab,
  gapIndex: number,
): Tab[] {
  const sameSpace = visibleTabsInSpace(
    { tabs, groups: NO_GROUPS },
    tab.spaceId,
    { all: true },
  );
  const at = Math.max(0, Math.min(gapIndex, sameSpace.length));
  const past = at === sameSpace.length;
  const anchor = past ? sameSpace[at - 1] : sameSpace[at];
  if (!anchor) return [...tabs, tab];
  const idx = tabs.findIndex((t) => t.id === anchor.id);
  const insertAt = past ? idx + 1 : idx;
  return [...tabs.slice(0, insertAt), tab, ...tabs.slice(insertAt)];
}

/** Whether `leafId` names a pane that could become a tab of its own: it exists,
 *  and it is not already alone in its tab (a lone pane IS the tab, so breaking
 *  it out would change nothing). The precondition of
 *  {@link breakOutPaneFromTabs}, separate so a caller can answer it before
 *  spending a tab id on a drop that cannot happen. */
export function canBreakOutPane(tabs: Tab[], leafId: number): boolean {
  const src = tabs.find(
    (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
  );
  return src?.kind === "terminal" && countLeaves(src.paneTree) >= 2;
}

/** Pull `leafId` out of its split into a brand-new tab with id `newTabId`,
 *  placed at the `target` gap in its space's strip. The leaf object moves untouched,
 *  so its PTY and any managed tmux session travel with it: the caller must NOT
 *  dispose it and must NOT reap its managed session (`removedManagedSessions`
 *  compares one tab's tree and would report the still-live pane as gone).
 *  A `GapTarget` is placed with `groups`, so the new tab joins the gap's group;
 *  a bare number counts plain tabs of the space.
 *  Null when the leaf is unknown or already alone in its tab. */
export function breakOutPaneFromTabs(
  tabs: Tab[],
  leafId: number,
  newTabId: number,
  target: number | GapTarget,
  groups?: TabGroup[],
): { tabs: Tab[]; undo: BrokenOutPane } | null {
  const src = tabs.find(
    (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
  );
  if (src?.kind !== "terminal" || !canBreakOutPane(tabs, leafId)) return null;
  const leaf = findLeafNode(src.paneTree, leafId);
  const rest = removeLeaf(src.paneTree, leafId);
  if (!leaf || rest === null) return null;
  // No customTitle: that name belongs to the tab the user named, and there are
  // two tabs now. The new one takes a cwd-derived label like any fresh tab.
  // Nor the title when it IS the source's tmux session name (a tmux tab sets
  // both together): the pane leaving is a plain shell that is not in that
  // session, and labelFor falls back to the title whenever the leaf has no cwd
  // yet. An SSH tab's title is its host, which does still describe the pane.
  const born = syncTabToLeaf(
    {
      id: newTabId,
      kind: "terminal",
      spaceId: src.spaceId,
      title: src.title === src.tmuxSession ? "shell" : src.title,
      paneTree: leaf,
      activeLeafId: leafId,
      ...(src.workspace && { workspace: src.workspace }),
      ...(src.private && { private: true as const }),
      ...(src.blocks && { blocks: true as const }),
    },
    leafId,
  );
  const without = tabs.map((t) =>
    t.id === src.id && t.kind === "terminal"
      ? syncTabToLeaf(
          { ...t, paneTree: rest },
          survivingActive(src, rest, leafId),
        )
      : t,
  );
  const placed =
    groups && typeof target !== "number"
      ? applyGapTarget({ tabs: without, groups }, born, target).tabs
      : insertTabAtSpaceGap(without, born, gapIndexOf(target));
  return {
    tabs: placed,
    undo: {
      tabId: newTabId,
      leafId,
      sourceTabId: src.id,
      prevTree: src.paneTree,
      prevActiveLeafId: src.activeLeafId,
    },
  };
}

/** Put a broken-out pane back exactly where it came from: the source tab gets
 *  its recorded layout again, filled with the leaf objects that are live NOW (a
 *  cwd may have moved on while the toast stood), and the tab the pane was born
 *  into disappears. Nothing is disposed; the leaf simply changes trees again.
 *
 *  Refused when either side has changed shape in the meantime: the new tab grew
 *  panes of its own, or the old tab was split, closed a pane, or had its panes
 *  reordered. Restoring over any of that would undo work the user did after the
 *  drop, which is not what the button promises. */
export function undoBreakOut(
  tabs: Tab[],
  undo: BrokenOutPane,
): Tab[] | MergeRefusal {
  const born = tabs.find((t) => t.id === undo.tabId);
  const src = tabs.find((t) => t.id === undo.sourceTabId);
  if (born?.kind !== "terminal" || src?.kind !== "terminal") return "invalid";
  // The whole layout has to match, not just which panes are where in the list:
  // moving a pane below its neighbor keeps the leaf order but turns a row into
  // a column, and restoring over that would throw the move away.
  if (!sameLayout(born.paneTree, { kind: "leaf", id: undo.leafId }))
    return "invalid";
  const expected = removeLeaf(undo.prevTree, undo.leafId);
  if (expected === null || !sameLayout(src.paneTree, expected))
    return "invalid";
  // Never leave a space without tabs, which closeTab and closeActivePane also
  // refuse to do. Only reachable when the source tab was moved to another space
  // while the toast stood, and the born tab is all its own space has left.
  if (
    src.spaceId !== born.spaceId &&
    visibleTabsInSpace({ tabs, groups: NO_GROUPS }, born.spaceId, {
      all: true,
    }).length === 1
  )
    return "invalid";
  const restored = withLeavesFrom(undo.prevTree, [src.paneTree, born.paneTree]);
  return tabs.flatMap((t) => {
    if (t.id === undo.tabId) return [];
    if (t.id !== undo.sourceTabId || t.kind !== "terminal") return [t];
    return [syncTabToLeaf({ ...t, paneTree: restored }, undo.prevActiveLeafId)];
  });
}

/** Which pane a tab focuses once `leafId` has left it: the closest neighbor of
 *  the departed pane when it was the focused one, otherwise nothing changes. */
function survivingActive(
  tab: TerminalTab,
  rest: PaneNode,
  leafId: number,
): number {
  if (tab.activeLeafId !== leafId) return tab.activeLeafId;
  const remaining = leafIds(rest);
  const sib = siblingLeafOf(tab.paneTree, leafId);
  return sib !== null && remaining.includes(sib) ? sib : remaining[0];
}

/** The space on screen. The store is the authority and answers without the
 *  one-commit lag of `activeSpaceIdRef`, which an effect writes; the ref stands
 *  in only before the store is hydrated, when it holds `null`. */
function visibleSpaceId(fallback: string): string {
  return useSpaces.getState().activeId ?? fallback;
}

/** Next active tab after `closingId` leaves its space: the nearest visible tab
 *  to the left, else to the right; with none visible, the nearest tab of a
 *  collapsed group (left first), whose group then expands. Null only when the
 *  tab is the last of its space. */
export function nextActiveInSpace(
  tabs: Tab[],
  closingId: number,
  groups: TabGroup[] = NO_GROUPS,
): number | null {
  const closing = tabs.find((t) => t.id === closingId);
  if (!closing) return null;
  const state = { tabs, groups };
  const sameSpace = visibleTabsInSpace(state, closing.spaceId, { all: true });
  if (sameSpace.length <= 1) return null;
  const shown = new Set(
    visibleTabsInSpace(state, closing.spaceId).map((t) => t.id),
  );
  const idx = sameSpace.findIndex((t) => t.id === closingId);
  for (let i = idx - 1; i >= 0; i--) {
    if (shown.has(sameSpace[i].id)) return sameSpace[i].id;
  }
  for (let i = idx + 1; i < sameSpace.length; i++) {
    if (shown.has(sameSpace[i].id)) return sameSpace[i].id;
  }
  for (let d = 1; ; d++) {
    const near = sameSpace[idx - d] ?? sameSpace[idx + d];
    if (near) return near.id;
  }
}

// Gap index is relative to the space's own strip, including the dragged tab.
// Tabs that carry a `groupId` need their `groups`, or they come back loose.
export function reorderTabsByGap(
  tabs: Tab[],
  fromId: number,
  toGapIndex: number,
  groups: TabGroup[] = NO_GROUPS,
): Tab[] {
  const moved = tabs.find((t) => t.id === fromId);
  if (!moved) return tabs;
  return applyGapTarget({ tabs, groups }, moved, {
    index: toGapIndex,
    groupId: null,
    onCollapsedHeader: false,
  }).tabs;
}

function coldTerminalTab(
  tabId: number,
  leafId: number,
  spaceId: string,
  cwd?: string,
): TerminalTab {
  return {
    id: tabId,
    kind: "terminal",
    spaceId,
    cold: true,
    title: cwd ? basename(cwd) : "shell",
    cwd,
    paneTree: { kind: "leaf", id: leafId, cwd },
    activeLeafId: leafId,
  };
}

// Plans the removal of a deleted space's tabs while keeping the invariant that
// the now-active `fallbackSpaceId` always has at least one tab (a cold one is
// spawned when it would be left empty). Returns null when nothing to remove.
export function planSpaceRemoval(
  tabs: Tab[],
  currentActiveId: number,
  spaceId: string,
  fallbackSpaceId: string,
  fallbackCwd: string | undefined,
  allocId: () => number,
  groups: TabGroup[] = NO_GROUPS,
): { tabs: Tab[]; disposeLeafIds: number[]; activeId: number } | null {
  const removed = visibleTabsInSpace({ tabs, groups }, spaceId, { all: true });
  if (removed.length === 0) return null;
  const disposeLeafIds = removed
    .filter((t) => t.kind === "terminal")
    .flatMap((t) => leafIds((t as TerminalTab).paneTree));
  const gone = new Set(removed.map((t) => t.id));
  let next = tabs.filter((t) => !gone.has(t.id));
  let activeId = currentActiveId;
  const pick = tabForSpaceSwitch(
    { tabs: next, groups },
    fallbackSpaceId,
    currentActiveId,
  );
  if (pick === null) {
    const tabId = allocId();
    next = [
      ...next,
      coldTerminalTab(tabId, allocId(), fallbackSpaceId, fallbackCwd),
    ];
    activeId = tabId;
  } else if (!next.some((t) => t.id === currentActiveId)) {
    activeId = pick;
  }
  return { tabs: next, disposeLeafIds, activeId };
}

/** Tabs, group metadata and the active tab live in one state, so every update
 *  sees the collapse state that belongs to its tabs. */
type TabsState = GroupState & { activeId: number };

/** The active tab never sits in a collapsed group: its group expands. */
function expandActiveGroup(state: GroupState, activeId: number): TabGroup[] {
  const active = state.tabs.find((t) => t.id === activeId);
  if (active?.groupId === undefined) return state.groups;
  const group = state.groups.find((g) => g.id === active.groupId);
  if (!group?.collapsed) return state.groups;
  return state.groups.map((g) =>
    g === group ? { ...g, collapsed: false } : g,
  );
}

/** Every state change ends here: groups normalized, then the expand rule. */
function settle(prev: TabsState, next: TabsState): TabsState {
  if (next === prev) return prev;
  const ungrouped =
    next.groups.length === 0 && next.tabs.every((t) => t.groupId === undefined);
  const norm = ungrouped ? next : normalizeGroups(next);
  const groups = expandActiveGroup(norm, next.activeId);
  if (
    norm.tabs === prev.tabs &&
    groups === prev.groups &&
    next.activeId === prev.activeId
  )
    return prev;
  return { tabs: norm.tabs, groups, activeId: next.activeId };
}

function via(fn: (s: TabsState) => TabsState) {
  return (prev: TabsState) => settle(prev, fn(prev));
}

function onTabs(fn: (tabs: Tab[]) => Tab[]) {
  return via((s) => {
    const tabs = fn(s.tabs);
    return tabs === s.tabs ? s : { ...s, tabs };
  });
}

function activate(value: SetStateAction<number>) {
  return via((s) => {
    const id = typeof value === "function" ? value(s.activeId) : value;
    return id === s.activeId ? s : { ...s, activeId: id };
  });
}

/** A new terminal tab whose ids are minted once, however often the updater
 *  that places it runs. */
function lazyTerminal(alloc: () => number, cwd: string | undefined) {
  let minted: { tabId: number; leafId: number; tmuxSession?: string } | null =
    null;
  return (spaceId: string, cold: boolean): TerminalTab => {
    minted ??= {
      tabId: alloc(),
      leafId: alloc(),
      tmuxSession: managedSessionForNewLocalTab(),
    };
    const { tabId, leafId, tmuxSession } = minted;
    return {
      id: tabId,
      kind: "terminal",
      spaceId,
      ...(cold && { cold: true }),
      title: cwd ? basename(cwd) : "shell",
      cwd,
      tmuxSession,
      ...(tmuxSession && { workspace: LOCAL_WORKSPACE }),
      paneTree: { kind: "leaf", id: leafId, cwd, tmuxSession },
      activeLeafId: leafId,
    };
  };
}

/** When the active tab just landed in a collapsed group (collapsing it, or a
 *  drop onto its header), the active tab moves on before the expand rule could
 *  undo the collapse; a new terminal when nothing else is visible. */
function keepActiveVisible(
  s: TabsState,
  spawn: (spaceId: string, cold: boolean) => TerminalTab,
): TabsState {
  const active = s.tabs.find((t) => t.id === s.activeId);
  if (active?.groupId === undefined) return s;
  const group = s.groups.find((g) => g.id === active.groupId);
  if (!group?.collapsed) return s;
  const pick = activeAfterHide(s, group.id);
  if (pick !== "new-terminal") return { ...s, activeId: pick };
  const fresh = spawn(group.spaceId, false);
  return { ...s, tabs: appendToSpace(s.tabs, fresh), activeId: fresh.id };
}

function terminalLeaves(tabs: Tab[]): {
  leaves: number[];
  managed: string[];
} {
  const terms = tabs.filter((t): t is TerminalTab => t.kind === "terminal");
  return {
    leaves: terms.flatMap((t) => leafIds(t.paneTree)),
    managed: terms.flatMap((t) => collectManagedSessions(t.paneTree)),
  };
}

export function useTabs(initial?: Partial<TerminalTab>) {
  const [state, setState] = useState<TabsState>(() => {
    const tabId = 1;
    const leafId = 2;
    return {
      tabs: [
        {
          id: tabId,
          kind: "terminal",
          spaceId: DEFAULT_SPACE_ID,
          cold: true,
          title: initial?.title ?? "shell",
          cwd: initial?.cwd,
          paneTree: { kind: "leaf", id: leafId, cwd: initial?.cwd },
          activeLeafId: leafId,
        },
      ],
      groups: NO_GROUPS,
      activeId: tabId,
    };
  });
  const { tabs, groups, activeId } = state;
  // Gates warming until boot resolves the restore, so no shell spawns before it.
  const [booted, setBooted] = useState(false);
  const nextIdRef = useRef(3);
  const activeSpaceIdRef = useRef(DEFAULT_SPACE_ID);
  const tabsRef = useRef(tabs);
  const groupsRef = useRef(groups);
  const activeIdRef = useRef(activeId);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Activating a cold tab warms it: one choke point for every activation path.
  useEffect(() => {
    if (!booted) return;
    setState(
      onTabs((curr) => {
        const t = curr.find((x) => x.id === activeId);
        if (!t?.cold) return curr;
        return curr.map((x) => (x.id === activeId ? { ...x, cold: false } : x));
      }),
    );
  }, [activeId, booted]);

  const setActiveId = useCallback(
    (value: SetStateAction<number>) => setState(activate(value)),
    [],
  );

  const allocId = useCallback(() => nextIdRef.current++, []);

  const markBooted = useCallback(() => setBooted(true), []);

  const setActiveSpaceForNewTabs = useCallback((spaceId: string) => {
    activeSpaceIdRef.current = spaceId;
  }, []);

  const replaceTabs = useCallback(
    (next: Tab[], nextActiveId: number, nextGroups?: TabGroup[]) => {
      if (next.length === 0) return;
      setState(
        via(() => ({
          tabs: next,
          groups: nextGroups ?? NO_GROUPS,
          activeId: nextActiveId,
        })),
      );
    },
    [],
  );

  // Appends a cold terminal tab to a space without stealing focus, so the
  // overview can populate a space in place; it spawns when first opened.
  const newTabInSpace = useCallback((spaceId: string, cwd?: string) => {
    const tab = lazyTerminal(() => nextIdRef.current++, cwd)(spaceId, true);
    setState(onTabs((curr) => [...curr, tab]));
    return tab.id;
  }, []);

  // Reassigns a tab to another space. Returns true when the moved tab was active
  // and emptied its source space, so the caller should follow it into the target.
  const moveTabToSpace = useCallback(
    (tabId: number, targetSpaceId: string): boolean => {
      const curr = tabsRef.current;
      const tab = curr.find((t) => t.id === tabId);
      if (!tab || tab.spaceId === targetSpaceId) return false;
      setState(
        via((s) => {
          const next = changeTabSpace(s.tabs, tabId, targetSpaceId);
          if (next === s.tabs) return s;
          const fallback =
            s.activeId === tabId
              ? nextActiveInSpace(s.tabs, tabId, s.groups)
              : null;
          return { ...s, tabs: next, activeId: fallback ?? s.activeId };
        }),
      );
      return (
        activeIdRef.current === tabId &&
        nextActiveInSpace(curr, tabId, groupsRef.current) === null
      );
    },
    [],
  );

  // Positions a tab next to a target tab, inheriting the target's space and
  // group. Returns true when the active tab crossed into the target space and
  // emptied its source, so the caller should follow it.
  const reorderTab = useCallback(
    (
      tabId: number,
      targetTabId: number,
      edge: "top" | "bottom",
      spawnCwd?: string,
    ): boolean => {
      if (tabId === targetTabId) return false;
      const curr = tabsRef.current;
      const moved = curr.find((t) => t.id === tabId);
      const target = curr.find((t) => t.id === targetTabId);
      if (!moved || !target) return false;
      const crossSpace = moved.spaceId !== target.spaceId;
      const spawn = lazyTerminal(() => nextIdRef.current++, spawnCwd);
      setState(
        via((s) => {
          const from = s.tabs.find((t) => t.id === tabId);
          const onto = s.tabs.find((t) => t.id === targetTabId);
          if (!from || !onto) return s;
          const spaced = changeTabSpace(s.tabs, tabId, onto.spaceId);
          const placed = withGroup(
            spaced.find((t) => t.id === tabId) as Tab,
            onto.groupId,
          );
          const without = spaced.filter((t) => t.id !== tabId);
          let idx = without.findIndex((t) => t.id === targetTabId);
          if (edge === "bottom") idx += 1;
          without.splice(idx, 0, placed);
          const fallback =
            from.spaceId !== onto.spaceId && s.activeId === tabId
              ? nextActiveInSpace(s.tabs, tabId, s.groups)
              : null;
          return keepActiveVisible(
            { ...s, tabs: without, activeId: fallback ?? s.activeId },
            spawn,
          );
        }),
      );
      return (
        crossSpace &&
        activeIdRef.current === tabId &&
        nextActiveInSpace(curr, tabId, groupsRef.current) === null
      );
    },
    [],
  );

  const removeTabsForSpace = useCallback(
    (spaceId: string, fallbackSpaceId: string, fallbackCwd?: string) => {
      let toDispose: number[] = [];
      let managed: string[] = [];
      const minted: number[] = [];
      setState(
        via((s) => {
          let k = 0;
          const alloc = () => {
            if (k === minted.length) minted.push(nextIdRef.current++);
            return minted[k++];
          };
          const plan = planSpaceRemoval(
            s.tabs,
            s.activeId,
            spaceId,
            fallbackSpaceId,
            fallbackCwd,
            alloc,
            s.groups,
          );
          if (!plan) return s;
          toDispose = plan.disposeLeafIds;
          managed = s.tabs
            .filter((t) => !plan.tabs.some((p) => p.id === t.id))
            .flatMap((t) =>
              t.kind === "terminal" ? collectManagedSessions(t.paneTree) : [],
            );
          return { ...s, tabs: plan.tabs, activeId: plan.activeId };
        }),
      );
      for (const lid of toDispose) disposeSession(lid);
      killManagedSessions(managed);
    },
    [],
  );

  const newTab = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    const tmuxSession = managedSessionForNewLocalTab();
    setState(
      onTabs((t) => [
        ...t,
        {
          id: tabId,
          kind: "terminal",
          spaceId: activeSpaceIdRef.current,
          title: "shell",
          cwd,
          // The tab-level binding marks it as a real tmux tab so the session
          // switcher / picker treat it like one (the label stays cwd-derived:
          // labelFor skips managed names). The leaf drives the spawn. The pinned
          // local workspace keeps a later ambient-env switch from spawning the
          // managed session on a remote host.
          tmuxSession,
          ...(tmuxSession && { workspace: LOCAL_WORKSPACE }),
          paneTree: { kind: "leaf", id: leafId, cwd, tmuxSession },
          activeLeafId: leafId,
        },
      ]),
    );
    setState(activate(tabId));
    return tabId;
  }, []);

  const newBlockTab = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    setState(
      onTabs((t) => [
        ...t,
        {
          id: tabId,
          kind: "terminal",
          spaceId: activeSpaceIdRef.current,
          title: "blocks",
          cwd,
          paneTree: { kind: "leaf", id: leafId, cwd },
          activeLeafId: leafId,
          blocks: true,
        },
      ]),
    );
    setState(activate(tabId));
    return tabId;
  }, []);

  // Opens a remote terminal tab bound to an SSH host. The PTY spawns
  // `ssh -tt <host>` locally; the tab carries a `ssh` workspace so the
  // explorer / fs operate on the remote host while it's focused. The cwd is
  // seeded to "~" so the explorer shows the remote home immediately — remote
  // cwd-follow via OSC 7 is unreliable (e.g. a server that auto-starts tmux
  // swallows it), so the explorer doesn't depend on it. The remote helper
  // expands "~" to the real home.
  const newSshTab = useCallback((host: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    const workspace: WorkspaceEnv = { kind: "ssh", host };
    setState(
      onTabs((t) => [
        ...t,
        {
          id: tabId,
          kind: "terminal",
          spaceId: activeSpaceIdRef.current,
          title: host,
          cwd: "~",
          paneTree: { kind: "leaf", id: leafId, cwd: "~" },
          activeLeafId: leafId,
          workspace,
          pickTmuxOnConnect: true,
        },
      ]),
    );
    setState(activate(tabId));
    return tabId;
  }, []);

  // Opens a terminal tab attached to (or creating) a tmux session. Only the
  // initial leaf carries the session, so it alone launches
  // `tmux new-session -A -s <session>`; later splits are plain shells. The tab
  // inherits the current workspace so the session lands on the host the user is
  // already on (the SSH box), not a fresh local shell.
  const newTmuxTab = useCallback(
    (session: string, workspace: WorkspaceEnv = currentWorkspaceEnv()) => {
      const tabId = nextIdRef.current++;
      const leafId = nextIdRef.current++;
      const cwd = workspace.kind === "ssh" ? "~" : undefined;
      setState(
        onTabs((t) => [
          ...t,
          {
            id: tabId,
            kind: "terminal",
            spaceId: activeSpaceIdRef.current,
            title: session,
            cwd,
            paneTree: { kind: "leaf", id: leafId, cwd, tmuxSession: session },
            activeLeafId: leafId,
            workspace,
            tmuxSession: session,
          },
        ]),
      );
      setState(activate(tabId));
      return tabId;
    },
    [],
  );

  // Re-points the active tab (and its focused leaf) at a different tmux session.
  // The live re-attach is driven by reattachLeafTmux; this keeps the tab's
  // binding and title in sync so the switcher and tab strip reflect the change.
  const rebindTmuxSession = useCallback((tabId: number, session: string) => {
    // Deliberately does NOT kill a managed session it switches away from: that
    // session may hold live work (a Claude agent), and surviving detached is
    // exactly the restart-safe promise. Managed sessions are killed only on an
    // explicit tab/pane close, not on a view switch.
    setState(
      onTabs((ts) =>
        ts.map((t) => {
          if (t.id !== tabId || t.kind !== "terminal") return t;
          const paneTree = setLeafTmuxSessionInTree(
            t.paneTree,
            t.activeLeafId,
            session,
          );
          return { ...t, tmuxSession: session, title: session, paneTree };
        }),
      ),
    );
  }, []);

  // Clears the one-shot "pop the tmux picker on connect" flag for an SSH tab
  // once it has fired, so a later `cd` does not re-open the picker.
  const consumeTmuxPick = useCallback((tabId: number) => {
    setState(
      onTabs((ts) =>
        ts.map((t) =>
          t.id === tabId && t.kind === "terminal" && t.pickTmuxOnConnect
            ? { ...t, pickTmuxOnConnect: false }
            : t,
        ),
      ),
    );
  }, []);

  useEffect(() => {
    if (!import.meta.env?.DEV || typeof window === "undefined") return;
    (
      window as unknown as { __teraxNewBlockTab?: (cwd?: string) => number }
    ).__teraxNewBlockTab = newBlockTab;
  }, [newBlockTab]);

  const newAgentTab = useCallback((cwd: string | undefined, title: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    setState(
      onTabs((t) => [
        ...t,
        {
          id: tabId,
          kind: "terminal",
          spaceId: activeSpaceIdRef.current,
          title,
          cwd,
          paneTree: { kind: "leaf", id: leafId, cwd },
          activeLeafId: leafId,
        },
      ]),
    );
    setState(activate(tabId));
    return { tabId, leafId };
  }, []);

  const newPrivateTab = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    setState(
      onTabs((t) => [
        ...t,
        {
          id: tabId,
          kind: "terminal",
          spaceId: activeSpaceIdRef.current,
          title: "private",
          cwd,
          paneTree: { kind: "leaf", id: leafId, cwd },
          activeLeafId: leafId,
          private: true,
        },
      ]),
    );
    setState(activate(tabId));
    return tabId;
  }, []);

  /**
   * Opens a file in an editor tab.
   *
   * - `pin = true` (default) — opens or activates a **persistent** tab.
   *   If the path is currently in the preview slot it is promoted in-place.
   *   Use this for programmatic opens (AI diff, New File dialog, etc.).
   * - `pin = false` — VSCode-style **preview** tab. A single shared slot is
   *   reused: if a persistent tab for the path already exists it is activated;
   *   otherwise the current preview slot is replaced with the new path.
   */
  const openFileTab = useCallback((path: string, pin = true) => {
    let targetId: number | null = null;
    let madeId: number | null = null;
    const spaceId = activeSpaceIdRef.current;
    const workspace = currentWorkspaceEnv();
    setState(
      via((s) => {
        const res = resolveFileTabOpen(s.tabs, path, pin, {
          makeId: () => {
            madeId ??= nextIdRef.current++;
            return madeId;
          },
          spaceId,
          workspace,
          title: basename(path),
        });
        targetId = res.targetId;
        // A replaced preview's slot counts as inside its group, so the new
        // preview is placed right behind that group, loose.
        const slot = s.tabs.findIndex((t) => t.kind === "editor" && t.preview);
        const old = s.tabs[slot];
        const replaced =
          old !== undefined &&
          old.groupId !== undefined &&
          old.id !== res.targetId &&
          res.tabs[slot]?.id === res.targetId &&
          res.tabs[slot].spaceId === old.spaceId;
        const placed = replaced
          ? removeFromGroup(
              {
                tabs: res.tabs.map((t, i) =>
                  i === slot ? withGroup(t, old.groupId) : t,
                ),
                groups: s.groups,
              },
              res.targetId,
            )
          : { tabs: res.tabs, groups: s.groups };
        return { ...placed, activeId: res.targetId };
      }),
    );
    return targetId as number | null;
  }, []);

  /**
   * Promotes a preview tab to a persistent one. Called on double-click of the
   * tab title in the tab bar. Dirty edits also auto-promote (see `updateTab`).
   */
  const pinTab = useCallback((id: number) => {
    setState(
      onTabs((curr) =>
        curr.map((t) =>
          t.id === id && t.kind === "editor" ? { ...t, preview: false } : t,
        ),
      ),
    );
  }, []);

  const openAiDiffTab = useCallback(
    (input: {
      path: string;
      originalContent: string;
      proposedContent: string;
      approvalId: string;
      isNewFile: boolean;
    }) => {
      let targetId: number | null = null;
      setState(
        onTabs((curr) => {
          const existing = curr.find(
            (t) => t.kind === "ai-diff" && t.approvalId === input.approvalId,
          );
          if (existing) {
            targetId = existing.id;
            return curr;
          }
          const id = nextIdRef.current++;
          targetId = id;
          const title = `${basename(input.path)} (AI diff)`;
          return [
            ...curr,
            {
              id,
              kind: "ai-diff",
              spaceId: activeSpaceIdRef.current,
              title,
              path: input.path,
              originalContent: input.originalContent,
              proposedContent: input.proposedContent,
              approvalId: input.approvalId,
              status: "pending",
              isNewFile: input.isNewFile,
            },
          ];
        }),
      );
      if (targetId !== null) setState(activate(targetId));
      return targetId as number | null;
    },
    [],
  );

  const closeAiDiffTab = useCallback((approvalId: string) => {
    setState(
      via((s) => {
        const target = s.tabs.find(
          (t) => t.kind === "ai-diff" && t.approvalId === approvalId,
        );
        if (!target) return s;
        const fallback = nextActiveInSpace(s.tabs, target.id, s.groups);
        if (fallback === null) {
          return {
            ...s,
            tabs: s.tabs.map((t) =>
              t.kind === "ai-diff" && t.approvalId === approvalId
                ? { ...t, status: "approved" as AiDiffStatus }
                : t,
            ),
          };
        }
        return {
          ...s,
          tabs: s.tabs.filter((t) => t.id !== target.id),
          activeId: s.activeId === target.id ? fallback : s.activeId,
        };
      }),
    );
  }, []);

  const newPreviewTab = useCallback((url: string) => {
    const id = nextIdRef.current++;
    setState(
      onTabs((t) => [
        ...t,
        {
          id,
          kind: "preview",
          spaceId: activeSpaceIdRef.current,
          title: titleFromUrl(url),
          url,
        },
      ]),
    );
    setState(activate(id));
    return id;
  }, []);

  const newMarkdownTab = useCallback((path: string) => {
    let targetId: number | null = null;
    setState(
      onTabs((curr) => {
        const existing = curr.find(
          (t) => t.kind === "markdown" && t.path === path,
        );
        if (existing) {
          targetId = existing.id;
          return curr;
        }
        const id = nextIdRef.current++;
        targetId = id;
        return [
          ...curr,
          {
            id,
            kind: "markdown",
            spaceId: activeSpaceIdRef.current,
            title: basename(path),
            path,
            workspace: currentWorkspaceEnv(),
          },
        ];
      }),
    );
    if (targetId !== null) setState(activate(targetId));
    return targetId;
  }, []);

  const newHtmlTab = useCallback((path: string) => {
    let targetId: number | null = null;
    setState(
      onTabs((curr) => {
        const existing = curr.find((t) => t.kind === "html" && t.path === path);
        if (existing) {
          targetId = existing.id;
          return curr;
        }
        const id = nextIdRef.current++;
        targetId = id;
        return [
          ...curr,
          {
            id,
            kind: "html",
            spaceId: activeSpaceIdRef.current,
            title: basename(path),
            path,
            workspace: currentWorkspaceEnv(),
          },
        ];
      }),
    );
    if (targetId !== null) setState(activate(targetId));
    return targetId;
  }, []);

  const setOverrideLanguage = useCallback((id: number, lang: string | null) => {
    setState(
      onTabs((curr) =>
        curr.map((t) => {
          if (t.id !== id || t.kind !== "editor") return t;
          return {
            ...t,
            overrideLanguage: lang,
          };
        }),
      ),
    );
  }, []);

  // Swaps a tab between its rendered doc kind (markdown / html) and a raw
  // editor in place, keeping the same tab id. The toggle UI is shared, so the
  // target kind is derived from the file extension rather than passed in.
  const setDocView = useCallback((id: number, mode: "rendered" | "raw") => {
    setState(onTabs((curr) => curr.map((t) => applyDocView(t, id, mode))));
  }, []);

  const openGitDiffTab = useCallback(
    (input: {
      path: string;
      repoRoot: string;
      mode: "-" | "+";
      originalPath?: string | null;
      title?: string;
    }) => {
      const curr = tabsRef.current;
      const existing = curr.find(
        (t) =>
          t.kind === "git-diff" &&
          t.repoRoot === input.repoRoot &&
          t.path === input.path &&
          t.mode === input.mode,
      );
      const computedTitle =
        input.title ?? `${basename(input.path)} (${input.mode})`;
      const originalPath = input.originalPath ?? null;

      if (existing) {
        const nextTabs = curr.map((t) =>
          t.id === existing.id
            ? { ...t, title: computedTitle, originalPath }
            : t,
        );
        tabsRef.current = nextTabs;
        setState(via((s) => ({ ...s, tabs: nextTabs, activeId: existing.id })));
        return existing.id;
      }

      const id = nextIdRef.current++;
      const nextTabs = [
        ...curr,
        {
          id,
          kind: "git-diff",
          spaceId: activeSpaceIdRef.current,
          title: computedTitle,
          path: input.path,
          repoRoot: input.repoRoot,
          mode: input.mode,
          originalPath,
        } satisfies GitDiffTab,
      ];
      tabsRef.current = nextTabs;
      setState(via((s) => ({ ...s, tabs: nextTabs, activeId: id })));
      return id;
    },
    [],
  );

  const openCommitHistoryTab = useCallback(
    (input: { repoRoot: string; branch?: string | null }) => {
      const curr = tabsRef.current;
      const existing = curr.find(
        (t) => t.kind === "git-history" && t.repoRoot === input.repoRoot,
      );
      const title = input.branch ? `History · ${input.branch}` : "Git History";
      if (existing) {
        const nextTabs = curr.map((t) =>
          t.id === existing.id ? { ...t, title } : t,
        );
        tabsRef.current = nextTabs;
        setState(via((s) => ({ ...s, tabs: nextTabs, activeId: existing.id })));
        return existing.id;
      }
      const id = nextIdRef.current++;
      const nextTabs = [
        ...curr,
        {
          id,
          kind: "git-history",
          spaceId: activeSpaceIdRef.current,
          title,
          repoRoot: input.repoRoot,
        } satisfies GitHistoryTab,
      ];
      tabsRef.current = nextTabs;
      setState(via((s) => ({ ...s, tabs: nextTabs, activeId: id })));
      return id;
    },
    [],
  );

  const openCommitFileDiffTab = useCallback(
    (input: {
      repoRoot: string;
      sha: string;
      shortSha: string;
      subject: string;
      path: string;
      originalPath: string | null;
    }) => {
      const curr = tabsRef.current;
      const existing = curr.find(
        (t) =>
          t.kind === "git-commit-file" &&
          t.repoRoot === input.repoRoot &&
          t.sha === input.sha &&
          t.path === input.path,
      );
      const title = `${basename(input.path)} @ ${input.shortSha}`;
      if (existing) {
        const nextTabs = curr.map((t) =>
          t.id === existing.id
            ? {
                ...t,
                title,
                subject: input.subject,
                originalPath: input.originalPath,
              }
            : t,
        );
        tabsRef.current = nextTabs;
        setState(via((s) => ({ ...s, tabs: nextTabs, activeId: existing.id })));
        return existing.id;
      }
      const id = nextIdRef.current++;
      const nextTabs = [
        ...curr,
        {
          id,
          kind: "git-commit-file",
          spaceId: activeSpaceIdRef.current,
          title,
          repoRoot: input.repoRoot,
          sha: input.sha,
          shortSha: input.shortSha,
          subject: input.subject,
          path: input.path,
          originalPath: input.originalPath,
        } satisfies GitCommitFileDiffTab,
      ];
      tabsRef.current = nextTabs;
      setState(via((s) => ({ ...s, tabs: nextTabs, activeId: id })));
      return id;
    },
    [],
  );

  const closeTab = useCallback((id: number) => {
    let toDispose: number[] = [];
    let managed: string[] = [];
    setState(
      via((s) => {
        const fallback = nextActiveInSpace(s.tabs, id, s.groups);
        if (fallback === null) return s;
        const target = s.tabs.find((t) => t.id === id);
        if (target?.kind === "terminal") {
          toDispose = leafIds(target.paneTree);
          managed = collectManagedSessions(target.paneTree);
        }
        return {
          ...s,
          tabs: s.tabs.filter((t) => t.id !== id),
          activeId: s.activeId === id ? fallback : s.activeId,
        };
      }),
    );
    for (const lid of toDispose) disposeSession(lid);
    killManagedSessions(managed);
  }, []);

  const updateTab = useCallback((id: number, patch: TabPatch) => {
    setState(
      onTabs((t) =>
        t.map((x) => {
          if (x.id !== id) return x;
          if (x.kind === "terminal") {
            return {
              ...x,
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.cwd !== undefined && { cwd: patch.cwd }),
              ...(patch.customTitle !== undefined && {
                customTitle:
                  patch.customTitle === "" ? undefined : patch.customTitle,
              }),
            };
          }
          if (x.kind === "preview") {
            return {
              ...x,
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.url !== undefined && {
                url: patch.url,
                title: patch.title ?? titleFromUrl(patch.url),
              }),
            };
          }
          if (x.kind === "markdown" || x.kind === "html") {
            return {
              ...x,
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.path !== undefined && { path: patch.path }),
            };
          }
          // editor tab: auto-promote from preview the moment the file becomes dirty.
          const autoPin =
            patch.dirty === true && (x as EditorTab).preview
              ? { preview: false }
              : {};
          return {
            ...x,
            ...autoPin,
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.dirty !== undefined && { dirty: patch.dirty }),
            ...(patch.path !== undefined && { path: patch.path }),
            ...(patch.overrideLanguage !== undefined && {
              overrideLanguage: patch.overrideLanguage,
            }),
          };
        }),
      ),
    );
  }, []);

  const selectByIndex = useCallback((idx: number, spaceId?: string) => {
    setState(
      via((s) => {
        const t = spaceId
          ? pickTabBySpaceIndex(s.tabs, idx, spaceId, s.groups)
          : s.tabs[idx];
        return t ? { ...s, activeId: t.id } : s;
      }),
    );
  }, []);

  /** Update a leaf's cwd; mirror to the tab's `cwd` when the leaf is active.
   * Bails out without setTabs when nothing actually changed — shell integration
   * re-emits OSC 7 on every prompt, including empty Enters, so this fires at
   * keystroke rate. Always-setTabs there cascades a paneTree re-render across
   * every open tab. */
  const setLeafCwd = useCallback((leafId: number, cwd: string) => {
    setState(
      onTabs((curr) => {
        let changed = false;
        const next = curr.map((t) => {
          if (t.kind !== "terminal" || !hasLeaf(t.paneTree, leafId)) return t;
          const paneTree = setLeafCwdInTree(t.paneTree, leafId, cwd);
          const isActive = t.activeLeafId === leafId;
          const cwdChanged = isActive && t.cwd !== cwd;
          if (paneTree === t.paneTree && !cwdChanged) return t;
          changed = true;
          return { ...t, paneTree, ...(cwdChanged && { cwd }) };
        });
        return changed ? next : curr;
      }),
    );
  }, []);

  const focusPane = useCallback((tabId: number, leafId: number) => {
    setState(
      onTabs((curr) =>
        curr.map((t) => {
          if (t.id !== tabId || t.kind !== "terminal") return t;
          if (!hasLeaf(t.paneTree, leafId)) return t;
          if (t.activeLeafId === leafId) return t;
          return syncTabToLeaf(t, leafId);
        }),
      ),
    );
  }, []);

  const focusNextPaneInTab = useCallback((tabId: number, delta: 1 | -1) => {
    setState(
      onTabs((curr) =>
        curr.map((t) => {
          if (t.id !== tabId || t.kind !== "terminal") return t;
          const next = nextLeafId(t.paneTree, t.activeLeafId, delta);
          if (next === t.activeLeafId) return t;
          return syncTabToLeaf(t, next);
        }),
      ),
    );
  }, []);

  /** Split the active leaf of `tabId` along `dir`. Returns the new leaf id. */
  const splitActivePane = useCallback(
    (tabId: number, dir: SplitDir): number | null => {
      let newLeafId: number | null = null;
      setState(
        onTabs((curr) =>
          curr.map((t) => {
            if (t.id !== tabId || t.kind !== "terminal" || t.blocks) return t;
            if (leafIds(t.paneTree).length >= MAX_PANES_PER_TAB) return t;
            const splitId = nextIdRef.current++;
            const leafId = nextIdRef.current++;
            newLeafId = leafId;
            const paneTree = splitLeaf(
              t.paneTree,
              t.activeLeafId,
              splitId,
              leafId,
              dir,
              t.cwd,
            );
            return { ...t, paneTree, activeLeafId: leafId };
          }),
        ),
      );
      return newLeafId;
    },
    [],
  );

  // Move an existing pane next to the pane under the drop, on `edge`. Finds the
  // tab holding both leaves; the moved leaf keeps its id so its live session
  // survives the reorder. Pane count is unchanged → no MAX_PANES check.
  const movePane = useCallback(
    (sourceLeafId: number, targetLeafId: number, edge: DropEdge): void => {
      if (sourceLeafId === targetLeafId) return;
      setState(
        onTabs((curr) =>
          curr.map((t) => {
            if (
              t.kind !== "terminal" ||
              !hasLeaf(t.paneTree, sourceLeafId) ||
              !hasLeaf(t.paneTree, targetLeafId)
            )
              return t;
            const newSplitId = nextIdRef.current++;
            const paneTree = moveLeaf(
              t.paneTree,
              sourceLeafId,
              targetLeafId,
              edge,
              newSplitId,
            );
            if (paneTree === t.paneTree) return t;
            return syncTabToLeaf({ ...t, paneTree }, sourceLeafId);
          }),
        ),
      );
    },
    [],
  );

  // Two panes trade places. Count and tab are unchanged, so there is nothing to
  // check against the cap, and swapLeaves rebuilds no split, which is what
  // keeps the sizes the user dragged. The focus goes with the pane that was
  // dragged, as it does for a move.
  const swapPanes = useCallback((a: number, b: number): void => {
    if (a === b) return;
    setState(
      onTabs((curr) =>
        curr.map((t) => {
          // The blocks guard belongs here, next to the code that depends on it:
          // a swapped pane keeps its mount and is handed another leaf, so any
          // React state inside it is positional, and the blocks overlay holds
          // exactly that. splitActivePane already refuses to split a blocks tab,
          // which is why no such pane can be reached today.
          if (
            t.kind !== "terminal" ||
            t.blocks ||
            !hasLeaf(t.paneTree, a) ||
            !hasLeaf(t.paneTree, b)
          )
            return t;
          const paneTree = swapLeaves(t.paneTree, a, b);
          if (paneTree === t.paneTree) return t;
          return syncTabToLeaf({ ...t, paneTree }, a);
        }),
      ),
    );
  }, []);

  // Drop a terminal tab onto another one: its whole pane tree becomes a split
  // next to the target's focused pane and the source tab disappears. Leaf ids
  // (and so PTYs / tmux sessions) move untouched, so nothing is disposed or
  // killed. Refused (false) when the result would exceed the per-tab pane cap
  // or either side is not a terminal tab.
  const mergeTabInto = useCallback(
    (sourceTabId: number, targetTabId: number): MergeRefusal | null => {
      // Validate against the current tabs synchronously so the verdict is
      // reliable (an updater may run later when React has pending work).
      const current = tabsRef.current;
      const refusal = canMergeTabs(
        current.find((t) => t.id === sourceTabId),
        current.find((t) => t.id === targetTabId),
      );
      if (refusal) return refusal;
      const newSplitId = nextIdRef.current++;
      setState(
        via((s) => {
          const source = s.tabs.find((t) => t.id === sourceTabId);
          const target = s.tabs.find((t) => t.id === targetTabId);
          if (canMergeTabs(source, target) !== null) return s;
          if (source?.kind !== "terminal" || target?.kind !== "terminal")
            return s;
          const paneTree = attachSubtree(
            target.paneTree,
            target.activeLeafId,
            source.paneTree,
            "right",
            newSplitId,
          );
          if (paneTree === target.paneTree) return s;
          const tabs = s.tabs
            .filter((t) => t.id !== sourceTabId)
            .map((t) => {
              if (t.id !== targetTabId || t.kind !== "terminal") return t;
              // A live source wakes a still-cold (restored) target.
              const { cold: _cold, ...rest } = t;
              const cold = t.cold && source.cold ? { cold: true } : {};
              return syncTabToLeaf(
                { ...rest, paneTree, ...cold },
                source.activeLeafId,
              );
            });
          return {
            ...s,
            tabs,
            activeId: s.activeId === sourceTabId ? targetTabId : s.activeId,
          };
        }),
      );
      return null;
    },
    [],
  );

  // Both of these are thin: the transition itself is a pure function above, so
  // it can be tested without rendering. Both also have to hand their caller a
  // real answer, because it acts on it (re-keys the pane's agent session and
  // offers an undo), and neither of the obvious ways can carry one: `tabsRef`
  // is refreshed by an effect, so it is a commit behind whatever a PTY event
  // has queued, and React runs an updater eagerly ONLY when nothing is queued,
  // so a verdict set inside one often arrives after the return.
  //
  // `flushSync` settles both at once: the queue is processed here and now, so
  // the transition sees the true previous state and its verdict is available
  // to return. Both gestures are one-off (a drop, a toast button), so the extra
  // synchronous render costs nothing that was not going to happen anyway.
  const breakOutPane = useCallback(
    (
      leafId: number,
      target: number | GapTarget,
    ): BrokenOutPane | BreakOutRefusal => {
      let tabId: number | null = null;
      let result: BrokenOutPane | BreakOutRefusal = "collapsed";
      // Read once, out here: the updater must answer from `prev` alone, or a
      // re-invocation would re-read a store that has moved on and decide
      // differently from the run whose verdict the caller gets.
      const visible = visibleSpaceId(activeSpaceIdRef.current);
      flushSync(() => {
        setState(
          via((s) => {
            const prev = s.tabs;
            const src = prev.find(
              (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
            );
            // The gap was measured against the strip on screen, and the space
            // shortcuts keep working during a drag (the listeners are on the
            // window and never see the keys). If the strip has moved on to
            // another space, it no longer describes where this pane would go.
            // The spaces store answers this exactly; `activeSpaceIdRef` is
            // written by an effect and so lags a switch by a commit, which is
            // precisely the window being guarded. The ref stands in only before
            // the store is hydrated, when it holds `null` and knows nothing.
            // The hit-test suppresses the drop first; this is the backstop.
            if (src && src.spaceId !== visible) {
              result = "space-changed";
              return s;
            }
            // Past every refusal, so none of them burns an id. Cached in the
            // closure rather than taken fresh, so a repeated run of this updater
            // reuses the same id instead of minting another.
            if (!canBreakOutPane(prev, leafId)) return s;
            if (tabId === null) tabId = nextIdRef.current++;
            const born = tabId;
            const out = breakOutPaneFromTabs(
              prev,
              leafId,
              born,
              target,
              s.groups,
            );
            if (!out) return s;
            result = out.undo;
            // Inside the success branch: outside it, a refusal would leave
            // `activeId` naming a tab that was never created. And only when the
            // pane's own tab is the one on screen: the tab shortcuts keep working
            // during a drag as well, and someone who moved on to another tab
            // should not be pulled back by a pane they stopped looking at. A tab
            // born into a collapsed group stays out of sight, so it is not
            // activated either; activating it would expand the group.
            const bornTab = out.tabs.find((t) => t.id === born);
            const hidden =
              bornTab?.groupId !== undefined &&
              s.groups.some((g) => g.id === bornTab.groupId && g.collapsed);
            return {
              ...s,
              tabs: out.tabs,
              activeId: s.activeId === src?.id && !hidden ? born : s.activeId,
            };
          }),
        );
      });
      return result;
    },
    [],
  );

  const undoBreakOutPane = useCallback(
    (undo: BrokenOutPane): MergeRefusal | null => {
      let refusal: MergeRefusal | null = null;
      const visible = visibleSpaceId(activeSpaceIdRef.current);
      flushSync(() => {
        setState(
          via((s) => {
            const next = undoBreakOut(s.tabs, undo);
            if (typeof next === "string") {
              refusal = next;
              return s;
            }
            // Read from the same state as the tabs: an `activeId` that a
            // queued update is about to change is invisible to `activeIdRef`,
            // which an effect writes a commit late, and this flushSync drains
            // that update in the same pass.
            const pick = (active: number): number => {
              // Only when the tab being removed is the one on screen. The pane
              // going home is no reason to pull the user out of a tab they
              // switched to while the toast stood.
              if (active !== undo.tabId) return active;
              const back = next.find((t) => t.id === undo.sourceTabId);
              // Following the pane into another space would be worse than
              // staying, so hand the strip a neighbor instead. The empty-space
              // refusal above means there is one; the source tab is the
              // fallback that keeps `activeId` valid should that ever stop
              // holding.
              if (back?.spaceId === visible) {
                return undo.sourceTabId;
              }
              return (
                nextActiveInSpace(s.tabs, undo.tabId, s.groups) ??
                undo.sourceTabId
              );
            };
            return { ...s, tabs: next, activeId: pick(s.activeId) };
          }),
        );
      });
      return refusal;
    },
    [],
  );

  // Driven by a PTY exit (handleLeafExit), which includes a tmux DETACH: the
  // client exits while the session lives. So this path must NOT kill a managed
  // session (that would defeat restart-safety); an actual `exit` already ended
  // the tmux session, so there is nothing to leak. Explicit user closes
  // (closeTab / closeActivePane) do the killing.
  const closePaneByLeaf = useCallback((leafId: number): void => {
    let didRemove = false;
    setState(
      via((s) => {
        const tab = s.tabs.find(
          (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
        );
        if (tab?.kind !== "terminal") return s;
        const newTree = removeLeaf(tab.paneTree, leafId);
        if (newTree === null) {
          const fallback = nextActiveInSpace(s.tabs, tab.id, s.groups);
          if (fallback === null) return s;
          didRemove = true;
          return {
            ...s,
            tabs: s.tabs.filter((x) => x.id !== tab.id),
            activeId: s.activeId === tab.id ? fallback : s.activeId,
          };
        }
        const remaining = leafIds(newTree);
        let newActive = tab.activeLeafId;
        if (tab.activeLeafId === leafId) {
          const sib = siblingLeafOf(tab.paneTree, leafId);
          newActive = sib && remaining.includes(sib) ? sib : remaining[0];
        }
        didRemove = true;
        return {
          ...s,
          tabs: s.tabs.map((x) =>
            x.id === tab.id && x.kind === "terminal"
              ? syncTabToLeaf({ ...x, paneTree: newTree }, newActive)
              : x,
          ),
        };
      }),
    );
    if (didRemove) disposeSession(leafId);
  }, []);

  const closeActivePane = useCallback((tabId: number): boolean => {
    let closedTab = false;
    let removedLeaf: number | null = null;
    let managed: string[] = [];
    setState(
      via((s) => {
        const t = s.tabs.find((x) => x.id === tabId);
        if (t?.kind !== "terminal") return s;
        const target = t.activeLeafId;
        const newTree = removeLeaf(t.paneTree, target);
        managed = removedManagedSessions(t.paneTree, newTree);
        if (newTree === null) {
          const fallback = nextActiveInSpace(s.tabs, tabId, s.groups);
          if (fallback === null) return s;
          closedTab = true;
          removedLeaf = target;
          return {
            ...s,
            tabs: s.tabs.filter((x) => x.id !== tabId),
            activeId: s.activeId === tabId ? fallback : s.activeId,
          };
        }
        const remaining = leafIds(newTree);
        const sib = siblingLeafOf(t.paneTree, target);
        const newActive = sib && remaining.includes(sib) ? sib : remaining[0];
        removedLeaf = target;
        return {
          ...s,
          tabs: s.tabs.map((x) =>
            x.id === tabId && x.kind === "terminal"
              ? syncTabToLeaf({ ...x, paneTree: newTree }, newActive)
              : x,
          ),
        };
      }),
    );
    if (removedLeaf !== null) {
      disposeSession(removedLeaf);
      killManagedSessions(managed);
    }
    return closedTab;
  }, []);

  const resetWorkspace = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    let toDispose: number[] = [];
    const spaceId = activeSpaceIdRef.current;
    setState(
      via((s) => {
        toDispose = s.tabs.flatMap((t) =>
          t.kind === "terminal" ? leafIds(t.paneTree) : [],
        );
        return {
          tabs: [
            {
              id: tabId,
              kind: "terminal",
              spaceId,
              title: "shell",
              cwd,
              paneTree: { kind: "leaf", id: leafId, cwd },
              activeLeafId: leafId,
            },
          ],
          groups: NO_GROUPS,
          activeId: tabId,
        };
      }),
    );
    for (const lid of toDispose) disposeSession(lid);
  }, []);

  const reorderTabByGap = useCallback(
    (fromId: number, target: GapTarget, spawnCwd?: string) => {
      const spawn = lazyTerminal(() => nextIdRef.current++, spawnCwd);
      setState(
        via((s) => {
          const tab = s.tabs.find((t) => t.id === fromId);
          if (!tab) return s;
          const placed = applyGapTarget(s, tab, target);
          return keepActiveVisible({ ...placed, activeId: s.activeId }, spawn);
        }),
      );
    },
    [],
  );

  // flushSync for the same reason as breakOutPane: the id returned must be
  // the group the updater actually created.
  const createGroupFromTab = useCallback((tabId: number): string | null => {
    const groupId = newGroupId(() => nextIdRef.current++);
    let created: string | null = null;
    flushSync(() => {
      setState(
        via((s) => {
          const next = groupFromTab(s, tabId, groupId);
          created = next === s ? null : groupId;
          return { ...next, activeId: s.activeId };
        }),
      );
    });
    return created;
  }, []);

  const addTabToGroup = useCallback(
    (tabId: number, groupId: string, spawnCwd?: string) => {
      const spawn = lazyTerminal(() => nextIdRef.current++, spawnCwd);
      setState(
        via((s) => {
          const next = assignToGroup(s, tabId, groupId);
          if (next === s) return s;
          return keepActiveVisible({ ...next, activeId: s.activeId }, spawn);
        }),
      );
    },
    [],
  );

  const removeTabFromGroup = useCallback((tabId: number) => {
    setState(
      via((s) => ({ ...removeFromGroup(s, tabId), activeId: s.activeId })),
    );
  }, []);

  const ungroup = useCallback((groupId: string) => {
    setState(
      via((s) => ({ ...dissolveGroup(s, groupId), activeId: s.activeId })),
    );
  }, []);

  const patchGroup = useCallback(
    (groupId: string, patch: Partial<Pick<TabGroup, "name" | "color">>) => {
      setState(
        via((s) => {
          const g = s.groups.find((x) => x.id === groupId);
          if (!g) return s;
          if (
            (patch.name === undefined || patch.name === g.name) &&
            (patch.color === undefined || patch.color === g.color)
          )
            return s;
          return {
            ...s,
            groups: s.groups.map((x) => (x === g ? { ...x, ...patch } : x)),
          };
        }),
      );
    },
    [],
  );

  const renameGroup = useCallback(
    (groupId: string, name: string) =>
      patchGroup(groupId, { name: normalizeGroupName(name) }),
    [patchGroup],
  );

  const setGroupColor = useCallback(
    (groupId: string, color: number) =>
      patchGroup(groupId, { color: normalizeGroupColor(color) }),
    [patchGroup],
  );

  const toggleGroupCollapsed = useCallback(
    (groupId: string, spawnCwd?: string) => {
      const spawn = lazyTerminal(() => nextIdRef.current++, spawnCwd);
      setState(
        via((s) => {
          if (!s.groups.some((g) => g.id === groupId)) return s;
          const groups = s.groups.map((g) =>
            g.id === groupId ? { ...g, collapsed: !g.collapsed } : g,
          );
          return keepActiveVisible({ ...s, groups }, spawn);
        }),
      );
    },
    [],
  );

  const moveGroupByGap = useCallback((groupId: string, target: GapTarget) => {
    setState(
      via((s) => ({
        ...moveGroupBlock(s, groupId, target),
        activeId: s.activeId,
      })),
    );
  }, []);

  // The active space stays: a group never pulls the view along. An emptied
  // source space gets a new terminal, active when the active tab left with
  // the group.
  const moveGroupToSpace = useCallback(
    (groupId: string, targetSpaceId: string, spawnCwd?: string) => {
      if (!useSpaces.getState().spaces.some((sp) => sp.id === targetSpaceId))
        return;
      const spawn = lazyTerminal(() => nextIdRef.current++, spawnCwd);
      setState(
        via((s) => {
          const source = s.groups.find((g) => g.id === groupId)?.spaceId;
          const move = moveGroupAcrossSpaces(
            s,
            groupId,
            targetSpaceId,
            s.activeId,
          );
          if (source === undefined || move.state === s) return s;
          const next: TabsState = { ...move.state, activeId: s.activeId };
          if (move.activeMoved) {
            const pick = activeAfterHide(s, groupId);
            if (pick !== "new-terminal") return { ...next, activeId: pick };
          }
          if (!move.sourceEmptied && !move.activeMoved) return next;
          const fresh = spawn(source, !move.activeMoved);
          return {
            ...next,
            tabs: appendToSpace(next.tabs, fresh),
            activeId: move.activeMoved ? fresh.id : next.activeId,
          };
        }),
      );
    },
    [],
  );

  // Closes every member without asking (the confirmation lives with the
  // caller). A space left empty gets a new terminal first. flushSync so the
  // sessions disposed below are the ones the updater actually removed.
  const closeGroup = useCallback((groupId: string, spawnCwd?: string) => {
    let toDispose: number[] = [];
    let managed: string[] = [];
    const spawn = lazyTerminal(() => nextIdRef.current++, spawnCwd);
    flushSync(() =>
      setState(
        via((s) => {
          const group = s.groups.find((g) => g.id === groupId);
          const members = s.tabs.filter((t) => t.groupId === groupId);
          if (!group || members.length === 0) return s;
          const gone = terminalLeaves(members);
          toDispose = gone.leaves;
          managed = gone.managed;
          const rest = s.tabs.filter((t) => t.groupId !== groupId);
          const activeLeaves = members.some((t) => t.id === s.activeId);
          let activeId = s.activeId;
          if (activeLeaves) {
            const pick = nextActiveInSpace(
              s.tabs.filter(
                (t) => t.groupId !== groupId || t.id === s.activeId,
              ),
              s.activeId,
              s.groups,
            );
            if (pick !== null) activeId = pick;
          }
          const emptied =
            visibleTabsInSpace(
              { tabs: rest, groups: s.groups },
              group.spaceId,
              {
                all: true,
              },
            ).length === 0;
          if (!emptied) return { ...s, tabs: rest, activeId };
          const fresh = spawn(group.spaceId, !activeLeaves);
          return {
            ...s,
            tabs: appendToSpace(rest, fresh),
            activeId: activeLeaves ? fresh.id : activeId,
          };
        }),
      ),
    );
    for (const lid of toDispose) disposeSession(lid);
    killManagedSessions(managed);
  }, []);

  return {
    tabs,
    groups,
    activeId,
    setActiveId,
    allocId,
    replaceTabs,
    moveTabToSpace,
    reorderTab,
    reorderTabByGap,
    createGroupFromTab,
    addTabToGroup,
    removeTabFromGroup,
    ungroup,
    renameGroup,
    setGroupColor,
    toggleGroupCollapsed,
    moveGroupByGap,
    moveGroupToSpace,
    closeGroup,
    newTabInSpace,
    removeTabsForSpace,
    markBooted,
    setActiveSpaceForNewTabs,
    setOverrideLanguage,
    newTab,
    newBlockTab,
    newSshTab,
    newTmuxTab,
    rebindTmuxSession,
    consumeTmuxPick,
    newAgentTab,
    newPrivateTab,
    openFileTab,
    pinTab,
    newPreviewTab,
    newMarkdownTab,
    newHtmlTab,
    setDocView,
    openAiDiffTab,
    openGitDiffTab,
    openCommitHistoryTab,
    openCommitFileDiffTab,
    closeAiDiffTab,
    closeTab,
    updateTab,
    selectByIndex,
    setLeafCwd,
    focusPane,
    focusNextPaneInTab,
    splitActivePane,
    movePane,
    swapPanes,
    mergeTabInto,
    breakOutPane,
    undoBreakOutPane,
    closeActivePane,
    closePaneByLeaf,
    resetWorkspace,
  };
}
