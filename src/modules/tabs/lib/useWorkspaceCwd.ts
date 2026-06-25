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
function envsMatch(a: WorkspaceEnv | undefined, b: WorkspaceEnv): boolean {
  if (!a) return b.kind === "local";
  if (a.kind !== b.kind) return false;
  if (a.kind === "wsl" && b.kind === "wsl") return a.distro === b.distro;
  if (a.kind === "ssh" && b.kind === "ssh") return a.host === b.host;
  return true;
}

export function useWorkspaceCwd(
  activeTab: Tab | undefined,
  tabs: Tab[],
  home: string | null,
  /** Ambient env (== file-tree / AI env). cwds from a different env are skipped. */
  workspaceEnv: WorkspaceEnv,
): Result {
  // Cache the cwd *with* its env so it's never reused under a different env
  // (handing a local /Users/... path to the remote fs yields ENOENT).
  const lastTerminalCwd = useRef<{
    cwd: string;
    env: WorkspaceEnv | undefined;
  } | null>(null);

  useEffect(() => {
    if (
      activeTab?.kind === "terminal" &&
      activeTab.cwd &&
      envsMatch(activeTab.workspace, workspaceEnv)
    ) {
      lastTerminalCwd.current = { cwd: activeTab.cwd, env: activeTab.workspace };
    }
  }, [activeTab, workspaceEnv]);

  const explorerRoot = useMemo<string | null>(() => {
    if (
      activeTab?.kind === "terminal" &&
      activeTab.cwd &&
      envsMatch(activeTab.workspace, workspaceEnv)
    )
      return activeTab.cwd;
    const last = lastTerminalCwd.current;
    if (last && envsMatch(last.env, workspaceEnv)) return last.cwd;
    const anyTerm = tabs.find(
      (t) =>
        t.kind === "terminal" && t.cwd && envsMatch(t.workspace, workspaceEnv),
    );
    if (anyTerm?.kind === "terminal" && anyTerm.cwd) return anyTerm.cwd;
    // `home` is a LOCAL path — only a fallback for the local env. A remote env
    // with no known cwd yet shows nothing rather than reading the local home
    // path against the remote host.
    return workspaceEnv.kind === "local" ? home : null;
  }, [activeTab, tabs, home, workspaceEnv]);

  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    if (
      activeTab?.kind === "terminal" &&
      activeTab.cwd &&
      envsMatch(activeTab.workspace, workspaceEnv)
    )
      return activeTab.cwd;
    const last = lastTerminalCwd.current;
    if (last && envsMatch(last.env, workspaceEnv)) return last.cwd;
    return workspaceEnv.kind === "local" ? (home ?? undefined) : undefined;
  }, [activeTab, home, workspaceEnv]);

  return { explorerRoot, inheritedCwdForNewTab };
}
