import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import type { SidebarViewId } from "./types";

export const SIDEBAR_DEFAULT_WIDTH = 260;
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_WIDTH_STORAGE_KEY = "terax.sidebar.width";
const SIDEBAR_VIEW_STORAGE_KEY = "terax.sidebar.view";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "terax.sidebar.collapsed";

export function shouldPersistSidebarWidth(
  width: number,
  isUserInteraction: boolean,
): boolean {
  return isUserInteraction && width > 0;
}

function clampSidebarWidth(width: number): number {
  return Math.min(
    SIDEBAR_MAX_WIDTH,
    Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)),
  );
}

function readSidebarWidth(): number {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed)
      ? clampSidebarWidth(parsed)
      : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function readSidebarView(): SidebarViewId {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
    if (stored === "explorer" || stored === "source-control") return stored;
  } catch {
    // ignore
  }
  return "explorer";
}

function readSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

type FocusableExplorer = {
  focus: () => void;
  isFocused: () => boolean;
};

export function useSidebarPanel(
  explorerRef: RefObject<FocusableExplorer | null>,
) {
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const sidebarWidthRef = useRef(readSidebarWidth());
  const sidebarWidthWriteTimerRef = useRef(0);
  const explorerReturnFocusRef = useRef<HTMLElement | null>(null);
  const [sidebarView, setSidebarViewState] =
    useState<SidebarViewId>(readSidebarView);
  const [initialSidebarCollapsed] = useState(readSidebarCollapsed);
  const collapsedRef = useRef(initialSidebarCollapsed);
  // The collapsed panel stays mounted at 0 px; its consumers stop background
  // work (fs watchers, git status refreshes) while it is not on screen.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    initialSidebarCollapsed,
  );

  const persistSidebarView = useCallback((view: SidebarViewId) => {
    setSidebarViewState(view);
    try {
      window.localStorage.setItem(SIDEBAR_VIEW_STORAGE_KEY, view);
    } catch {
      // storage may fail in private mode
    }
  }, []);

  // Set between collapseForZen and restoreAfterZen: what the sidebar looked
  // like before zen. While set, collapse state changes are not persisted, so
  // zen never overwrites the user's choice for the next launch.
  const beforeZenRef = useRef<{ collapsed: boolean } | null>(null);

  const persistSidebarCollapsed = useCallback((collapsed: boolean) => {
    if (collapsedRef.current === collapsed) return;
    collapsedRef.current = collapsed;
    setSidebarCollapsed(collapsed);
    if (beforeZenRef.current) return;
    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        collapsed ? "1" : "0",
      );
    } catch {
      // storage may fail in private mode
    }
  }, []);

  // Zen hides the sidebar by collapsing it to 0 px (the explorer stays
  // mounted). The collapse is mirrored in `sidebarCollapsed` right away, so
  // watchers and git refreshes pause as for any collapse, but it is not
  // written to storage.
  const collapseForZen = useCallback(() => {
    if (beforeZenRef.current) return;
    const panel = sidebarRef.current;
    const open = panel ? panel.getSize().inPixels > 0 : !collapsedRef.current;
    beforeZenRef.current = { collapsed: !open };
    if (!open) return;
    collapsedRef.current = true;
    setSidebarCollapsed(true);
    panel?.collapse();
  }, []);

  // Leaving zen restores the sidebar as it was before: open at the width the
  // user last set (the one persisted, so display and storage agree), or still
  // collapsed (no resize) if it was collapsed.
  const restoreAfterZen = useCallback(() => {
    const before = beforeZenRef.current;
    if (!before) return;
    beforeZenRef.current = null;
    const panel = sidebarRef.current;
    if (before.collapsed) {
      // Opened by hand during zen: back to the collapsed state that storage
      // still holds.
      if (panel && panel.getSize().inPixels > 0) panel.collapse();
      return;
    }
    collapsedRef.current = false;
    setSidebarCollapsed(false);
    panel?.resize(`${sidebarWidthRef.current}px`);
  }, []);

  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.resize(`${sidebarWidthRef.current}px`);
    else p.collapse();
  }, []);

  const cycleSidebarView = useCallback(
    (view: SidebarViewId) => {
      const panel = sidebarRef.current;
      const collapsed = panel ? panel.getSize().asPercentage <= 0 : false;
      if (collapsed) {
        if (panel) panel.resize(`${sidebarWidthRef.current}px`);
        if (view !== sidebarView) persistSidebarView(view);
        return;
      }
      if (view === sidebarView) {
        panel?.collapse();
        return;
      }
      persistSidebarView(view);
    },
    [persistSidebarView, sidebarView],
  );

  const persistSidebarWidth = useCallback(
    (next: number, isUserInteraction: boolean) => {
      if (!shouldPersistSidebarWidth(next, isUserInteraction)) return;
      sidebarWidthRef.current = next;
      if (sidebarWidthWriteTimerRef.current) {
        window.clearTimeout(sidebarWidthWriteTimerRef.current);
      }
      sidebarWidthWriteTimerRef.current = window.setTimeout(() => {
        sidebarWidthWriteTimerRef.current = 0;
        try {
          window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
        } catch {
          // ignore
        }
      }, 200);
    },
    [],
  );

  useEffect(() => {
    return () => {
      if (sidebarWidthWriteTimerRef.current) {
        window.clearTimeout(sidebarWidthWriteTimerRef.current);
      }
    };
  }, []);

  const toggleExplorerFocus = useCallback(() => {
    const explorer = explorerRef.current;
    const panel = sidebarRef.current;
    const collapsed = panel ? panel.getSize().asPercentage <= 0 : false;
    if (sidebarView !== "explorer" || collapsed) {
      if (panel && collapsed) panel.resize(`${sidebarWidthRef.current}px`);
      if (sidebarView !== "explorer") persistSidebarView("explorer");
      const active = document.activeElement;
      explorerReturnFocusRef.current =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
      requestAnimationFrame(() => explorerRef.current?.focus());
      return;
    }
    if (!explorer) return;
    if (explorer.isFocused()) {
      const target = explorerReturnFocusRef.current;
      explorerReturnFocusRef.current = null;
      if (target && document.body.contains(target)) {
        target.focus();
      } else {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      return;
    }
    const active = document.activeElement;
    explorerReturnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    explorer.focus();
  }, [explorerRef, persistSidebarView, sidebarView]);

  return {
    sidebarRef,
    sidebarWidthRef,
    sidebarView,
    sidebarCollapsed,
    initialSidebarCollapsed,
    persistSidebarView,
    persistSidebarCollapsed,
    collapseForZen,
    restoreAfterZen,
    toggleSidebar,
    cycleSidebarView,
    persistSidebarWidth,
    toggleExplorerFocus,
  };
}
