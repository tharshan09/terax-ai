import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getLaunchDir } from "@/lib/launchDir";
import { usePresence } from "@/lib/usePresence";
import { quoteShellArg } from "@/lib/shellQuote";
import { useUiFonts } from "@/lib/useUiFonts";
import { useZoom } from "@/lib/useZoom";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AgentMissionControl,
  AgentNotificationsBridge,
  cycleWaitingTarget,
  SshAgentActivityPoller,
} from "@/modules/agents";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import {
  AgentRunBridge,
  AiMiniWindow,
  LocalAgentNotificationsBridge,
  SelectionAskAi,
  useAiBootstrap,
  useAiLiveBridge,
  useChatStore,
  useSelectionAskAi,
} from "@/modules/ai";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import { native } from "@/modules/ai/lib/native";
import { CommandPalette, createCommandItems } from "@/modules/command-palette";
import {
  NewEditorDialog,
  useEditorFileSync,
  type EditorPaneHandle,
} from "@/modules/editor";
import { FileExplorer, type FileExplorerHandle } from "@/modules/explorer";
import type { GitHistorySearchHandle } from "@/modules/git-history";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import type { PreviewPaneHandle } from "@/modules/preview";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { isHtmlPath, isMarkdownPath } from "@/lib/utils";
import {
  useGlobalShortcuts,
  type ShortcutHandlers,
  type ShortcutId,
} from "@/modules/shortcuts";
import {
  SidebarRail,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useSidebarPanel,
} from "@/modules/sidebar";
import {
  SourceControlPanel,
  useSourceControlContext,
} from "@/modules/source-control";
import { StatusBar } from "@/modules/statusbar";
import { useClaudeStatsStore } from "@/modules/statusbar/lib/claudeStatsStore";
import {
  claudeStatuslineEnabled,
  disableClaudeStatusline,
  enableClaudeStatusline,
} from "@/modules/statusbar/lib/claudeStatusline";
import {
  TabSwitcherHud,
  useTabs,
  useTabSwipe,
  useTabSwitcher,
  useWindowTitle,
  useWorkspaceCwd,
} from "@/modules/tabs";
import {
  clearFocusedTerminal,
  disposeSession,
  applyExternalCwd,
  findLeafCwd,
  leafCwd,
  hasLeaf,
  leafIds,
  navigateFocusedBlocks,
  reattachLeafTmux,
  setLeafTmuxBinding,
  submitToLeaf,
  type TerminalPaneHandle,
  type TmuxPickerTarget,
  TmuxSessionSwitcher,
  useTerminalFileDrop,
  writeToSession,
} from "@/modules/terminal";
import {
  isCurrentTmuxTarget,
  isValidSessionName,
  listTmuxSessions,
  pickTmuxPollTarget,
  tmuxPaneCwd,
} from "@/modules/terminal/lib/tmux";
import { activeManagedSession } from "@/modules/terminal/lib/managedTmux";
import {
  SpaceSwitcher,
  useSpaces,
  useSpacePersistence,
  useSpacesBoot,
} from "@/modules/spaces";
import { DEFAULT_SPACE_ID } from "@/modules/tabs/lib/useTabs";
import { ThemeProvider, useThemeFileEditing } from "@/modules/theme";
import {
  currentWorkspaceEnv,
  LOCAL_WORKSPACE,
  useWorkspaceEnvStore,
  type WorkspaceEnv,
} from "@/modules/workspace";
import { listSshHosts, type SshHost } from "@/modules/workspace/sshHosts";
import { setTerminalPathOpener } from "@/modules/terminal/lib/rendererPool";
import { resolveTerminalPath } from "@/modules/terminal/lib/terminalPathLinks";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CloseDialogs } from "./components/CloseDialogs";
import {
  TOGGLE_BLOCK_INPUT_EVENT,
  WorkspaceInputBar,
} from "./components/WorkspaceInputBar";
import { WorkspaceSurface } from "./components/WorkspaceSurface";
import { useAppCloseGuard } from "./hooks/useAppCloseGuard";
import { useTabCloseGuards } from "./hooks/useTabCloseGuards";
import { useWorkspaceSwitcher } from "./hooks/useWorkspaceSwitcher";

/** Interval for the tmux pane-cwd poll. tmux swallows the inner shell's OSC 7,
 *  so on tmux hosts `cd` reaches us only via this poll. Slow enough to barely
 *  touch the ControlMaster, fast enough to feel live. */
const TMUX_CWD_POLL_MS = 2000;

function tmuxTargetForTab(tab: {
  id: number;
  activeLeafId: number;
  workspace?: WorkspaceEnv;
}): TmuxPickerTarget {
  return {
    tabId: tab.id,
    leafId: tab.activeLeafId,
    workspace: tab.workspace,
    host: tab.workspace?.kind === "ssh" ? tab.workspace.host : undefined,
  };
}

export default function App() {
  const {
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
    setOverrideLanguage,
    openAiDiffTab,
    closeAiDiffTab,
    openGitDiffTab,
    openCommitHistoryTab,
    openCommitFileDiffTab,
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
  } = useTabs(getLaunchDir() ? { cwd: getLaunchDir() } : undefined);

  // Mirror `tabs` into a ref so callbacks scheduled with `setTimeout`
  // (e.g. cdInNewTab) read the latest pane state instead of a stale closure.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const activeTerminalTab = useMemo(() => {
    const t = tabs.find((x) => x.id === activeId);
    return t && t.kind === "terminal" ? t : null;
  }, [tabs, activeId]);
  const activeLeafId = activeTerminalTab?.activeLeafId ?? null;
  const restartSafeSession = useMemo(
    () =>
      // Only a LOCAL tab can be restart-safe: a remote session that happens to
      // carry the managed prefix must not make the badge promise "survives an
      // app restart" for a host Terax does not manage.
      activeTerminalTab &&
      (!activeTerminalTab.workspace ||
        activeTerminalTab.workspace.kind === "local")
        ? activeManagedSession(
            activeTerminalTab.paneTree,
            activeTerminalTab.activeLeafId,
          )
        : null,
    [activeTerminalTab],
  );
  const activeTerminalTabRef = useRef(activeTerminalTab);
  activeTerminalTabRef.current = activeTerminalTab;

  const searchAddons = useRef<Map<number, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const [gitHistoryHandle, setGitHistoryHandle] =
    useState<GitHistorySearchHandle | null>(null);
  const { zoomIn, zoomOut, zoomReset } = useZoom();
  useUiFonts();
  useTerminalFileDrop();
  const explorerRef = useRef<FileExplorerHandle>(null);

  // Drives session disposal off the pane tree, not React lifecycles —
  // split/unsplit re-mount components but the leaf is still live.
  const liveLeavesRef = useRef<Set<number>>(new Set());

  const clearWorkspaceState = useCallback(() => {
    for (const id of liveLeavesRef.current) disposeSession(id);
    searchAddons.current.clear();
    terminalRefs.current.clear();
    editorRefs.current.clear();
    previewRefs.current.clear();
    setActiveSearchAddon(null);
    setActiveEditorHandle(null);
  }, []);

  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const {
    home,
    launchCwd,
    launchCwdResolved,
    switchWorkspace,
    adoptWorkspaceEnv,
  } = useWorkspaceSwitcher({
    tabsRef,
    workspaceEnv,
    setWorkspaceEnv,
    resetWorkspace,
    clearWorkspaceState,
  });

  const activeSpaceId = useSpaces((s) => s.activeId);
  const spacesHydrated = useSpaces((s) => s.hydrated);

  const handleWorkspaceChange = useCallback(
    async (env: WorkspaceEnv) => {
      const switched = await switchWorkspace(env);
      if (switched && activeSpaceId) {
        useSpaces.getState().setEnv(activeSpaceId, env);
      }
    },
    [switchWorkspace, activeSpaceId],
  );

  useSpacesBoot({
    ready: launchCwdResolved,
    launchCwd,
    home,
    allocId,
    replaceTabs,
    markBooted,
    setActiveSpaceForNewTabs,
    adoptWorkspaceEnv,
  });

  useSpacePersistence({
    tabs,
    activeId,
    activeSpaceId: activeSpaceId ?? DEFAULT_SPACE_ID,
    enabled: spacesHydrated,
  });

  const prevSpaceRef = useRef(activeSpaceId);
  useEffect(() => {
    if (!spacesHydrated || !activeSpaceId) return;
    setActiveSpaceForNewTabs(activeSpaceId);
    const prev = prevSpaceRef.current;
    prevSpaceRef.current = activeSpaceId;
    if (prev === null || prev === activeSpaceId) return;
    const meta = useSpaces
      .getState()
      .spaces.find((s) => s.id === activeSpaceId);
    if (meta) void adoptWorkspaceEnv(meta.env);
    const inSpace = tabsRef.current.filter((t) => t.spaceId === activeSpaceId);
    if (inSpace.length === 0) return;
    // Keep the active tab if it already belongs to the newly active space (a
    // cross-space jump set it explicitly); else fall to the space's last tab.
    if (inSpace.some((t) => t.id === activeId)) return;
    setActiveId(inSpace[inSpace.length - 1].id);
  }, [
    activeSpaceId,
    activeId,
    spacesHydrated,
    setActiveSpaceForNewTabs,
    setActiveId,
    adoptWorkspaceEnv,
  ]);

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [tmuxTarget, setTmuxTarget] = useState<TmuxPickerTarget | null>(null);

  const spaceTabs = useMemo(
    () => tabs.filter((t) => t.spaceId === (activeSpaceId ?? DEFAULT_SPACE_ID)),
    [tabs, activeSpaceId],
  );

  const {
    sidebarRef,
    sidebarWidthRef,
    sidebarView,
    initialSidebarCollapsed,
    persistSidebarView,
    persistSidebarCollapsed,
    toggleSidebar,
    cycleSidebarView,
    persistSidebarWidth,
    toggleExplorerFocus,
  } = useSidebarPanel(explorerRef);

  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [missionControlOpen, setMissionControlOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteInitialMode, setPaletteInitialMode] = useState<
    "commands" | "content"
  >("commands");
  const openCommandPalette = useCallback(
    (mode: "commands" | "content" = "commands") => {
      setPaletteInitialMode(mode);
      setCommandPaletteOpen(true);
    },
    [],
  );
  const miniOpen = useChatStore((s) => s.mini.open);
  const miniPresence = usePresence(miniOpen, 200);
  const openMini = useChatStore((s) => s.openMini);
  const focusInput = useChatStore((s) => s.focusInput);
  const openPanel = useChatStore((s) => s.openPanel);
  const panelOpen = useChatStore((s) => s.panelOpen);
  const setLive = useChatStore((s) => s.setLive);
  const respondToApproval = useChatStore((s) => s.respondToApproval);

  const { hasComposer, keysLoaded } = useAiBootstrap();

  const activeTab = tabs.find((t) => t.id === activeId);
  const isTerminalTab = activeTab?.kind === "terminal";
  const isBlockTab = activeTerminalTab?.blocks === true;
  const isEditorTab = activeTab?.kind === "editor";
  const isGitHistoryTab = activeTab?.kind === "git-history";

  useEditorFileSync({ tabs, tabsRef, editorRefs });
  useThemeFileEditing({ tabsRef, openFileTab });

  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(
    activeTab,
    tabs,
    launchCwd ?? home,
    workspaceEnv,
  );

  useWindowTitle(activeTab, explorerRoot);

  // Ambient env follows the active SSH tab so the explorer / fs / AI operate
  // on the remote host while it's focused. Surgical: only the SSH path drives
  // ambient env from the tab — Local/WSL keep using the space-env switcher.
  useEffect(() => {
    const tabEnv =
      activeTab?.kind === "terminal" || activeTab?.kind === "editor"
        ? activeTab.workspace
        : undefined;
    if (tabEnv?.kind === "ssh") {
      if (workspaceEnv.kind !== "ssh" || workspaceEnv.host !== tabEnv.host) {
        setWorkspaceEnv(tabEnv);
      }
    } else if (
      workspaceEnv.kind === "ssh" &&
      (activeTab?.kind === "terminal" || activeTab?.kind === "editor")
    ) {
      // Focus moved to a NON-ssh terminal/editor → leave the remote env and
      // restore the space's env (Local on macOS). Tabs without an env
      // (markdown/preview/git) are intentionally NOT handled here, so the
      // ambient env stays sticky and a remote file they show keeps reading
      // remotely instead of flipping to a local path.
      const spaceEnv =
        useSpaces.getState().spaces.find((s) => s.id === activeSpaceId)?.env ??
        LOCAL_WORKSPACE;
      setWorkspaceEnv(spaceEnv);
    }
  }, [activeTab, activeSpaceId, workspaceEnv, setWorkspaceEnv]);

  // cwd-follow under tmux. tmux swallows the inner shell's OSC 7, so a terminal
  // `cd` inside tmux never reaches us and the explorer / source-control stay
  // stuck at the seeded cwd. This hits local restart-safe tmux tabs (every new
  // local tab is a tmux tab now) as much as SSH ones. Poll tmux's own
  // `pane_current_path` for the ACTIVE tmux leaf (the only cwd the explorer and
  // source-control read) and feed it through the same sink OSC 7 uses, so both
  // panels follow with zero extra wiring. Additive: plain (non-tmux) shells keep
  // their OSC 7 path untouched. Deps are primitive scalars only — the
  // `activeTerminalTab` object identity changes on every keystroke-rate
  // setLeafCwd, and depending on it would restart the interval (and spam
  // tmux / the ControlMaster) on every cd.
  const tmuxPollTarget = useMemo(
    () => pickTmuxPollTarget(activeTerminalTab, tabs, workspaceEnv),
    [activeTerminalTab, tabs, workspaceEnv],
  );
  const tmuxPollKind = tmuxPollTarget?.workspace.kind ?? null;
  const tmuxPollHost =
    tmuxPollTarget?.workspace.kind === "ssh"
      ? tmuxPollTarget.workspace.host
      : null;
  const tmuxPollSession = tmuxPollTarget?.session;
  const tmuxPollLeafId = tmuxPollTarget?.leafId;
  const tmuxPollTabId = tmuxPollTarget?.tabId;
  useEffect(() => {
    if (
      !tmuxPollKind ||
      !tmuxPollSession ||
      tmuxPollLeafId == null ||
      tmuxPollTabId == null
    )
      return;
    const expected = {
      tabId: tmuxPollTabId,
      leafId: tmuxPollLeafId,
      session: tmuxPollSession,
    };
    const workspace: WorkspaceEnv =
      tmuxPollKind === "ssh" && tmuxPollHost
        ? { kind: "ssh", host: tmuxPollHost }
        : LOCAL_WORKSPACE;
    let cancelled = false;
    let inFlight = false;
    const tick = () => {
      if (cancelled || inFlight || document.hidden) return;
      inFlight = true;
      tmuxPaneCwd(workspace, tmuxPollSession)
        .then((path) => {
          if (cancelled || !path) return;
          // Drop a late response once the target tab / leaf / session moved on.
          const tab = tabsRef.current.find((t) => t.id === expected.tabId);
          if (!isCurrentTmuxTarget(tab, expected)) return;
          applyExternalCwd(expected.leafId, path);
        })
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    };
    tick();
    const timer = setInterval(tick, TMUX_CWD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [tmuxPollKind, tmuxPollHost, tmuxPollSession, tmuxPollLeafId, tmuxPollTabId]);

  // Claude Code stats over SSH. The model/context/cost widgets read stats the
  // statusLine wrapper writes; over SSH Claude runs on the host, so the wrapper
  // must be installed there. When the local stats toggle is on, install it on
  // each connected SSH host (once per session); when it goes off, remove it
  // again. Mirrors the local install the config toggle already does.
  const claudeStatsEnabled = useClaudeStatsStore((s) => s.enabled);
  const installedClaudeHosts = useRef<Set<string>>(new Set());
  useEffect(() => {
    void claudeStatuslineEnabled()
      .then((on) => useClaudeStatsStore.getState().setEnabled(on))
      .catch(() => {});
  }, []);
  // Only hosts with a bound tmux session: that implies the ControlMaster is up
  // (so the install reuses it instead of opening a second connection) and is the
  // only case where remote stats can be keyed (SSH+tmux).
  const sshHostsKey = useMemo(() => {
    const hosts = new Set<string>();
    for (const t of tabs) {
      if (
        t.kind === "terminal" &&
        t.workspace?.kind === "ssh" &&
        t.tmuxSession
      ) {
        hosts.add(t.workspace.host);
      }
    }
    return [...hosts].sort().join("\n");
  }, [tabs]);
  useEffect(() => {
    if (claudeStatsEnabled !== true || !sshHostsKey) return;
    for (const host of sshHostsKey.split("\n")) {
      if (installedClaudeHosts.current.has(host)) continue;
      installedClaudeHosts.current.add(host);
      void enableClaudeStatusline({ kind: "ssh", host }).catch(() => {
        // Leave it un-installed so a later connect/change retries.
        installedClaudeHosts.current.delete(host);
      });
    }
  }, [claudeStatsEnabled, sshHostsKey]);
  const prevClaudeStatsEnabled = useRef(claudeStatsEnabled);
  useEffect(() => {
    const prev = prevClaudeStatsEnabled.current;
    prevClaudeStatsEnabled.current = claudeStatsEnabled;
    if (prev === true && claudeStatsEnabled === false) {
      for (const host of installedClaudeHosts.current) {
        void disableClaudeStatusline({ kind: "ssh", host }).catch(() => {});
      }
      installedClaudeHosts.current.clear();
    }
  }, [claudeStatsEnabled]);

  useEffect(() => {
    setActiveSearchAddon(
      activeLeafId !== null
        ? (searchAddons.current.get(activeLeafId) ?? null)
        : null,
    );
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
  }, [activeId, activeLeafId]);

  const handleSearchReady = useCallback(
    (leafId: number, addon: SearchAddon) => {
      searchAddons.current.set(leafId, addon);
      if (leafId === activeLeafId) setActiveSearchAddon(addon);
    },
    [activeLeafId],
  );

  const disposeTab = useCallback(
    (id: number) => {
      // Terminal-leaf-keyed maps (terminalRefs/searchAddons) are pruned by
      // the effect below as the pane tree changes; only the tab-id-keyed
      // handles need explicit cleanup here.
      editorRefs.current.delete(id);
      previewRefs.current.delete(id);
      closeTab(id);
    },
    [closeTab],
  );

  const {
    pendingCloseTab,
    pendingTerminalCloseTab,
    pendingDeleteTabs,
    handleClose,
    confirmClose,
    cancelClose,
    confirmTerminalClose,
    cancelTerminalClose,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
  } = useTabCloseGuards({ tabs, disposeTab });

  const { pendingAppClose, confirmAppClose, cancelAppClose } =
    useAppCloseGuard(tabsRef);

  useEffect(() => {
    const live = new Set<number>();
    for (const t of tabs) {
      if (t.kind === "terminal") {
        for (const id of leafIds(t.paneTree)) live.add(id);
      }
    }
    for (const id of liveLeavesRef.current) {
      if (!live.has(id)) disposeSession(id);
    }
    liveLeavesRef.current = live;
    for (const k of [...terminalRefs.current.keys()])
      if (!live.has(k)) terminalRefs.current.delete(k);
    for (const k of [...searchAddons.current.keys()])
      if (!live.has(k)) searchAddons.current.delete(k);
  }, [tabs]);

  // Most-recently-used tab ids, most recent first, pruned to live tabs. Drives
  // the Ctrl+Tab quick switcher so it cycles by recency, not strip order.
  const mruRef = useRef<number[]>([activeId]);
  useEffect(() => {
    mruRef.current = [
      activeId,
      ...mruRef.current.filter((id) => id !== activeId),
    ];
  }, [activeId]);
  useEffect(() => {
    const live = new Set(tabs.map((t) => t.id));
    mruRef.current = mruRef.current.filter((id) => live.has(id));
  }, [tabs]);

  const getSwitcherOrder = useCallback(() => {
    const space = activeSpaceId ?? DEFAULT_SPACE_ID;
    const inSpace = tabsRef.current
      .filter((t) => t.spaceId === space)
      .map((t) => t.id);
    const present = new Set(inSpace);
    const ordered = mruRef.current.filter((id) => present.has(id));
    for (const id of inSpace) if (!ordered.includes(id)) ordered.push(id);
    return [activeId, ...ordered.filter((id) => id !== activeId)];
  }, [activeId, activeSpaceId]);

  const { state: switcherState, step: stepSwitcher } = useTabSwitcher({
    getOrder: getSwitcherOrder,
    onCommit: (id) => {
      if (tabsRef.current.some((t) => t.id === id)) setActiveId(id);
    },
  });

  const cycleSpace = useCallback((delta: 1 | -1) => {
    const { spaces, activeId: sid, setActive } = useSpaces.getState();
    if (spaces.length < 2) return;
    const idx = spaces.findIndex((s) => s.id === sid);
    const next = (idx + delta + spaces.length) % spaces.length;
    setActive(spaces[next].id);
  }, []);

  const captureActiveSelection = useCallback((): string | null => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t) return null;
    if (t.kind === "terminal") {
      const lid = t.activeLeafId;
      return terminalRefs.current.get(lid)?.getSelection() ?? null;
    }
    if (t.kind === "editor") {
      return editorRefs.current.get(activeId)?.getSelection() ?? null;
    }
    return null;
  }, [tabs, activeId]);

  const togglePanelAndFocus = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    if (panelOpen) {
      useChatStore.getState().closePanel();
    } else {
      openPanel();
      focusInput(null);
    }
  }, [hasComposer, panelOpen, openPanel, focusInput]);

  const attachSelection = useChatStore((s) => s.attachSelection);

  const handleAttachFileToAgent = useCallback(
    (path: string) => {
      if (!hasComposer) {
        void openSettingsWindow("models");
        return;
      }
      // Dispatch a window event the composer listens for. Same pattern as
      // selections — keeps file-explorer decoupled from the AI module.
      window.dispatchEvent(
        new CustomEvent<string>("terax:ai-attach-file", { detail: path }),
      );
      openPanel();
      focusInput(null);
    },
    [hasComposer, openPanel, focusInput],
  );

  const askFromSelection = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    const selection = captureActiveSelection();
    if (!selection?.trim()) {
      focusInput(null);
      return;
    }
    const source: "terminal" | "editor" =
      activeTab?.kind === "editor" ? "editor" : "terminal";
    attachSelection(selection, source);
  }, [
    hasComposer,
    captureActiveSelection,
    focusInput,
    attachSelection,
    activeTab,
  ]);

  const { askPopup, setAskPopup, onAskFromSelection } = useSelectionAskAi({
    captureActiveSelection,
    askFromSelection,
  });
  const askPresence = usePresence(Boolean(askPopup), 120);

  const openNewTab = useCallback(() => {
    newTab(inheritedCwdForNewTab());
  }, [newTab, inheritedCwdForNewTab]);

  const openNewPrivateTab = useCallback(() => {
    newPrivateTab(inheritedCwdForNewTab());
  }, [newPrivateTab, inheritedCwdForNewTab]);

  const openNewBlockTab = useCallback(() => {
    newBlockTab(inheritedCwdForNewTab());
  }, [newBlockTab, inheritedCwdForNewTab]);

  const openSshTab = useCallback(
    (host: string) => {
      newSshTab(host);
    },
    [newSshTab],
  );

  // Hosts for the `+` → SSH submenu, read once from ~/.ssh/config.
  const [sshHosts, setSshHosts] = useState<SshHost[]>([]);
  useEffect(() => {
    void listSshHosts().then(setSshHosts);
  }, []);

  const sendCd = useCallback(
    (path: string) => {
      if (activeLeafId === null) return;
      const term = terminalRefs.current.get(activeLeafId);
      if (!term) return;
      term.write(`cd ${quoteShellArg(path)}\r`);
      term.focus();
    },
    [activeLeafId],
  );

  const cdInNewTab = useCallback(
    (path: string) => {
      const tabId = newTab(path);
      setTimeout(() => {
        const tab = tabsRef.current.find((x) => x.id === tabId);
        if (!tab || tab.kind !== "terminal") return;
        const t = terminalRefs.current.get(tab.activeLeafId);
        if (!t) return;
        t.write(`cd ${quoteShellArg(path)}\r`);
        t.focus();
      }, 80);
    },
    [newTab],
  );

  const handleOpenFile = useCallback(
    (path: string, pin?: boolean) => {
      // Markdown and HTML open in their rendered view by default; a per-tab
      // toggle flips to the raw editor. Other files default to preview
      // (pin=false); explicit actions like context-menu "Open" pass pin=true.
      if (isMarkdownPath(path)) newMarkdownTab(path);
      else if (isHtmlPath(path)) newHtmlTab(path);
      else openFileTab(path, pin ?? false);
    },
    [openFileTab, newMarkdownTab, newHtmlTab],
  );

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      for (const t of tabs) {
        if (t.kind !== "editor" && t.kind !== "markdown" && t.kind !== "html")
          continue;
        if (t.path === from) {
          const i = to.lastIndexOf("/");
          updateTab(t.id, { path: to, title: i === -1 ? to : to.slice(i + 1) });
        } else if (t.path.startsWith(`${from}/`)) {
          const suffix = t.path.slice(from.length);
          const newPath = `${to}${suffix}`;
          const i = newPath.lastIndexOf("/");
          updateTab(t.id, {
            path: newPath,
            title: i === -1 ? newPath : newPath.slice(i + 1),
          });
        }
      }
    },
    [tabs, updateTab],
  );

  const activeTerminalLeafCwd =
    activeTab?.kind === "terminal"
      ? (findLeafCwd(activeTab.paneTree, activeTab.activeLeafId) ??
        activeTab.cwd ??
        null)
      : null;

  const activeFilePath = (() => {
    if (activeTab?.kind === "editor") return activeTab.path;
    if (activeTab?.kind === "git-diff") {
      if (/^([A-Za-z]:|\/|\\)/.test(activeTab.path)) return activeTab.path;
      const root = activeTab.repoRoot.replace(/[\\/]+$/, "");
      const rel = activeTab.path.replace(/^[\\/]+/, "");
      return `${root}/${rel}`;
    }
    if (activeTab?.kind === "git-commit-file") {
      const root = activeTab.repoRoot.replace(/[\\/]+$/, "");
      const rel = activeTab.path.replace(/^[\\/]+/, "");
      return `${root}/${rel}`;
    }
    return null;
  })();
  const explorerActiveFilePath =
    activeTab?.kind === "editor" ||
    activeTab?.kind === "markdown" ||
    activeTab?.kind === "html"
      ? activeTab.path
      : null;
  const { sourceControl, toggleSourceControl, openGitGraphFromContext } =
    useSourceControlContext({
      activeTab,
      tabs,
      activeTerminalLeafCwd,
      explorerRoot,
      launchCwd,
      launchCwdResolved,
      home,
      sidebarView,
      cycleSidebarView,
      openCommitHistoryTab,
    });
  const explorerGitDecorations = usePreferencesStore(
    (s) => s.explorerGitDecorations,
  );

  const openPreviewTab = useCallback(
    (url: string) => {
      const id = newPreviewTab(url);
      // Focus the address bar if the URL is empty so the user can type.
      if (!url) {
        setTimeout(() => previewRefs.current.get(id)?.focusAddressBar(), 0);
      }
      return id;
    },
    [newPreviewTab],
  );

  const splitActivePaneInActiveTab = useCallback(
    (dir: "row" | "col") => {
      const t = tabsRef.current.find((x) => x.id === activeId);
      if (!t || t.kind !== "terminal") return;
      splitActivePane(activeId, dir);
    },
    [activeId, splitActivePane],
  );

  const handleCloseTabOrPane = useCallback(() => {
    const t = tabsRef.current.find((x) => x.id === activeId);
    if (t?.kind === "terminal" && leafIds(t.paneTree).length > 1) {
      closeActivePane(activeId);
      return;
    }
    void handleClose(activeId);
  }, [activeId, closeActivePane, handleClose]);

  const [zenMode, setZenMode] = useState(false);

  // Focus an agent's tab, switching to its space first so the header and tab
  // strip don't end up showing a different space than the focused pane.
  const activateAgentTarget = useCallback(
    (tabId: number, leafId: number) => {
      const space = tabsRef.current.find((t) => t.id === tabId)?.spaceId;
      if (space && space !== useSpaces.getState().activeId) {
        useSpaces.getState().setActive(space);
      }
      setActiveId(tabId);
      focusPane(tabId, leafId);
    },
    [setActiveId, focusPane],
  );

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "commandPalette.open": () => openCommandPalette("commands"),
      "commandPalette.content": () => openCommandPalette("content"),
      "tab.new": openNewTab,
      "tab.newBlock": openNewBlockTab,
      "tab.newPrivate": openNewPrivateTab,
      "tab.newPreview": () => openPreviewTab(""),
      "tab.newEditor": () => setNewEditorOpen(true),
      "tab.close": handleCloseTabOrPane,
      "tab.next": () => stepSwitcher(1),
      "tab.prev": () => stepSwitcher(-1),
      "tab.selectByIndex": (e) =>
        selectByIndex(
          parseInt(e.key, 10) - 1,
          activeSpaceId ?? DEFAULT_SPACE_ID,
        ),
      "space.next": () => cycleSpace(1),
      "space.prev": () => cycleSpace(-1),
      "space.overview": () => setSwitcherOpen(true),
      "terminal.tmux_sessions": () =>
        setTmuxTarget((cur) => {
          if (cur) return null;
          const tab = activeTerminalTabRef.current;
          return tab ? tmuxTargetForTab(tab) : null;
        }),
      "pane.splitRight": () => splitActivePaneInActiveTab("row"),
      "pane.splitDown": () => splitActivePaneInActiveTab("col"),
      "pane.focusNext": () => focusNextPaneInTab(activeId, 1),
      "pane.focusPrev": () => focusNextPaneInTab(activeId, -1),
      "pane.source": toggleSourceControl,
      "terminal.clear": () => {
        clearFocusedTerminal();
      },
      "terminal.toggleInput": () =>
        window.dispatchEvent(new CustomEvent(TOGGLE_BLOCK_INPUT_EVENT)),
      "blocks.prev": () => navigateFocusedBlocks(-1),
      "blocks.next": () => navigateFocusedBlocks(1),
      "search.focus": () => searchInlineRef.current?.focus(),
      "ai.toggle": togglePanelAndFocus,
      "ai.askSelection": askFromSelection,
      "agent.focusAttention": () => {
        const from = activeTerminalTabRef.current?.activeLeafId ?? null;
        const t = cycleWaitingTarget(
          useAgentStore.getState().sessions,
          tabsRef.current,
          from,
        );
        if (t) activateAgentTarget(t.tabId, t.leafId);
      },
      "agent.overview": () => setMissionControlOpen((v) => !v),
      "settings.open": () => void openSettingsWindow(),
      "sidebar.toggle": toggleSidebar,
      "explorer.focus": toggleExplorerFocus,
      "view.zoomIn": zoomIn,
      "view.zoomOut": zoomOut,
      "view.zoomReset": zoomReset,
      "view.zenMode": () => setZenMode((v) => !v),
      "editor.undo": () => editorRefs.current.get(activeId)?.undo(),
      "editor.redo": () => editorRefs.current.get(activeId)?.redo(),
    }),
    [
      activeId,
      openCommandPalette,
      stepSwitcher,
      cycleSpace,
      handleCloseTabOrPane,
      openNewTab,
      openNewBlockTab,
      openNewPrivateTab,
      openPreviewTab,
      activeSpaceId,
      selectByIndex,
      splitActivePaneInActiveTab,
      focusNextPaneInTab,
      toggleSourceControl,
      togglePanelAndFocus,
      askFromSelection,
      toggleSidebar,
      toggleExplorerFocus,
      zoomIn,
      zoomOut,
      zoomReset,
      activateAgentTarget,
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      if (id === "editor.undo" || id === "editor.redo") {
        return activeTab?.kind !== "editor";
      }
      if (id === "ai.askSelection") {
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        const inTerminal = !!(target as HTMLElement | null)?.closest?.(
          ".xterm",
        );
        if (!inTerminal) return false;
        const sel = captureActiveSelection();
        return !sel || !sel.trim();
      }
      if (id === "terminal.clear") {
        // Only intercept ⌘K while a terminal is focused; elsewhere let the key
        // fall through (we never preventDefault when disabled).
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        return !(target as HTMLElement | null)?.closest?.(".xterm");
      }
      if (
        id === "terminal.toggleInput" ||
        id === "blocks.prev" ||
        id === "blocks.next"
      ) {
        return !(activeTab?.kind === "terminal" && activeTab.blocks === true);
      }
      if (id === "sidebar.toggle") {
        // Ctrl+B is also Claude Code's "run in background" key. While a terminal
        // is focused, let Ctrl+B reach the shell/Claude instead of toggling the
        // sidebar. Ctrl+Shift+B (second binding) still toggles it from anywhere.
        const target =
          (e.target as HTMLElement | null) ?? document.activeElement;
        const inTerminal = !!(target as HTMLElement | null)?.closest?.(
          ".xterm",
        );
        // Only defer the plain (no-shift) Ctrl/⌘+B binding; the Shift variant
        // is the always-on toggle and is never claimed by the terminal.
        return inTerminal && !e.shiftKey;
      }
      return false;
    },
    [activeTab],
  );

  useGlobalShortcuts(shortcutHandlers, { isDisabled: shortcutsDisabled });

  // macOS trackpad: a two-finger horizontal swipe switches tabs in the active
  // space's strip order, clamped at the edges (it does not wrap). The gesture is
  // detected natively (src-tauri install_tab_swipe_monitor) and delivered via
  // useTabSwipe; appRootRef bounds the under-cursor horizontal-scroller check.
  const appRootRef = useRef<HTMLDivElement>(null);
  const swipeTab = useCallback(
    (dir: -1 | 1) => {
      const ids = spaceTabs.map((t) => t.id);
      if (ids.length < 2) return;
      const i = ids.indexOf(activeId);
      if (i < 0) return;
      const next = Math.min(ids.length - 1, Math.max(0, i + dir)); // clamp, no wrap
      if (next === i) return; // already at the edge tab in this direction
      setActiveId(ids[next]); // no swipe animation - the tab strip is the feedback
    },
    [spaceTabs, activeId, setActiveId],
  );
  useTabSwipe(appRootRef, swipeTab);

  const registerTerminalHandle = useCallback(
    (leafId: number, h: TerminalPaneHandle | null) => {
      if (h) terminalRefs.current.set(leafId, h);
      else terminalRefs.current.delete(leafId);
    },
    [],
  );

  const registerEditorHandle = useCallback(
    (id: number, h: EditorPaneHandle | null) => {
      if (h) {
        editorRefs.current.set(id, h);
        const line = pendingGotoLine.current.get(id);
        if (line != null) {
          pendingGotoLine.current.delete(id);
          h.gotoLine(line);
        }
      } else {
        editorRefs.current.delete(id);
      }
      if (id === activeId) setActiveEditorHandle(h);
    },
    [activeId],
  );

  const registerPreviewHandle = useCallback(
    (id: number, h: PreviewPaneHandle | null) => {
      if (h) previewRefs.current.set(id, h);
      else previewRefs.current.delete(id);
    },
    [],
  );

  const handlePreviewUrl = useCallback(
    (id: number, url: string) => updateTab(id, { url }),
    [updateTab],
  );

  // First cwd report on an SSH tab marked `pickTmuxOnConnect` means its shell
  // has connected (ControlMaster up); pop the tmux picker once, unless tmux is
  // absent on the host (then leave the plain shell alone).
  const triggeredTmuxPick = useRef(new Set<number>());
  const tryAutoPickTmux = useCallback(
    (leafId: number) => {
      const tab = tabsRef.current.find(
        (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
      );
      if (!tab || tab.kind !== "terminal" || !tab.pickTmuxOnConnect) return;
      if (triggeredTmuxPick.current.has(tab.id)) return;
      triggeredTmuxPick.current.add(tab.id);
      consumeTmuxPick(tab.id);
      const tgt = tmuxTargetForTab(tab);
      // The probe is a slow SSH round trip; only open if nothing else grabbed
      // the picker meanwhile (a manual Cmd+Shift+M) and the tab still exists,
      // so a late auto-pop neither clobbers a manual target nor pops on a dead tab.
      const applyAutoPick = () =>
        setTmuxTarget(
          (cur) =>
            cur ??
            (tabsRef.current.some((t) => t.id === tgt.tabId) ? tgt : null),
        );
      listTmuxSessions(tab.workspace)
        .then(applyAutoPick)
        .catch((e: unknown) => {
          if (!String(e).includes("not installed")) applyAutoPick();
        });
    },
    [consumeTmuxPick],
  );

  const authorizedCwds = useRef(new Set<string>());
  const handleTerminalCwd = useCallback(
    (leafId: number, cwd: string) => {
      setLeafCwd(leafId, cwd);
      if (cwd && !authorizedCwds.current.has(cwd)) {
        authorizedCwds.current.add(cwd);
        native.workspaceAuthorize(cwd).catch(() => {
          authorizedCwds.current.delete(cwd);
        });
      }
      tryAutoPickTmux(leafId);
    },
    [setLeafCwd, tryAutoPickTmux],
  );

  const handleFocusLeaf = useCallback(
    (tabId: number, leafId: number) => focusPane(tabId, leafId),
    [focusPane],
  );

  const onActivateAgent = activateAgentTarget;

  const onActivateLocalAgent = useCallback(() => {
    openPanel();
    focusInput(null);
  }, [openPanel, focusInput]);

  const handleLeafExit = useCallback(
    (leafId: number, _code: number) => {
      const all = tabsRef.current;
      const tab = all.find(
        (t) => t.kind === "terminal" && hasLeaf(t.paneTree, leafId),
      );
      if (!tab || tab.kind !== "terminal") return;
      // Last pane of the last tab: quit instead of respawning a shell.
      if (leafIds(tab.paneTree).length === 1 && all.length === 1) {
        void getCurrentWindow().close();
      } else {
        closePaneByLeaf(leafId);
      }
    },
    [closePaneByLeaf],
  );

  const handleEditorDirty = useCallback(
    (id: number, dirty: boolean) => updateTab(id, { dirty }),
    [updateTab],
  );

  const handleRenameTab = useCallback(
    (id: number, title: string) => updateTab(id, { customTitle: title.trim() }),
    [updateTab],
  );

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalTab && activeLeafId !== null && activeSearchAddon)
      return {
        kind: "terminal",
        addon: activeSearchAddon,
        focus: () => terminalRefs.current.get(activeLeafId)?.focus(),
      };
    if (isEditorTab && activeEditorHandle)
      return {
        kind: "editor",
        handle: activeEditorHandle,
        focus: () => activeEditorHandle.focus(),
      };
    if (isGitHistoryTab && gitHistoryHandle)
      return {
        kind: "git-history",
        handle: gitHistoryHandle,
        focus: () => {},
      };
    return null;
  }, [
    isTerminalTab,
    isEditorTab,
    isGitHistoryTab,
    activeLeafId,
    activeSearchAddon,
    activeEditorHandle,
    gitHistoryHandle,
  ]);

  const activeCwd = activeTerminalLeafCwd;

  const handleNewSpace = useCallback(() => {
    const { spaces, create, setActive } = useSpaces.getState();
    const meta = create({
      name: `Space ${spaces.length + 1}`,
      root: activeCwd ?? home ?? null,
      env: workspaceEnv,
    });
    setActiveSpaceForNewTabs(meta.id);
    newTab(activeCwd ?? undefined);
    setActive(meta.id);
    return meta.id;
  }, [activeCwd, home, workspaceEnv, newTab, setActiveSpaceForNewTabs]);

  const handleDeleteSpace = useCallback(
    (id: string) => {
      const nextSpaceId = useSpaces.getState().remove(id);
      if (!nextSpaceId) return;
      const root = useSpaces
        .getState()
        .spaces.find((s) => s.id === nextSpaceId)?.root;
      removeTabsForSpace(id, nextSpaceId, root ?? undefined);
    },
    [removeTabsForSpace],
  );

  const handleMoveTab = useCallback(
    (tabId: number, targetSpaceId: string) => {
      if (moveTabToSpace(tabId, targetSpaceId)) {
        useSpaces.getState().setActive(targetSpaceId);
      }
    },
    [moveTabToSpace],
  );

  const handleReorderTab = useCallback(
    (tabId: number, targetTabId: number, edge: "top" | "bottom") => {
      if (reorderTab(tabId, targetTabId, edge)) {
        const target = tabsRef.current.find((x) => x.id === targetTabId);
        if (target) useSpaces.getState().setActive(target.spaceId);
      }
    },
    [reorderTab],
  );

  const handleNewTabInSpace = useCallback(
    (spaceId: string) => {
      const root = useSpaces
        .getState()
        .spaces.find((s) => s.id === spaceId)?.root;
      newTabInSpace(spaceId, root ?? undefined);
    },
    [newTabInSpace],
  );

  const jumpToTab = useCallback(
    (tabId: number) => {
      const t = tabsRef.current.find((x) => x.id === tabId);
      if (!t) return;
      setActiveId(tabId);
      useSpaces.getState().setActive(t.spaceId);
      setSwitcherOpen(false);
    },
    [setActiveId],
  );

  const spaceSwitcher = (
    <SpaceSwitcher
      open={switcherOpen}
      onOpenChange={setSwitcherOpen}
      tabs={tabs}
      onNewSpace={() => void handleNewSpace()}
      onDeleteSpace={handleDeleteSpace}
      onNewTabInSpace={handleNewTabInSpace}
      onJumpTab={jumpToTab}
      onCloseTab={handleClose}
      onMoveTabToSpace={handleMoveTab}
      onReorderTab={handleReorderTab}
      onReorderSpaces={(ids) => useSpaces.getState().reorder(ids)}
    />
  );

  const commandPaletteItems = useMemo(
    () =>
      commandPaletteOpen
        ? createCommandItems({
            tabs,
            activeId,
            searchTarget,
            explorerRoot,
            home,
            openNewTab,
            openNewBlock: openNewBlockTab,
            openNewPrivate: openNewPrivateTab,
            openNewEditor: () => setNewEditorOpen(true),
            openNewPreview: () => openPreviewTab(""),
            openTmuxSwitcher: () => {
              const tab = activeTerminalTabRef.current;
              if (tab) setTmuxTarget(tmuxTargetForTab(tab));
            },
            openGitGraph: openGitGraphFromContext,
            toggleSourceControl,
            closeActiveTabOrPane: handleCloseTabOrPane,
            splitPaneRight: () => splitActivePaneInActiveTab("row"),
            splitPaneDown: () => splitActivePaneInActiveTab("col"),
            focusSearch: () => searchInlineRef.current?.focus(),
            focusExplorerSearch: () => explorerRef.current?.focusSearch(),
            toggleSidebar,
            toggleAi: togglePanelAndFocus,
            askAiSelection: askFromSelection,
            openAgentOverview: () => setMissionControlOpen(true),
            openSettings: () => void openSettingsWindow(),
            openKeyboardShortcuts: () => void openSettingsWindow("shortcuts"),
            spaces: useSpaces.getState().spaces,
            activeSpaceId,
            openSpacesOverview: () => setSwitcherOpen(true),
            newSpace: () => void handleNewSpace(),
            switchSpace: (id) => useSpaces.getState().setActive(id),
          })
        : [],
    [
      commandPaletteOpen,
      tabs,
      activeId,
      searchTarget,
      explorerRoot,
      home,
      openNewTab,
      openNewBlockTab,
      openNewPrivateTab,
      openPreviewTab,
      openGitGraphFromContext,
      toggleSourceControl,
      handleCloseTabOrPane,
      splitActivePaneInActiveTab,
      toggleSidebar,
      togglePanelAndFocus,
      askFromSelection,
      activeSpaceId,
      handleNewSpace,
    ],
  );

  const pendingGotoLine = useRef<Map<number, number>>(new Map());
  const openContentHit = useCallback(
    (path: string, line: number) => {
      const id = openFileTab(path, true);
      if (id == null) return;
      const h = editorRefs.current.get(id);
      if (h) h.gotoLine(line);
      else pendingGotoLine.current.set(id, line);
    },
    [openFileTab],
  );

  // Cmd/Ctrl+Click on a file path in terminal output: resolve it against the
  // clicked pane's cwd (`~` expands to home locally; over SSH the host helper
  // does it), confirm it exists via fs_stat, then open it — a `:line` suffix
  // jumps there in the editor, HTML/MD render, everything else opens plain.
  useEffect(() => {
    setTerminalPathOpener((leafId, token, line) => {
      const workspace = currentWorkspaceEnv();
      const resolved = resolveTerminalPath(
        token,
        leafCwd(leafId),
        workspace.kind === "ssh" ? undefined : home,
      );
      if (!resolved) return;
      void invoke<{ kind: string }>("fs_stat", { path: resolved, workspace })
        .then(async (stat) => {
          if (stat.kind === "dir") return;
          // A terminal link is an untrusted vector: run the untrusted read
          // guard before opening a tab so a link to a secret is refused. The
          // editor and explorer opens stay trusted and are not gated here.
          try {
            await invoke("fs_check_readable", { path: resolved, workspace });
          } catch {
            toast.warning(
              "Won't open this path - it looks like a secret file.",
            );
            return;
          }
          if (line != null) openContentHit(resolved, line);
          else handleOpenFile(resolved);
        })
        .catch(() => {
          // Not a real file (or unreachable over SSH) — ignore the click.
        });
    });
  }, [handleOpenFile, openContentHit, home]);

  const insertHistoryCommand = useMemo(
    () =>
      isTerminalTab && activeLeafId !== null
        ? (cmd: string) => {
            writeToSession(activeLeafId, cmd);
            terminalRefs.current.get(activeLeafId)?.focus();
          }
        : null,
    [isTerminalTab, activeLeafId],
  );

  useAiLiveBridge({
    setLive,
    activeId,
    tabs,
    explorerRoot,
    launchCwd,
    home,
    openPreviewTab,
    newAgentTab,
    terminalRefs,
  });

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div
          ref={appRootRef}
          className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground"
        >
          {!zenMode && (
            <Header
              tabs={spaceTabs}
              activeId={activeId}
              onSelect={setActiveId}
              onNew={openNewTab}
              onNewBlock={openNewBlockTab}
              onNewPrivate={openNewPrivateTab}
              onNewSsh={openSshTab}
              sshHosts={sshHosts}
              onNewPreview={() => openPreviewTab("")}
              onNewEditor={() => setNewEditorOpen(true)}
              onNewGitGraph={openGitGraphFromContext}
              onClose={handleClose}
              onPin={pinTab}
              onRename={handleRenameTab}
              onReorder={reorderTabByGap}
              onToggleSidebar={toggleSidebar}
              onOpenCommandPalette={() => openCommandPalette("commands")}
              onActivateAgent={onActivateAgent}
              onActivateLocalAgent={onActivateLocalAgent}
              onOpenSettings={() => void openSettingsWindow()}
              spaceSwitcher={spaceSwitcher}
              searchTarget={searchTarget}
              searchRef={searchInlineRef}
              onOverrideLanguage={setOverrideLanguage}
            />
          )}

          <main className="zoom-content flex min-h-0 flex-1 flex-col">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1"
            >
              <ResizablePanel
                id="sidebar"
                panelRef={sidebarRef}
                defaultSize={
                  initialSidebarCollapsed
                    ? "0px"
                    : `${sidebarWidthRef.current}px`
                }
                minSize={`${SIDEBAR_MIN_WIDTH}px`}
                maxSize={`${SIDEBAR_MAX_WIDTH}px`}
                collapsible
                collapsedSize={0}
                onResize={(size) => {
                  if (size.inPixels > 0) persistSidebarWidth(size.inPixels);
                  persistSidebarCollapsed(size.inPixels <= 0);
                }}
              >
                <div className="flex h-full min-h-0 flex-col border-r border-border/60 bg-card">
                  <div
                    key={sidebarView}
                    className="min-h-0 flex-1 terax-panel-in"
                  >
                    {sidebarView === "explorer" ? (
                      <FileExplorer
                        ref={explorerRef}
                        rootPath={explorerRoot}
                        gitStatus={
                          explorerGitDecorations ? sourceControl.status : null
                        }
                        activeFilePath={explorerActiveFilePath}
                        onOpenFile={handleOpenFile}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={cdInNewTab}
                        onAttachToAgent={handleAttachFileToAgent}
                      />
                    ) : (
                      <SourceControlPanel
                        open
                        sourceControl={sourceControl}
                        onOpenDiff={openGitDiffTab}
                        onOpenGitGraph={openGitGraphFromContext}
                        onOpenFile={handleOpenFile}
                        onNavigateToPath={cdInNewTab}
                        onOpenTerminal={newTab}
                      />
                    )}
                  </div>
                  <SidebarRail
                    activeView={sidebarView}
                    onSelectView={persistSidebarView}
                    changedCount={sourceControl.changedCount}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="relative min-h-0 flex-1">
                    <WorkspaceSurface
                      tabs={tabs}
                      activeId={activeId}
                      activeTab={activeTab}
                      registerTerminalHandle={registerTerminalHandle}
                      onSearchReady={handleSearchReady}
                      onCwd={handleTerminalCwd}
                      onExit={handleLeafExit}
                      onFocusLeaf={handleFocusLeaf}
                      movePane={movePane}
                      registerEditorHandle={registerEditorHandle}
                      onEditorDirtyChange={handleEditorDirty}
                      onEditorCloseTab={disposeTab}
                      registerPreviewHandle={registerPreviewHandle}
                      onPreviewUrlChange={handlePreviewUrl}
                      onAiDiffAccept={(id) => respondToApproval(id, true)}
                      onAiDiffReject={(id) => respondToApproval(id, false)}
                      onOpenCommitFile={openCommitFileDiffTab}
                      onGitHistorySearchHandle={setGitHistoryHandle}
                      onSetDocView={setDocView}
                    />
                  </div>

                  <WorkspaceInputBar
                    isBlockTab={isBlockTab}
                    isTerminalTab={isTerminalTab}
                    activeLeafId={activeLeafId}
                    cwd={activeCwd}
                    home={home}
                    hasComposer={hasComposer}
                    panelOpen={panelOpen}
                    keysLoaded={keysLoaded}
                    onConnect={() => void openSettingsWindow("models")}
                  />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </main>

          {!zenMode && (
            <StatusBar
              cwd={activeCwd}
              filePath={activeFilePath}
              home={home}
              onCd={sendCd}
              onWorkspaceChange={handleWorkspaceChange}
              onOpenMini={openMini}
              hasComposer={hasComposer}
              privateActive={
                activeTab?.kind === "terminal" && activeTab.private === true
              }
              sourceControl={sourceControl}
              activeLeafId={activeLeafId}
              activeWorkspace={activeTerminalTab?.workspace}
              activeTmuxSession={activeTerminalTab?.tmuxSession}
              restartSafeSession={restartSafeSession}
            />
          )}

          <AgentNotificationsBridge
            tabs={tabs}
            activeId={activeId}
            onActivate={onActivateAgent}
          />
          <SshAgentActivityPoller tabs={tabs} />
          <Toaster position="bottom-right" />

          {hasComposer ? (
            <>
              <AgentRunBridge
                openAiDiffTab={openAiDiffTab}
                closeAiDiffTab={closeAiDiffTab}
              />
              <LocalAgentNotificationsBridge />
            </>
          ) : null}

          {hasComposer && miniPresence.mounted ? (
            <AiMiniWindow state={miniPresence.state} />
          ) : null}
          {askPresence.mounted ? (
            <SelectionAskAi
              state={askPresence.state}
              x={askPopup?.x ?? 0}
              y={askPopup?.y ?? 0}
              onAsk={onAskFromSelection}
              onDismiss={() => setAskPopup(null)}
            />
          ) : null}

          {switcherState && (
            <TabSwitcherHud tabs={spaceTabs} state={switcherState} />
          )}

          <CommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
            initialMode={paletteInitialMode}
            commandItems={commandPaletteItems}
            workspaceRoot={explorerRoot}
            onOpenContentHit={openContentHit}
            insertCommand={insertHistoryCommand}
          />

          <AgentMissionControl
            open={missionControlOpen}
            onOpenChange={setMissionControlOpen}
            tabs={tabs}
            onActivate={onActivateAgent}
            onActivateLocal={onActivateLocalAgent}
          />

          <TmuxSessionSwitcher
            target={tmuxTarget}
            onOpenChange={(o) => {
              if (!o) setTmuxTarget(null);
            }}
            onAttachHere={(name) => {
              if (!tmuxTarget) return;
              // Mirror the backend allowlist (is_valid_session_name): the name is
              // spliced into a shell command below, so never rely solely on the
              // picker's UI gate to keep the splice injection-safe.
              if (!isValidSessionName(name)) return;
              const tab = tabsRef.current.find(
                (t) => t.id === tmuxTarget.tabId,
              );
              const alreadyInTmux =
                tab?.kind === "terminal" && Boolean(tab.tmuxSession);
              rebindTmuxSession(tmuxTarget.tabId, name);
              if (alreadyInTmux) {
                // Already inside a tmux session: reconnect attached to the new
                // one (respawn handles the in-tmux case).
                void reattachLeafTmux(tmuxTarget.leafId, name);
              } else {
                // Fresh shell just connected: run the attach over the live
                // connection so there is no ControlMaster teardown race. Record
                // the binding too so a later respawn reattaches instead of
                // dropping back to a plain shell.
                setLeafTmuxBinding(tmuxTarget.leafId, name);
                submitToLeaf(
                  tmuxTarget.leafId,
                  `tmux new-session -A -s '${name}'`,
                );
              }
              setTmuxTarget(null);
            }}
            onOpenInNewTab={(name) => {
              newTmuxTab(name, tmuxTarget?.workspace);
              setTmuxTarget(null);
            }}
            onRenamed={(from, to) => {
              // Keep the tab binding/title and the live session in sync when the
              // currently attached session is renamed, so its label tracks the
              // change and a respawn reattaches to the new name (not a fresh one).
              if (!tmuxTarget) return;
              const tab = tabsRef.current.find(
                (t) => t.id === tmuxTarget.tabId,
              );
              if (tab?.kind === "terminal" && tab.tmuxSession === from) {
                rebindTmuxSession(tmuxTarget.tabId, to);
                setLeafTmuxBinding(tmuxTarget.leafId, to);
              }
            }}
          />

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileTab(path)}
          />

          <CloseDialogs
            tabs={tabs}
            pendingCloseTab={pendingCloseTab}
            onCancelClose={cancelClose}
            onConfirmClose={confirmClose}
            pendingTerminalCloseTab={pendingTerminalCloseTab}
            onCancelTerminalClose={cancelTerminalClose}
            onConfirmTerminalClose={confirmTerminalClose}
            pendingDeleteTabs={pendingDeleteTabs}
            onCancelDeleteClose={cancelDeleteClose}
            onConfirmDeleteClose={confirmDeleteClose}
            pendingAppClose={pendingAppClose}
            onCancelAppClose={cancelAppClose}
            onConfirmAppClose={confirmAppClose}
          />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  return <AiComposerProvider>{shell}</AiComposerProvider>;
}
