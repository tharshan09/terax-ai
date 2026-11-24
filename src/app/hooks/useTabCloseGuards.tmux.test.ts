// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab, TabGroup } from "@/modules/tabs";
import type { ForegroundCheck } from "@/modules/terminal/lib/useTerminalSession";
import type { PaneNode } from "@/modules/terminal/lib/panes";

// Not mounted: the process check of every leaf sees nothing.
const foreground = vi.fn(
  (_leaf: number): Promise<ForegroundCheck> => Promise.resolve("idle"),
);

vi.mock("@/modules/terminal", () => ({
  leafIds: (tree: PaneNode) => {
    const out: number[] = [];
    const walk = (n: PaneNode) => {
      if (n.kind === "leaf") out.push(n.id);
      else n.children.forEach(walk);
    };
    walk(tree);
    return out;
  },
}));
vi.mock("@/modules/terminal/lib/useTerminalSession", () => ({
  leafForegroundCheck: (leaf: number) => foreground(leaf),
}));
vi.mock("@/modules/tabs", () => ({
  nextActiveInSpace: (tabs: Tab[], id: number) => {
    const closing = tabs.find((t) => t.id === id);
    const other = tabs.find(
      (t) => t.id !== id && t.spaceId === closing?.spaceId,
    );
    return other?.id ?? null;
  },
}));

import { useTabCloseGuards } from "./useTabCloseGuards";

function terminal(
  id: number,
  groupId?: string,
  bind: { tab?: string; pane?: string } = {},
): Tab {
  const paneTree: PaneNode = bind.pane
    ? {
        kind: "split",
        id: id * 100,
        dir: "row",
        children: [
          { kind: "leaf", id: id * 10 },
          { kind: "leaf", id: id * 10 + 1, tmuxSession: bind.pane },
        ],
      }
    : { kind: "leaf", id: id * 10 };
  return {
    id,
    kind: "terminal",
    title: `t${id}`,
    spaceId: "a",
    groupId,
    paneTree,
    activeLeafId: id * 10,
    ...(bind.tab ? { tmuxSession: bind.tab } : {}),
  } as Tab;
}

const group = (id: string): TabGroup => ({
  id,
  spaceId: "a",
  name: "",
  color: 0,
  collapsed: false,
});

function setup(tabs: Tab[]) {
  const disposeTab = vi.fn();
  const disposeGroup = vi.fn();
  const hook = renderHook(() =>
    useTabCloseGuards({
      tabs,
      groups: [group("g1")],
      disposeTab,
      disposeGroup,
    }),
  );
  return { ...hook, disposeTab, disposeGroup };
}

describe("useTabCloseGuards: tmux-bound group members", () => {
  afterEach(cleanup);
  beforeEach(() => {
    foreground.mockReset();
    foreground.mockResolvedValue("idle");
  });

  it("asks before closing a group whose unmounted member is bound to tmux", async () => {
    const tabs = [
      terminal(1),
      terminal(2, "g1", { tab: "terax-abc" }),
      terminal(3, "g1"),
    ];
    const { result, disposeGroup } = setup(tabs);
    await act(() => result.current.requestCloseGroup("g1"));
    expect(result.current.pendingGroupClose).toEqual({
      groupId: "g1",
      memberIds: [2, 3],
      n: 2,
      m: 1,
    });
    expect(disposeGroup).not.toHaveBeenCalled();
  });

  it("counts a member with a single tmux-bound pane", async () => {
    const tabs = [
      terminal(1),
      terminal(2, "g1", { pane: "work" }),
      terminal(3, "g1", { tab: "terax-x", pane: "terax-x" }),
    ];
    const { result, disposeGroup } = setup(tabs);
    await act(() => result.current.requestCloseGroup("g1"));
    expect(result.current.pendingGroupClose).toMatchObject({ n: 2, m: 2 });
    expect(disposeGroup).not.toHaveBeenCalled();
  });

  it("closes a group without tmux binding and without anything running at once", async () => {
    const tabs = [terminal(1), terminal(2, "g1"), terminal(3, "g1")];
    const { result, disposeGroup } = setup(tabs);
    await act(() => result.current.requestCloseGroup("g1"));
    expect(disposeGroup).toHaveBeenCalledTimes(1);
    expect(disposeGroup).toHaveBeenCalledWith("g1");
    expect(result.current.pendingGroupClose).toBeNull();
  });

  it("closes a single idle tmux-bound tab as before, without asking", async () => {
    const tabs = [terminal(1), terminal(2, "g1", { tab: "terax-abc" })];
    const { result, disposeTab } = setup(tabs);
    await act(() => result.current.handleClose(2));
    expect(disposeTab).toHaveBeenCalledTimes(1);
    expect(disposeTab).toHaveBeenCalledWith(2);
    expect(result.current.pendingTerminalCloseTab).toBeNull();
    expect(result.current.pendingGroupClose).toBeNull();
  });
});
