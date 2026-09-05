import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSpaces } from "@/modules/spaces/lib/useSpaces";
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

/** The tabs that belong to `spaceId`; every tab when no space is active
 *  (single-space setups, tests). Explorer and source-control follow the
 *  *active space* only, so a space switch never shows another space's last
 *  terminal cwd (upstream #1159). */
export function tabsInSpace(tabs: Tab[], spaceId: string | null): Tab[] {
  return spaceId ? tabs.filter((t) => t.spaceId === spaceId) : tabs;
}

type CachedCwd = { cwd: string; env: WorkspaceEnv | undefined };

export function useWorkspaceCwd(
  activeTab: Tab | undefined,
  tabs: Tab[],
  home: string | null,
  /** Ambient env (== file-tree / AI env). cwds from a different env are skipped. */
  workspaceEnv: WorkspaceEnv,
): Result {
  const activeSpaceId = useSpaces((s) => s.activeId);
  const spaceTabs = useMemo(
    () => tabsInSpace(tabs, activeSpaceId),
    [tabs, activeSpaceId],
  );
  // The active tab is the active space's by construction; guard anyway so a
  // stale activeTab during a switch cannot leak its cwd into the new space.
  const spaceActiveTab =
    activeTab && (!activeSpaceId || activeTab.spaceId === activeSpaceId)
      ? activeTab
      : undefined;

  // Cache the last terminal cwd per space, *with* its env so it's never reused
  // under a different env (handing a local /Users/... path to the remote fs
  // yields ENOENT). Per space so switching back restores that space's cwd.
  const cwdBySpace = useRef(new Map<string, CachedCwd>());
  const cacheKey = activeSpaceId ?? "*";

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
    if (
      spaceActiveTab?.kind === "terminal" &&
      spaceActiveTab.cwd &&
      envsMatch(spaceActiveTab.workspace, workspaceEnv)
    )
      return spaceActiveTab.cwd;
    const last = cwdBySpace.current.get(cacheKey);
    if (last && envsMatch(last.env, workspaceEnv)) return last.cwd;
    const anyTerm = spaceTabs.find(
      (t) =>
        t.kind === "terminal" && t.cwd && envsMatch(t.workspace, workspaceEnv),
    );
    if (anyTerm?.kind === "terminal" && anyTerm.cwd) return anyTerm.cwd;
    // `home` is a LOCAL path: only a fallback for the local env. A remote env
    // with no known cwd yet shows nothing rather than reading the local home
    // path against the remote host.
    return workspaceEnv.kind === "local" ? home : null;
  }, [spaceActiveTab, spaceTabs, home, workspaceEnv, cacheKey]);

  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    if (
      spaceActiveTab?.kind === "terminal" &&
      spaceActiveTab.cwd &&
      envsMatch(spaceActiveTab.workspace, workspaceEnv)
    )
      return spaceActiveTab.cwd;
    const last = cwdBySpace.current.get(cacheKey);
    if (last && envsMatch(last.env, workspaceEnv)) return last.cwd;
    return workspaceEnv.kind === "local" ? (home ?? undefined) : undefined;
  }, [spaceActiveTab, home, workspaceEnv, cacheKey]);

  return { explorerRoot, inheritedCwdForNewTab };
}
