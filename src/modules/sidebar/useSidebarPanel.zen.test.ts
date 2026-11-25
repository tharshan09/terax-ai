// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { createRef } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    listen: () => Promise.resolve(() => {}),
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => ({ kind: "local" }),
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (select: (s: object) => unknown) =>
    select({ showHidden: false, explorerGitDecorations: false }),
}));

import { useFileTree } from "@/modules/explorer/lib/useFileTree";
import { useSidebarPanel } from "./useSidebarPanel";

const explorerRef = createRef<{
  focus: () => void;
  isFocused: () => boolean;
}>();

/**
 * Stand-in for the react-resizable-panels handle. Like the real panel it only
 * changes its size; the collapse state reaches the hook the way App wires it,
 * through `persistSidebarCollapsed` from the panel's `onResize` (`report`).
 */
function fakePanel(initialPx: number) {
  let px = initialPx;
  const resizeCalls: (number | string)[] = [];
  const collapse = vi.fn(() => {
    px = 0;
  });
  const handle: PanelImperativeHandle = {
    collapse,
    expand: vi.fn(),
    getSize: () => ({ inPixels: px, asPercentage: px > 0 ? px / 12 : 0 }),
    isCollapsed: () => px <= 0,
    resize: (size) => {
      resizeCalls.push(size);
      px = Number.parseInt(String(size), 10);
    },
  };
  return { handle, collapse, resizeCalls, px: () => px };
}

function mountWithPanel(initialPx: number) {
  const panel = fakePanel(initialPx);
  const hook = renderHook(() => useSidebarPanel(explorerRef));
  hook.result.current.sidebarRef.current = panel.handle;
  // What App's `onResize` does after every size change.
  const report = () =>
    act(() => hook.result.current.persistSidebarCollapsed(panel.px() <= 0));
  return { ...hook, panel, report };
}

const stored = (key: string) => window.localStorage.getItem(key);

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((cmd: string) =>
    Promise.resolve(cmd === "fs_read_dir" ? [] : undefined),
  );
  window.localStorage.clear();
});

afterEach(cleanup);

describe("useSidebarPanel in zen", () => {
  it("[AC-9] collapses for zen without persisting and restores 300px after", () => {
    window.localStorage.setItem("terax.sidebar.width", "300");
    window.localStorage.setItem("terax.sidebar.collapsed", "0");
    const { result, panel, report } = mountWithPanel(300);
    expect(result.current.sidebarCollapsed).toBe(false);

    act(() => result.current.collapseForZen());
    expect(panel.collapse).toHaveBeenCalledTimes(1);
    report(); // the panel now reports 0 px
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(stored("terax.sidebar.collapsed")).toBe("0");
    expect(stored("terax.sidebar.width")).toBe("300");

    act(() => result.current.restoreAfterZen());
    expect(panel.resizeCalls).toEqual(["300px"]);
    report(); // the panel now reports 300 px
    expect(result.current.sidebarCollapsed).toBe(false);
    expect(stored("terax.sidebar.collapsed")).toBe("0");
    expect(stored("terax.sidebar.width")).toBe("300");
  });

  it("[AC-9] keeps a sidebar collapsed before zen collapsed, without a resize", () => {
    window.localStorage.setItem("terax.sidebar.width", "300");
    window.localStorage.setItem("terax.sidebar.collapsed", "1");
    const { result, panel, report } = mountWithPanel(0);
    expect(result.current.sidebarCollapsed).toBe(true);

    act(() => result.current.collapseForZen());
    report();
    act(() => result.current.restoreAfterZen());
    report();
    expect(panel.collapse).not.toHaveBeenCalled();
    expect(panel.resizeCalls).toEqual([]);
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(stored("terax.sidebar.collapsed")).toBe("1");
  });

  it("[AC-9] mirrors the zen collapse in sidebarCollapsed right away (watchers pause)", async () => {
    const { result } = renderHook(() => {
      const panel = useSidebarPanel(explorerRef);
      useFileTree("/zen-ws", { visible: !panel.sidebarCollapsed });
      return panel;
    });
    const panel = fakePanel(300);
    result.current.sidebarRef.current = panel.handle;
    await act(async () => {});
    expect(
      invoke.mock.calls.filter(([cmd]) => cmd === "fs_watch_add"),
    ).toHaveLength(1);

    // No onResize report: the state must not wait for the panel.
    await act(async () => result.current.collapseForZen());
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(
      invoke.mock.calls
        .filter(([cmd]) => cmd === "fs_watch_remove")
        .map(([, args]) => args),
    ).toEqual([{ paths: ["/zen-ws"], workspace: { kind: "local" } }]);
  });

  it("[AC-9] restores the width the user last set, not the one measured at zen start", () => {
    window.localStorage.setItem("terax.sidebar.width", "300");
    // The panel shows 340 px without a user resize (e.g. a layout change).
    const { result, panel, report } = mountWithPanel(340);
    act(() => result.current.collapseForZen());
    report();
    act(() => result.current.restoreAfterZen());
    expect(panel.resizeCalls).toEqual(["300px"]);
    expect(stored("terax.sidebar.width")).toBe("300");
  });

  it("[AC-9] shows the stored width after zen when the user resized during zen", () => {
    vi.useFakeTimers();
    try {
      window.localStorage.setItem("terax.sidebar.width", "300");
      const { result, panel, report } = mountWithPanel(300);
      act(() => result.current.collapseForZen());
      report();
      // A user resize during zen persists 400 px.
      act(() => result.current.persistSidebarWidth(400, true));
      act(() => vi.runAllTimers());
      expect(stored("terax.sidebar.width")).toBe("400");
      act(() => result.current.restoreAfterZen());
      expect(panel.resizeCalls).toEqual(["400px"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("[AC-9] persists collapse changes again once zen is over", () => {
    window.localStorage.setItem("terax.sidebar.collapsed", "0");
    const { result, panel, report } = mountWithPanel(300);
    act(() => result.current.collapseForZen());
    report();
    act(() => result.current.restoreAfterZen());
    report();
    // The user collapses the sidebar by hand after zen.
    act(() => panel.handle.collapse());
    report();
    expect(stored("terax.sidebar.collapsed")).toBe("1");
  });

  it("[AC-9] does not persist a sidebar opened by hand during zen and closes it again after", () => {
    window.localStorage.setItem("terax.sidebar.width", "300");
    window.localStorage.setItem("terax.sidebar.collapsed", "1");
    const { result, panel, report } = mountWithPanel(0);
    act(() => result.current.collapseForZen());
    act(() => result.current.toggleSidebar()); // opens to 300 px during zen
    report();
    expect(result.current.sidebarCollapsed).toBe(false);
    expect(stored("terax.sidebar.collapsed")).toBe("1");

    act(() => result.current.restoreAfterZen());
    report();
    expect(panel.collapse).toHaveBeenCalledTimes(1);
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(stored("terax.sidebar.collapsed")).toBe("1");
  });

  it("[AC-9] ignores a second collapseForZen and a restore outside zen", () => {
    window.localStorage.setItem("terax.sidebar.width", "300");
    const { result, panel, report } = mountWithPanel(300);
    act(() => result.current.restoreAfterZen());
    expect(panel.resizeCalls).toEqual([]);
    act(() => result.current.collapseForZen());
    report();
    act(() => result.current.collapseForZen());
    act(() => result.current.restoreAfterZen());
    expect(panel.resizeCalls).toEqual(["300px"]);
  });
});
