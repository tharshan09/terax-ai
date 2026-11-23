import { useEffect, useRef } from "react";
import { native } from "@/modules/ai/lib/native";
import type { Tab, TabGroup } from "@/modules/tabs";
import { visibleTabsInSpace } from "@/modules/tabs/lib/tabGroups";
import { DEFAULT_SPACE_ID } from "@/modules/tabs/lib/useTabs";
import {
  collectManagedSessions,
  isManagedSession,
  reapOrphanedManagedSessions,
} from "@/modules/terminal/lib/managedTmux";
import { isLeaf, type PaneNode } from "@/modules/terminal/lib/panes";
import type { WorkspaceEnv } from "@/modules/workspace";
import { activeSpaceEnv, freshTabCwd } from "./activeSpace";
import { freshTerminalTab, hydrateSpace } from "./serialize";
import { loadAll, saveActiveId, saveSpacesList, type SpaceMeta } from "./store";
import { useSpaces } from "./useSpaces";

type Params = {
  ready: boolean;
  launchCwd: string | null;
  home: string | null;
  allocId: () => number;
  replaceTabs: (tabs: Tab[], activeId: number, groups?: TabGroup[]) => void;
  markBooted: () => void;
  setActiveSpaceForNewTabs: (id: string) => void;
  adoptWorkspaceEnv: (env: WorkspaceEnv) => Promise<string | null>;
};

/** Every managed session name the restored tabs still reference (leaf-level
 *  bindings plus the tab-level marker), i.e. the set the boot reaper must NOT
 *  kill. */
function referencedManagedSessions(tabs: Tab[]): Set<string> {
  const referenced = new Set<string>();
  for (const t of tabs) {
    if (t.kind !== "terminal") continue;
    for (const s of collectManagedSessions(t.paneTree)) referenced.add(s);
    if (isManagedSession(t.tmuxSession)) referenced.add(t.tmuxSession);
  }
  return referenced;
}

function uniqueCwds(tabs: Tab[]): string[] {
  const set = new Set<string>();
  const walk = (n: PaneNode) => {
    if (isLeaf(n)) {
      if (n.cwd) set.add(n.cwd);
      return;
    }
    for (const c of n.children) walk(c);
  };
  for (const t of tabs) if (t.kind === "terminal") walk(t.paneTree);
  return [...set];
}

export function useSpacesBoot({
  ready,
  launchCwd,
  home,
  allocId,
  replaceTabs,
  markBooted,
  setActiveSpaceForNewTabs,
  adoptWorkspaceEnv,
}: Params) {
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;

    void (async () => {
      try {
        const { spaces, activeId, states } = await loadAll();

        if (spaces.length === 0) {
          const root = launchCwd ?? home ?? null;
          const meta: SpaceMeta = {
            id: DEFAULT_SPACE_ID,
            name: "Default",
            root,
            env: { kind: "local" },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          await saveSpacesList([meta]);
          await saveActiveId(DEFAULT_SPACE_ID);
          setActiveSpaceForNewTabs(DEFAULT_SPACE_ID);
          useSpaces.getState().hydrate([meta], DEFAULT_SPACE_ID);
          // No persisted state means nothing legitimately references a
          // managed session: whatever carries our prefix is a leak. The reaper
          // only ever matches this build's prefix and does nothing without it.
          void reapOrphanedManagedSessions(new Set());
          return;
        }

        const restored: Tab[] = [];
        const groups: TabGroup[] = [];
        for (const space of spaces) {
          const st = states.get(space.id);
          if (!st) continue;
          const hydrated = hydrateSpace(st, space.id, allocId);
          restored.push(...hydrated.tabs);
          groups.push(...hydrated.groups);
        }

        // Reap leaked managed tmux sessions (picker switch-away, workspace
        // switch, in-pane detach) now that we know, across ALL spaces, which
        // sessions the restored tabs still reference. Fire-and-forget: the
        // restore path never waits on tmux.
        void reapOrphanedManagedSessions(referencedManagedSessions(restored));

        const active =
          activeId && spaces.some((s) => s.id === activeId)
            ? activeId
            : spaces[0].id;
        setActiveSpaceForNewTabs(active);

        // Apply the space's env+home before the fresh-tab fallback and spawns
        // below; env is set synchronously so cwd resolution picks WSL vs local.
        const env = activeSpaceEnv(spaces, active);
        const restoredHome = await adoptWorkspaceEnv(env);

        // Active space must never be empty, else its tab list shows nothing.
        if (!restored.some((t) => t.spaceId === active)) {
          const cwd = freshTabCwd(env, restoredHome, launchCwd, home);
          restored.push(freshTerminalTab(active, cwd, allocId));
        }

        await Promise.allSettled(
          uniqueCwds(restored).map((cwd) => native.workspaceAuthorize(cwd)),
        );

        const initialActiveIndex: Record<string, number> = {};
        for (const [id, st] of states)
          initialActiveIndex[id] = st.activeTabIndex;
        useSpaces.getState().hydrate(spaces, active, initialActiveIndex);

        // Counted over every stored tab of the space, collapsed members too:
        // the index was written that way, and useTabs expands the group.
        const inActive = visibleTabsInSpace(
          { tabs: restored, groups },
          active,
          { all: true },
        );
        const idx = states.get(active)?.activeTabIndex ?? 0;
        const activeTab = inActive[idx] ?? inActive[0] ?? restored[0];
        replaceTabs(restored, activeTab.id, groups);
      } catch (e) {
        console.error("[terax] spaces boot failed:", e);
      } finally {
        markBooted();
      }
    })();
  }, [
    ready,
    launchCwd,
    home,
    allocId,
    replaceTabs,
    markBooted,
    setActiveSpaceForNewTabs,
    adoptWorkspaceEnv,
  ]);
}
