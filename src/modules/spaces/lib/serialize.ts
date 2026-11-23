import {
  isLeaf,
  type PaneNode,
  type SplitDir,
} from "@/modules/terminal/lib/panes";
import { basename, titleFromUrl } from "@/lib/utils";
import type {
  EditorTab,
  HtmlTab,
  MarkdownTab,
  PreviewTab,
  Tab,
  TerminalTab,
} from "@/modules/tabs/lib/useTabs";
import {
  collectManagedSessions,
  isManagedSession,
} from "@/modules/terminal/lib/managedTmux";
import {
  type GroupState,
  newGroupId,
  normalizeGroups,
  type TabGroup,
} from "@/modules/tabs/lib/tabGroups";
import { LOCAL_WORKSPACE, type WorkspaceEnv } from "@/modules/workspace";
import type { SpaceState } from "./store";
import { readGroupEntries, readGroupRef } from "./validate";

export type SerializedNode =
  | { kind: "leaf"; cwd?: string; active?: boolean; tmuxSession?: string }
  | { kind: "split"; dir: SplitDir; children: SerializedNode[] };

export type SerializedTab = (
  | {
      kind: "terminal";
      tree: SerializedNode;
      blocks?: boolean;
      customTitle?: string;
      /** Remote env (SSH/WSL) so a restored tab keeps its identity instead of
       *  silently respawning/reading on the LOCAL machine. Absent == Local. */
      workspace?: WorkspaceEnv;
      /** tmux session this tab is attached to, so a restored tab re-attaches
       *  (`tmux new-session -A`) instead of respawning a plain shell. */
      tmuxSession?: string;
    }
  | { kind: "editor"; path: string; workspace?: WorkspaceEnv }
  | { kind: "preview"; url: string }
  | { kind: "markdown"; path: string; workspace?: WorkspaceEnv }
  | { kind: "html"; path: string; workspace?: WorkspaceEnv }
) & {
  /** Position in the space's `groups`. Absent == loose. */
  group?: number;
};

export type SerializedGroup = {
  name?: string;
  color: number;
  collapsed?: boolean;
};

// Only non-local envs need to survive a reload; Local is the default, so we
// keep the serialized state minimal by omitting it.
function persistableWorkspace(
  ws: WorkspaceEnv | undefined,
): WorkspaceEnv | undefined {
  return ws && ws.kind !== "local" ? ws : undefined;
}

function serializeNode(node: PaneNode, activeLeafId: number): SerializedNode {
  if (isLeaf(node)) {
    return {
      kind: "leaf",
      ...(node.cwd !== undefined && { cwd: node.cwd }),
      ...(node.id === activeLeafId && { active: true }),
      ...(node.tmuxSession !== undefined && { tmuxSession: node.tmuxSession }),
    };
  }
  return {
    kind: "split",
    dir: node.dir,
    children: node.children.map((c) => serializeNode(c, activeLeafId)),
  };
}

export function isSerializableTab(tab: Tab): boolean {
  switch (tab.kind) {
    case "terminal":
      return !tab.private;
    case "editor":
    case "preview":
    case "markdown":
    case "html":
      return true;
    default:
      return false;
  }
}

function serializeTab(tab: Tab): SerializedTab | null {
  if (!isSerializableTab(tab)) return null;
  switch (tab.kind) {
    case "terminal": {
      const ws = persistableWorkspace(tab.workspace);
      return {
        kind: "terminal",
        tree: serializeNode(tab.paneTree, tab.activeLeafId),
        ...(tab.blocks && { blocks: true }),
        ...(tab.customTitle !== undefined && { customTitle: tab.customTitle }),
        ...(ws && { workspace: ws }),
        ...(tab.tmuxSession !== undefined && { tmuxSession: tab.tmuxSession }),
      };
    }
    case "editor": {
      const ws = persistableWorkspace(tab.workspace);
      return { kind: "editor", path: tab.path, ...(ws && { workspace: ws }) };
    }
    case "preview":
      return { kind: "preview", url: tab.url };
    case "markdown": {
      const ws = persistableWorkspace(tab.workspace);
      return { kind: "markdown", path: tab.path, ...(ws && { workspace: ws }) };
    }
    case "html": {
      const ws = persistableWorkspace(tab.workspace);
      return { kind: "html", path: tab.path, ...(ws && { workspace: ws }) };
    }
    default:
      return null;
  }
}

export function serializeTabs(tabs: Tab[]): SerializedTab[] {
  const out: SerializedTab[] = [];
  for (const tab of tabs) {
    const s = serializeTab(tab);
    if (s) out.push(s);
  }
  return out;
}

type HydratedTree = {
  tree: PaneNode;
  activeLeafId: number;
  firstLeafCwd?: string;
};

function hydrateNode(
  node: SerializedNode,
  allocId: () => number,
  acc: { activeLeafId: number | null },
): PaneNode {
  if (node.kind === "leaf") {
    const id = allocId();
    if (node.active && acc.activeLeafId === null) acc.activeLeafId = id;
    return {
      kind: "leaf",
      id,
      ...(node.cwd !== undefined && { cwd: node.cwd }),
      ...(node.tmuxSession !== undefined && { tmuxSession: node.tmuxSession }),
    };
  }
  const children = node.children.map((c) => hydrateNode(c, allocId, acc));
  if (children.length === 0) return { kind: "leaf", id: allocId() };
  if (children.length === 1) return children[0];
  return { kind: "split", id: allocId(), dir: node.dir, children };
}

function hydrateTree(
  tree: SerializedNode,
  allocId: () => number,
): HydratedTree {
  const acc: { activeLeafId: number | null } = { activeLeafId: null };
  const paneTree = hydrateNode(tree, allocId, acc);
  const leaves = collectLeaves(paneTree);
  const activeLeafId = acc.activeLeafId ?? leaves[0]?.id ?? allocId();
  const firstLeafCwd =
    leaves.find((l) => l.id === activeLeafId)?.cwd ?? leaves[0]?.cwd;
  return { tree: paneTree, activeLeafId, firstLeafCwd };
}

function collectLeaves(node: PaneNode): Array<{ id: number; cwd?: string }> {
  if (isLeaf(node)) return [{ id: node.id, cwd: node.cwd }];
  return node.children.flatMap(collectLeaves);
}

function hydrateTab(
  s: SerializedTab,
  spaceId: string,
  allocId: () => number,
): Tab | null {
  switch (s.kind) {
    case "terminal": {
      const { tree, activeLeafId, firstLeafCwd } = hydrateTree(s.tree, allocId);
      // Mirror labelFor: a managed restart-safe session's random name is
      // noise, so a restored managed tab keeps the cwd-derived title instead
      // of surfacing the raw managed token.
      const sessionTitle = isManagedSession(s.tmuxSession)
        ? undefined
        : s.tmuxSession;
      const title =
        s.customTitle ??
        sessionTitle ??
        (firstLeafCwd ? basename(firstLeafCwd) : s.blocks ? "blocks" : "shell");
      // A managed (restart-safe) session is local by construction, but Local
      // is not persisted (absent == Local) and a workspace-less tab spawns on
      // the AMBIENT env at mount — under an SSH/WSL env the reattach would
      // recreate the session on the remote host. Re-pin it explicitly.
      const managed =
        !s.workspace &&
        (isManagedSession(s.tmuxSession) ||
          collectManagedSessions(tree).length > 0);
      return {
        id: allocId(),
        kind: "terminal",
        spaceId,
        cold: true,
        title,
        cwd: firstLeafCwd,
        paneTree: tree,
        activeLeafId,
        ...(s.blocks && { blocks: true }),
        ...(s.customTitle !== undefined && { customTitle: s.customTitle }),
        ...(s.workspace && { workspace: s.workspace }),
        ...(managed && { workspace: LOCAL_WORKSPACE }),
        ...(s.tmuxSession !== undefined && { tmuxSession: s.tmuxSession }),
      } satisfies TerminalTab;
    }
    case "editor":
      return {
        id: allocId(),
        kind: "editor",
        spaceId,
        cold: true,
        title: basename(s.path),
        path: s.path,
        dirty: false,
        preview: false,
        ...(s.workspace && { workspace: s.workspace }),
      } satisfies EditorTab;
    case "preview":
      return {
        id: allocId(),
        kind: "preview",
        spaceId,
        cold: true,
        title: titleFromUrl(s.url),
        url: s.url,
      } satisfies PreviewTab;
    case "markdown":
      return {
        id: allocId(),
        kind: "markdown",
        spaceId,
        cold: true,
        title: basename(s.path),
        path: s.path,
        ...(s.workspace && { workspace: s.workspace }),
      } satisfies MarkdownTab;
    case "html":
      return {
        id: allocId(),
        kind: "html",
        spaceId,
        cold: true,
        title: basename(s.path),
        path: s.path,
        ...(s.workspace && { workspace: s.workspace }),
      } satisfies HtmlTab;
    default:
      return null;
  }
}

export function freshTerminalTab(
  spaceId: string,
  cwd: string | null,
  allocId: () => number,
): TerminalTab {
  const leafId = allocId();
  return {
    id: allocId(),
    kind: "terminal",
    spaceId,
    cold: true,
    title: cwd ? basename(cwd) : "shell",
    cwd: cwd ?? undefined,
    paneTree: { kind: "leaf", id: leafId, ...(cwd && { cwd }) },
    activeLeafId: leafId,
  };
}

export function hydrateTabs(
  serialized: SerializedTab[],
  spaceId: string,
  allocId: () => number,
): Tab[] {
  if (!Array.isArray(serialized)) return [];
  const out: Tab[] = [];
  for (const s of serialized) {
    try {
      const tab = hydrateTab(s, spaceId, allocId);
      if (tab) out.push(tab);
    } catch {
      // Skip corrupted entries rather than failing the whole restore.
    }
  }
  return out;
}

/** A group reaches the file only through a persisted member, so a group of
 *  private tabs alone leaves no trace, name included. */
export function serializeSpace(
  tabs: Tab[],
  groups: TabGroup[],
): { tabs: SerializedTab[]; groups?: SerializedGroup[] } {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const position = new Map<string, number>();
  const outGroups: SerializedGroup[] = [];
  const outTabs: SerializedTab[] = [];
  for (const tab of tabs) {
    const [s] = serializeTabs([tab]);
    if (!s) continue;
    const g = tab.groupId === undefined ? undefined : byId.get(tab.groupId);
    if (!g || g.spaceId !== tab.spaceId) {
      outTabs.push(s);
      continue;
    }
    let at = position.get(g.id);
    if (at === undefined) {
      at = outGroups.length;
      position.set(g.id, at);
      outGroups.push({
        ...(g.name !== "" && { name: g.name }),
        color: g.color,
        ...(g.collapsed && { collapsed: true }),
      });
    }
    outTabs.push({ ...s, group: at });
  }
  return outGroups.length > 0
    ? { tabs: outTabs, groups: outGroups }
    : { tabs: outTabs };
}

/** Lenient on group data: a broken entry or ref leaves the tab loose, never
 *  drops it. */
export function hydrateSpace(
  state: SpaceState,
  spaceId: string,
  allocId: () => number,
): GroupState {
  const entries = readGroupEntries(state.groups);
  const made = new Map<number, TabGroup>();
  const tabs: Tab[] = [];
  const serialized: unknown[] = Array.isArray(state.tabs) ? state.tabs : [];
  for (const s of serialized) {
    const [tab] = hydrateTabs([s as SerializedTab], spaceId, allocId);
    if (!tab) continue;
    const ref = readGroupRef((s as { group?: unknown }).group, entries);
    const entry = ref === null ? null : entries[ref];
    if (ref === null || !entry) {
      tabs.push(tab);
      continue;
    }
    let group = made.get(ref);
    if (!group) {
      group = {
        id: newGroupId(allocId),
        spaceId,
        name: entry.name ?? "",
        color: entry.color,
        collapsed: entry.collapsed === true,
      };
      made.set(ref, group);
    }
    tabs.push({ ...tab, groupId: group.id });
  }
  const groups = [...made.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, g]) => g);
  return normalizeGroups({ tabs, groups });
}
