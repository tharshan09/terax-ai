import { basename, titleFromUrl } from "@/lib/utils";
import {
  collectManagedSessions,
  newManagedSession,
  removedManagedSessions,
} from "@/modules/terminal/lib/managedTmux";
import {
  type DropEdge,
  findLeafCwd,
  hasLeaf,
  leafIds,
  moveLeaf,
  nextLeafId,
  type PaneNode,
  removeLeaf,
  type SplitDir,
  setLeafCwd as setLeafCwdInTree,
  setLeafTmuxSession as setLeafTmuxSessionInTree,
  siblingLeafOf,
  splitLeaf,
} from "@/modules/terminal/lib/panes";
import { killTmuxSession } from "@/modules/terminal/lib/tmux";
import { disposeSession } from "@/modules/terminal/lib/useTerminalSession";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  currentWorkspaceEnv,
  LOCAL_WORKSPACE,
  type WorkspaceEnv,
} from "@/modules/workspace";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyDocView } from "./applyDocView";
import { resolveFileTabOpen } from "./resolveFileTabOpen";

// Matches the renderer slot pool size — over this we'd evict an active leaf.
export const MAX_PANES_PER_TAB = 4;

/** Managed tmux session for a new LOCAL terminal when restart-safe mode is on;
 *  undefined otherwise (a plain shell). Only the primary leaf gets one, so a
 *  split pane stays a plain shell (matching the tmux-tab convention). */
function managedSessionForNewLocalTab(): string | undefined {
  return usePreferencesStore.getState().restartSafeSessions
    ? newManagedSession()
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

// Returns the tab at position `idx` within the given space, or undefined when
// idx is out of range or no matching space tab exists.
export function pickTabBySpaceIndex(
  tabs: Tab[],
  idx: number,
  spaceId: string,
): Tab | undefined {
  const pool = tabs.filter((t) => t.spaceId === spaceId);
  return pool[idx];
}

// Next active after close, scoped to the closing tab's space. null = last tab of
// its space, which callers treat as "refuse to close".
export function nextActiveInSpace(
  tabs: Tab[],
  closingId: number,
): number | null {
  const closing = tabs.find((t) => t.id === closingId);
  if (!closing) return null;
  const sameSpace = tabs.filter((t) => t.spaceId === closing.spaceId);
  if (sameSpace.length <= 1) return null;
  const idx = sameSpace.findIndex((t) => t.id === closingId);
  return (sameSpace[idx - 1] ?? sameSpace[idx + 1]).id;
}

// Gap index is relative to the space's own strip, including the dragged tab.
export function reorderTabsByGap(
  tabs: Tab[],
  fromId: number,
  toGapIndex: number,
): Tab[] {
  const moved = tabs.find((t) => t.id === fromId);
  if (!moved) return tabs;
  const sameSpace = tabs.filter((t) => t.spaceId === moved.spaceId);
  const spaceFrom = sameSpace.findIndex((t) => t.id === fromId);
  let spaceTarget = toGapIndex > spaceFrom ? toGapIndex - 1 : toGapIndex;
  spaceTarget = Math.max(0, Math.min(spaceTarget, sameSpace.length - 1));
  if (spaceTarget === spaceFrom) return tabs;
  const anchor = sameSpace[spaceTarget];
  const next = tabs.filter((t) => t.id !== fromId);
  const anchorIdx = next.findIndex((t) => t.id === anchor.id);
  const insertIdx = spaceTarget > spaceFrom ? anchorIdx + 1 : anchorIdx;
  next.splice(insertIdx, 0, moved);
  return next;
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
): { tabs: Tab[]; disposeLeafIds: number[]; activeId: number } | null {
  const removed = tabs.filter((t) => t.spaceId === spaceId);
  if (removed.length === 0) return null;
  const disposeLeafIds = removed
    .filter((t) => t.kind === "terminal")
    .flatMap((t) => leafIds((t as TerminalTab).paneTree));
  let next = tabs.filter((t) => t.spaceId !== spaceId);
  let activeId = currentActiveId;
  if (!next.some((t) => t.spaceId === fallbackSpaceId)) {
    const tabId = allocId();
    next = [
      ...next,
      coldTerminalTab(tabId, allocId(), fallbackSpaceId, fallbackCwd),
    ];
    activeId = tabId;
  } else if (!next.some((t) => t.id === currentActiveId)) {
    const inFallback = next.filter((t) => t.spaceId === fallbackSpaceId);
    activeId = inFallback[inFallback.length - 1].id;
  }
  return { tabs: next, disposeLeafIds, activeId };
}

export function useTabs(initial?: Partial<TerminalTab>) {
  const [tabs, setTabs] = useState<Tab[]>(() => {
    const tabId = 1;
    const leafId = 2;
    return [
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
    ];
  });
  const [activeId, setActiveId] = useState(1);
  // Gates warming until boot resolves the restore, so no shell spawns before it.
  const [booted, setBooted] = useState(false);
  const nextIdRef = useRef(3);
  const activeSpaceIdRef = useRef(DEFAULT_SPACE_ID);
  const tabsRef = useRef(tabs);
  const activeIdRef = useRef(activeId);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Activating a cold tab warms it: one choke point for every activation path.
  useEffect(() => {
    if (!booted) return;
    setTabs((curr) => {
      const t = curr.find((x) => x.id === activeId);
      if (!t?.cold) return curr;
      return curr.map((x) => (x.id === activeId ? { ...x, cold: false } : x));
    });
  }, [activeId, booted]);

  const allocId = useCallback(() => nextIdRef.current++, []);

  const markBooted = useCallback(() => setBooted(true), []);

  const setActiveSpaceForNewTabs = useCallback((spaceId: string) => {
    activeSpaceIdRef.current = spaceId;
  }, []);

  const replaceTabs = useCallback((next: Tab[], nextActiveId: number) => {
    if (next.length === 0) return;
    setTabs(next);
    setActiveId(nextActiveId);
  }, []);

  // Appends a cold terminal tab to a space without stealing focus, so the
  // overview can populate a space in place; it spawns when first opened.
  const newTabInSpace = useCallback((spaceId: string, cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    const tmuxSession = managedSessionForNewLocalTab();
    setTabs((curr) => [
      ...curr,
      {
        id: tabId,
        kind: "terminal",
        spaceId,
        cold: true,
        title: cwd ? basename(cwd) : "shell",
        cwd,
        paneTree: { kind: "leaf", id: leafId, cwd, tmuxSession },
        activeLeafId: leafId,
      },
    ]);
    return tabId;
  }, []);

  // Reassigns a tab to another space. Returns true when the moved tab was active
  // and emptied its source space, so the caller should follow it into the target.
  const moveTabToSpace = useCallback(
    (tabId: number, targetSpaceId: string): boolean => {
      const curr = tabsRef.current;
      const tab = curr.find((t) => t.id === tabId);
      if (!tab || tab.spaceId === targetSpaceId) return false;
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? ({ ...t, spaceId: targetSpaceId } as Tab) : t,
        ),
      );
      if (activeIdRef.current !== tabId) return false;
      const fallback = nextActiveInSpace(curr, tabId);
      if (fallback !== null) {
        setActiveId(fallback);
        return false;
      }
      return true;
    },
    [],
  );

  // Positions a tab next to a target tab, inheriting the target's space. Returns
  // true when the active tab crossed into the target space and emptied its
  // source, so the caller should follow it.
  const reorderTab = useCallback(
    (tabId: number, targetTabId: number, edge: "top" | "bottom"): boolean => {
      if (tabId === targetTabId) return false;
      const curr = tabsRef.current;
      const moved = curr.find((t) => t.id === tabId);
      const target = curr.find((t) => t.id === targetTabId);
      if (!moved || !target) return false;
      const crossSpace = moved.spaceId !== target.spaceId;
      setTabs((prev) => {
        const without = prev.filter((t) => t.id !== tabId);
        let idx = without.findIndex((t) => t.id === targetTabId);
        if (idx < 0) return prev;
        if (edge === "bottom") idx += 1;
        const next: Tab = crossSpace
          ? ({ ...moved, spaceId: target.spaceId } as Tab)
          : moved;
        without.splice(idx, 0, next);
        return without;
      });
      if (!crossSpace || activeIdRef.current !== tabId) return false;
      const fallback = nextActiveInSpace(curr, tabId);
      if (fallback !== null) {
        setActiveId(fallback);
        return false;
      }
      return true;
    },
    [],
  );

  const removeTabsForSpace = useCallback(
    (spaceId: string, fallbackSpaceId: string, fallbackCwd?: string) => {
      let toDispose: number[] = [];
      let managed: string[] = [];
      setTabs((curr) => {
        const plan = planSpaceRemoval(
          curr,
          activeIdRef.current,
          spaceId,
          fallbackSpaceId,
          fallbackCwd,
          () => nextIdRef.current++,
        );
        if (!plan) return curr;
        toDispose = plan.disposeLeafIds;
        managed = curr
          .filter((t) => !plan.tabs.some((p) => p.id === t.id))
          .flatMap((t) =>
            t.kind === "terminal" ? collectManagedSessions(t.paneTree) : [],
          );
        setActiveId(plan.activeId);
        return plan.tabs;
      });
      for (const lid of toDispose) disposeSession(lid);
      killManagedSessions(managed);
    },
    [],
  );

  const newTab = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    const tmuxSession = managedSessionForNewLocalTab();
    setTabs((t) => [
      ...t,
      {
        id: tabId,
        kind: "terminal",
        spaceId: activeSpaceIdRef.current,
        title: "shell",
        cwd,
        paneTree: { kind: "leaf", id: leafId, cwd, tmuxSession },
        activeLeafId: leafId,
      },
    ]);
    setActiveId(tabId);
    return tabId;
  }, []);

  const newBlockTab = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    setTabs((t) => [
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
    ]);
    setActiveId(tabId);
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
    setTabs((t) => [
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
    ]);
    setActiveId(tabId);
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
      setTabs((t) => [
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
      ]);
      setActiveId(tabId);
      return tabId;
    },
    [],
  );

  // Re-points the active tab (and its focused leaf) at a different tmux session.
  // The live re-attach is driven by reattachLeafTmux; this keeps the tab's
  // binding and title in sync so the switcher and tab strip reflect the change.
  const rebindTmuxSession = useCallback((tabId: number, session: string) => {
    setTabs((ts) =>
      ts.map((t) => {
        if (t.id !== tabId || t.kind !== "terminal") return t;
        const paneTree = setLeafTmuxSessionInTree(
          t.paneTree,
          t.activeLeafId,
          session,
        );
        return { ...t, tmuxSession: session, title: session, paneTree };
      }),
    );
  }, []);

  // Clears the one-shot "pop the tmux picker on connect" flag for an SSH tab
  // once it has fired, so a later `cd` does not re-open the picker.
  const consumeTmuxPick = useCallback((tabId: number) => {
    setTabs((ts) =>
      ts.map((t) =>
        t.id === tabId && t.kind === "terminal" && t.pickTmuxOnConnect
          ? { ...t, pickTmuxOnConnect: false }
          : t,
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
    setTabs((t) => [
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
    ]);
    setActiveId(tabId);
    return { tabId, leafId };
  }, []);

  const newPrivateTab = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    setTabs((t) => [
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
    ]);
    setActiveId(tabId);
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
    setTabs((curr) => {
      const res = resolveFileTabOpen(curr, path, pin, {
        makeId: () => nextIdRef.current++,
        spaceId: activeSpaceIdRef.current,
        workspace: currentWorkspaceEnv(),
        title: basename(path),
      });
      targetId = res.targetId;
      return res.tabs;
    });
    if (targetId !== null) setActiveId(targetId);
    return targetId as number | null;
  }, []);

  /**
   * Promotes a preview tab to a persistent one. Called on double-click of the
   * tab title in the tab bar. Dirty edits also auto-promote (see `updateTab`).
   */
  const pinTab = useCallback((id: number) => {
    setTabs((curr) =>
      curr.map((t) =>
        t.id === id && t.kind === "editor" ? { ...t, preview: false } : t,
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
      setTabs((curr) => {
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
      });
      if (targetId !== null) setActiveId(targetId);
      return targetId as number | null;
    },
    [],
  );

  const closeAiDiffTab = useCallback((approvalId: string) => {
    setTabs((curr) => {
      const target = curr.find(
        (t) => t.kind === "ai-diff" && t.approvalId === approvalId,
      );
      if (!target) return curr;
      const fallback = nextActiveInSpace(curr, target.id);
      if (fallback === null) {
        return curr.map((t) =>
          t.kind === "ai-diff" && t.approvalId === approvalId
            ? { ...t, status: "approved" as AiDiffStatus }
            : t,
        );
      }
      const next = curr.filter((t) => t.id !== target.id);
      setActiveId((active) => (target.id === active ? fallback : active));
      return next;
    });
  }, []);

  const newPreviewTab = useCallback((url: string) => {
    const id = nextIdRef.current++;
    setTabs((t) => [
      ...t,
      {
        id,
        kind: "preview",
        spaceId: activeSpaceIdRef.current,
        title: titleFromUrl(url),
        url,
      },
    ]);
    setActiveId(id);
    return id;
  }, []);

  const newMarkdownTab = useCallback((path: string) => {
    let targetId: number | null = null;
    setTabs((curr) => {
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
    });
    if (targetId !== null) setActiveId(targetId);
    return targetId;
  }, []);

  const newHtmlTab = useCallback((path: string) => {
    let targetId: number | null = null;
    setTabs((curr) => {
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
    });
    if (targetId !== null) setActiveId(targetId);
    return targetId;
  }, []);

  const setOverrideLanguage = useCallback((id: number, lang: string | null) => {
    setTabs((curr) =>
      curr.map((t) => {
        if (t.id !== id || t.kind !== "editor") return t;
        return {
          ...t,
          overrideLanguage: lang,
        };
      }),
    );
  }, []);

  // Swaps a tab between its rendered doc kind (markdown / html) and a raw
  // editor in place, keeping the same tab id. The toggle UI is shared, so the
  // target kind is derived from the file extension rather than passed in.
  const setDocView = useCallback((id: number, mode: "rendered" | "raw") => {
    setTabs((curr) => curr.map((t) => applyDocView(t, id, mode)));
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
        setTabs(nextTabs);
        setActiveId(existing.id);
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
      setTabs(nextTabs);
      setActiveId(id);
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
        setTabs(nextTabs);
        setActiveId(existing.id);
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
      setTabs(nextTabs);
      setActiveId(id);
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
        setTabs(nextTabs);
        setActiveId(existing.id);
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
      setTabs(nextTabs);
      setActiveId(id);
      return id;
    },
    [],
  );

  const closeTab = useCallback((id: number) => {
    let toDispose: number[] = [];
    let managed: string[] = [];
    setTabs((curr) => {
      const fallback = nextActiveInSpace(curr, id);
      if (fallback === null) return curr;
      const target = curr.find((t) => t.id === id);
      if (target?.kind === "terminal") {
        toDispose = leafIds(target.paneTree);
        managed = collectManagedSessions(target.paneTree);
      }
      const next = curr.filter((t) => t.id !== id);
      setActiveId((active) => (id === active ? fallback : active));
      return next;
    });
    for (const lid of toDispose) disposeSession(lid);
    killManagedSessions(managed);
  }, []);

  const updateTab = useCallback((id: number, patch: TabPatch) => {
    setTabs((t) =>
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
    );
  }, []);

  const selectByIndex = useCallback(
    (idx: number, spaceId?: string) => {
      const t = spaceId ? pickTabBySpaceIndex(tabs, idx, spaceId) : tabs[idx];
      if (t) setActiveId(t.id);
    },
    [tabs],
  );

  /** Update a leaf's cwd; mirror to the tab's `cwd` when the leaf is active.
   * Bails out without setTabs when nothing actually changed — shell integration
   * re-emits OSC 7 on every prompt, including empty Enters, so this fires at
   * keystroke rate. Always-setTabs there cascades a paneTree re-render across
   * every open tab. */
  const setLeafCwd = useCallback((leafId: number, cwd: string) => {
    setTabs((curr) => {
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
    });
  }, []);

  const focusPane = useCallback((tabId: number, leafId: number) => {
    setTabs((curr) =>
      curr.map((t) => {
        if (t.id !== tabId || t.kind !== "terminal") return t;
        if (!hasLeaf(t.paneTree, leafId)) return t;
        if (t.activeLeafId === leafId) return t;
        const cwd = findLeafCwd(t.paneTree, leafId);
        return {
          ...t,
          activeLeafId: leafId,
          ...(cwd !== undefined && { cwd }),
        };
      }),
    );
  }, []);

  const focusNextPaneInTab = useCallback((tabId: number, delta: 1 | -1) => {
    setTabs((curr) =>
      curr.map((t) => {
        if (t.id !== tabId || t.kind !== "terminal") return t;
        const next = nextLeafId(t.paneTree, t.activeLeafId, delta);
        if (next === t.activeLeafId) return t;
        const cwd = findLeafCwd(t.paneTree, next);
        return { ...t, activeLeafId: next, ...(cwd !== undefined && { cwd }) };
      }),
    );
  }, []);

  /** Split the active leaf of `tabId` along `dir`. Returns the new leaf id. */
  const splitActivePane = useCallback(
    (tabId: number, dir: SplitDir): number | null => {
      let newLeafId: number | null = null;
      setTabs((curr) =>
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
      setTabs((curr) =>
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
          return { ...t, paneTree, activeLeafId: sourceLeafId };
        }),
      );
    },
    [],
  );

  const closePaneByLeaf = useCallback((leafId: number): void => {
    let didRemove = false;
    let managed: string[] = [];
    setTabs((curr) => {
      const tab = curr.find(
        (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
      );
      if (tab?.kind !== "terminal") return curr;
      const newTree = removeLeaf(tab.paneTree, leafId);
      managed = removedManagedSessions(tab.paneTree, newTree);
      if (newTree === null) {
        const fallback = nextActiveInSpace(curr, tab.id);
        if (fallback === null) return curr;
        const next = curr.filter((x) => x.id !== tab.id);
        setActiveId((active) => (active === tab.id ? fallback : active));
        didRemove = true;
        return next;
      }
      const remaining = leafIds(newTree);
      let newActive = tab.activeLeafId;
      if (tab.activeLeafId === leafId) {
        const sib = siblingLeafOf(tab.paneTree, leafId);
        newActive = sib && remaining.includes(sib) ? sib : remaining[0];
      }
      didRemove = true;
      return curr.map((x) =>
        x.id === tab.id
          ? { ...x, paneTree: newTree, activeLeafId: newActive }
          : x,
      );
    });
    if (didRemove) disposeSession(leafId);
    killManagedSessions(managed);
  }, []);

  const closeActivePane = useCallback((tabId: number): boolean => {
    let closedTab = false;
    let removedLeaf: number | null = null;
    let managed: string[] = [];
    setTabs((curr) => {
      const t = curr.find((x) => x.id === tabId);
      if (t?.kind !== "terminal") return curr;
      const target = t.activeLeafId;
      const newTree = removeLeaf(t.paneTree, target);
      managed = removedManagedSessions(t.paneTree, newTree);
      if (newTree === null) {
        const fallback = nextActiveInSpace(curr, tabId);
        if (fallback === null) return curr;
        const next = curr.filter((x) => x.id !== tabId);
        setActiveId((active) => (active === tabId ? fallback : active));
        closedTab = true;
        removedLeaf = target;
        return next;
      }
      const remaining = leafIds(newTree);
      const sib = siblingLeafOf(t.paneTree, target);
      const newActive = sib && remaining.includes(sib) ? sib : remaining[0];
      removedLeaf = target;
      return curr.map((x) =>
        x.id === tabId
          ? { ...x, paneTree: newTree, activeLeafId: newActive }
          : x,
      );
    });
    if (removedLeaf !== null) disposeSession(removedLeaf);
    killManagedSessions(managed);
    return closedTab;
  }, []);

  const resetWorkspace = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const leafId = nextIdRef.current++;
    let toDispose: number[] = [];
    setTabs((curr) => {
      toDispose = curr.flatMap((t) =>
        t.kind === "terminal" ? leafIds(t.paneTree) : [],
      );
      return [
        {
          id: tabId,
          kind: "terminal",
          spaceId: activeSpaceIdRef.current,
          title: "shell",
          cwd,
          paneTree: { kind: "leaf", id: leafId, cwd },
          activeLeafId: leafId,
        },
      ];
    });
    setActiveId(tabId);
    for (const lid of toDispose) disposeSession(lid);
  }, []);

  const reorderTabByGap = useCallback((fromId: number, toGapIndex: number) => {
    setTabs((prev) => reorderTabsByGap(prev, fromId, toGapIndex));
  }, []);

  return {
    tabs,
    activeId,
    setActiveId,
    allocId,
    replaceTabs,
    moveTabToSpace,
    reorderTab,
    reorderTabByGap,
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
    closeActivePane,
    closePaneByLeaf,
    resetWorkspace,
  };
}
