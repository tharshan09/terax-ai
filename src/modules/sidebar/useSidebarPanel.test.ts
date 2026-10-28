// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { createRef } from "react";
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
import { shouldPersistSidebarWidth, useSidebarPanel } from "./useSidebarPanel";

const explorerRef = createRef<{
  focus: () => void;
  isFocused: () => boolean;
}>();

const callsOf = (cmd: string) =>
  invoke.mock.calls.filter(([name]) => name === cmd).map(([, args]) => args);

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((cmd: string) =>
    Promise.resolve(cmd === "fs_read_dir" ? [] : undefined),
  );
  window.localStorage.clear();
});

afterEach(cleanup);

describe("shouldPersistSidebarWidth", () => {
  it("only persists a positive width from direct user interaction", () => {
    expect(shouldPersistSidebarWidth(320, true)).toBe(true);
    expect(shouldPersistSidebarWidth(320, false)).toBe(false);
    expect(shouldPersistSidebarWidth(0, true)).toBe(false);
  });
});

describe("useSidebarPanel collapsed state", () => {
  // [AC-3]
  it("starts collapsed on the first render when storage says so", () => {
    window.localStorage.setItem("terax.sidebar.collapsed", "1");
    const seen: boolean[] = [];
    renderHook(() => {
      const panel = useSidebarPanel(explorerRef);
      seen.push(panel.sidebarCollapsed);
      return panel;
    });
    expect(seen[0]).toBe(true);
  });

  it("mirrors collapse and expand as state", () => {
    const { result } = renderHook(() => useSidebarPanel(explorerRef));
    expect(result.current.sidebarCollapsed).toBe(false);
    act(() => result.current.persistSidebarCollapsed(true));
    expect(result.current.sidebarCollapsed).toBe(true);
    expect(window.localStorage.getItem("terax.sidebar.collapsed")).toBe("1");
    act(() => result.current.persistSidebarCollapsed(false));
    expect(result.current.sidebarCollapsed).toBe(false);
  });

  // [AC-3]
  it("keeps an explorer that starts collapsed free of watches until it opens", async () => {
    window.localStorage.setItem("terax.sidebar.collapsed", "1");
    const { result } = renderHook(() => {
      const panel = useSidebarPanel(explorerRef);
      useFileTree("/collapsed-ws", { visible: !panel.sidebarCollapsed });
      return panel;
    });
    await act(async () => {});
    expect(callsOf("fs_watch_add")).toEqual([]);
    expect(callsOf("fs_read_dir")).toEqual([]);

    await act(async () => result.current.persistSidebarCollapsed(false));
    expect(callsOf("fs_watch_add")).toEqual([
      { paths: ["/collapsed-ws"], workspace: { kind: "local" } },
    ]);
    expect(callsOf("fs_read_dir")).toHaveLength(1);
  });

  it("re-reads only the root and expanded folders when the sidebar opens again", async () => {
    const dir = (name: string) => ({
      name,
      kind: "dir",
      size: 0,
      mtime: 0,
      gitignored: false,
    });
    invoke.mockImplementation((cmd: string, args: { path?: string }) =>
      Promise.resolve(
        cmd !== "fs_read_dir"
          ? undefined
          : args.path === "/reopen-ws"
            ? [dir("open"), dir("closed")]
            : [],
      ),
    );
    const { result } = renderHook(() => {
      const panel = useSidebarPanel(explorerRef);
      const tree = useFileTree("/reopen-ws", {
        visible: !panel.sidebarCollapsed,
      });
      return { panel, tree };
    });
    await act(async () => {});
    await act(async () => result.current.tree.toggle("/reopen-ws/open"));
    await act(async () => result.current.tree.toggle("/reopen-ws/closed"));
    await act(async () => result.current.tree.toggle("/reopen-ws/closed"));
    expect(result.current.tree.nodes["/reopen-ws/closed"]?.status).toBe(
      "loaded",
    );

    await act(async () => result.current.panel.persistSidebarCollapsed(true));
    invoke.mockClear();
    await act(async () => result.current.panel.persistSidebarCollapsed(false));
    const reread = callsOf("fs_read_dir").map(
      (args) => (args as { path: string }).path,
    );
    expect(reread.sort()).toEqual(["/reopen-ws", "/reopen-ws/open"]);
  });
});
