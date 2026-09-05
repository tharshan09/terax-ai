import { useCallback, useEffect, useMemo, useRef } from "react";
import type { WorkspaceEnv } from "@/modules/workspace";
import type { Tab } from "./useTabs";

type Result = {
  explorerRoot: string | null;
  inheritedCwdForNewTab: () => string | undefined;
};

/**
 * Whether two workspace envs reference the same shell environment. A tab
 * without an env counts as Local. WSL/SSH only match on distro/host. Used to
 * skip cwds that belong to a different env — handing a remote `/home/me` path
 * to a local file tree (or vice-versa) yields a wrong / not-found root.
 */
export function envsMatch(
  a: WorkspaceEnv | undefined,
  b: WorkspaceEnv,
): boolean {
  if (!a) return b.kind === "local";
  if (a.kind !== b.kind) return false;
  if (a.kind === "wsl" && b.kind === "wsl") return a.distro === b.distro;
  if (a.kind === "ssh" && b.kind === "ssh") return a.host === b.host;
  return true;
}

type CachedCwd = { cwd: string; env: WorkspaceEnv | undefined };

export function useWorkspaceCwd(
  activeTab: Tab | undefined,
  /** Tabs of the active space only (App already scopes them): explorer and
   *  source-control never follow another space's terminal (upstream #1159). */
  spaceTabs: Tab[],
  home: string | null,
  /** Ambient env (== file-tree / AI env). cwds from a different env are skipped. */
  workspaceEnv: WorkspaceEnv,
  activeSpaceId: string | null,
): Result {
  // The active tab belongs to the active space by construction; during the
  // one commit where the space id flips before the tab does, keep the previous
  // root instead of clearing the tree.
  const switching =
    activeTab !== undefined &&
    activeSpaceId !== null &&
    activeTab.spaceId !== activeSpaceId;
  const spaceActiveTab = switching ? undefined : activeTab;
  const lastRoot = useRef<string | null>(null);

  // Last terminal cwd per space, *with* its env so it is never reused under a
  // different env (a local /Users path against the remote fs yields ENOENT).
  const cwdBySpace = useRef(new Map<string, CachedCwd>());
  const cacheKey = activeSpaceId ?? "*";

  // A cache hit only counts while a terminal of this space still sits there;
  // a tab moved to another space or closed must not pin its old cwd here.
  const cachedCwd = useCallback((): string | null => {
    const last = cwdBySpace.current.get(cacheKey);
    if (!last || !envsMatch(last.env, workspaceEnv)) return null;
    const alive = spaceTabs.some(
      (t) =>
        t.kind === "terminal" &&
        t.cwd === last.cwd &&
        envsMatch(t.workspace, workspaceEnv),
    );
    return alive ? last.cwd : null;
  }, [cacheKey, spaceTabs, workspaceEnv]);

  const anyTerminalCwd = useCallback((): string | null => {
    const term = spaceTabs.find(
      (t) =>
        t.kind === "terminal" && t.cwd && envsMatch(t.workspace, workspaceEnv),
    );
    return term?.kind === "terminal" && term.cwd ? term.cwd : null;
  }, [spaceTabs, workspaceEnv]);

  useEffect(() => {
    if (
      spaceActiveTab?.kind === "terminal" &&
      spaceActiveTab.cwd &&
      envsMatch(spaceActiveTab.workspace, workspaceEnv)
    ) {
      cwdBySpace.current.set(cacheKey, {
        cwd: spaceActiveTab.cwd,
        env: spaceActiveTab.workspace,
      });
    } else if (workspaceEnv.kind === "ssh") {
      // Off a terminal tab (source-control / history / editor) the tmux cwd poll
      // keeps a background SSH terminal's cwd fresh; mirror it into the cache so
      // explorerRoot follows the live remote cwd instead of a stale value. SSH
      // only, so the local/WSL last-active-terminal behavior is unchanged.
      const term = spaceTabs.find(
        (t) => t.kind === "terminal" && t.cwd && envsMatch(t.workspace, workspaceEnv),
      );
      if (term?.kind === "terminal" && term.cwd) {
        cwdBySpace.current.set(cacheKey, { cwd: term.cwd, env: term.workspace });
      }
    }
  }, [spaceActiveTab, spaceTabs, workspaceEnv, cacheKey]);

  const explorerRoot = useMemo<string | null>(() => {
    if (switching) return lastRoot.current;
    let root: string | null;
    if (
      spaceActiveTab?.kind === "terminal" &&
      spaceActiveTab.cwd &&
      envsMatch(spaceActiveTab.workspace, workspaceEnv)
    ) {
      root = spaceActiveTab.cwd;
    } else {
      // `home` is a LOCAL path: only a fallback for the local env. A remote env
      // with no known cwd yet shows nothing rather than reading the local home
      // path against the remote host.
      root =
        cachedCwd() ??
        anyTerminalCwd() ??
        (workspaceEnv.kind === "local" ? home : null);
    }
    lastRoot.current = root;
    return root;
  }, [switching, spaceActiveTab, home, workspaceEnv, cachedCwd, anyTerminalCwd]);

  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    if (
      spaceActiveTab?.kind === "terminal" &&
      spaceActiveTab.cwd &&
      envsMatch(spaceActiveTab.workspace, workspaceEnv)
    )
      return spaceActiveTab.cwd;
    return (
      cachedCwd() ??
      anyTerminalCwd() ??
      (workspaceEnv.kind === "local" ? (home ?? undefined) : undefined)
    );
  }, [spaceActiveTab, home, workspaceEnv, cachedCwd, anyTerminalCwd]);

  return { explorerRoot, inheritedCwdForNewTab };
}
