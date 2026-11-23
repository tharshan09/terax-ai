// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab, TabGroup } from "@/modules/tabs";

const foreground = vi.fn((_leaf: number) => Promise.resolve(false));
const nextActive = vi.fn(
  (tabs: Tab[], closingId: number, _groups?: TabGroup[]) => {
    const closing = tabs.find((t) => t.id === closingId);
    if (!closing) return null;
    const same = tabs.filter((t) => t.spaceId === closing.spaceId);
    return same.length > 1
      ? (same.find((t) => t.id !== closingId)?.id ?? null)
      : null;
  },
);

vi.mock("@/modules/terminal", () => ({
  leafHasForegroundProcess: (leaf: number) => foreground(leaf),
  leafIds: (tree: { id: number }) => [tree.id],
}));
vi.mock("@/modules/tabs", () => ({
  nextActiveInSpace: (tabs: Tab[], id: number, groups?: TabGroup[]) =>
    nextActive(tabs, id, groups),
}));

import { closeConfirmReason, useTabCloseGuards } from "./useTabCloseGuards";

function terminal(id: number, groupId?: string, spaceId = "a"): Tab {
  return {
    id,
    kind: "terminal",
    title: `t${id}`,
    spaceId,
    groupId,
    paneTree: { kind: "leaf", id: id * 10 },
    activeLeafId: id * 10,
  } as Tab;
}

function editor(id: number, dirty: boolean, groupId?: string): Tab {
  return {
    id,
    kind: "editor",
    title: `e${id}`,
    spaceId: "a",
    groupId,
    path: `/f${id}`,
    dirty,
    preview: false,
  } as Tab;
}

function group(id: string, collapsed = false): TabGroup {
  return { id, spaceId: "a", name: "", color: 0, collapsed };
}

function setup(tabs: Tab[], groups: TabGroup[]) {
  const disposeTab = vi.fn();
  const disposeGroup = vi.fn();
  const hook = renderHook(() =>
    useTabCloseGuards({ tabs, groups, disposeTab, disposeGroup }),
  );
  return { ...hook, disposeTab, disposeGroup };
}

describe("closeConfirmReason", () => {
  beforeEach(() => {
    foreground.mockReset();
  });

  it("flags a dirty editor as unsaved and a clean one as free", async () => {
    expect(await closeConfirmReason(editor(2, true))).toBe("unsaved");
    expect(await closeConfirmReason(editor(2, false))).toBeNull();
  });

  it("flags a terminal with a foreground process", async () => {
    foreground.mockResolvedValue(true);
    expect(await closeConfirmReason(terminal(3))).toBe("process");
    foreground.mockResolvedValue(false);
    expect(await closeConfirmReason(terminal(3))).toBeNull();
  });

  it("treats a failed process check as a running process", async () => {
    foreground.mockRejectedValue(new Error("gone"));
    expect(await closeConfirmReason(terminal(3))).toBe("process");
  });
});

describe("useTabCloseGuards group close", () => {
  afterEach(cleanup);
  beforeEach(() => {
    foreground.mockReset();
    foreground.mockResolvedValue(false);
    nextActive.mockClear();
  });

  it("asks once for the whole group when members need confirmation", async () => {
    foreground.mockImplementation((leaf) => Promise.resolve(leaf === 30));
    const tabs = [
      terminal(1),
      editor(2, true, "g1"),
      terminal(3, "g1"),
      terminal(4, "g1"),
    ];
    const { result, disposeGroup } = setup(tabs, [group("g1")]);
    await act(() => result.current.requestCloseGroup("g1"));
    expect(result.current.pendingGroupClose).toEqual({
      groupId: "g1",
      memberIds: [2, 3, 4],
      n: 3,
      m: 2,
    });
    expect(disposeGroup).not.toHaveBeenCalled();
    expect(result.current.pendingCloseTab).toBeNull();
    expect(result.current.pendingTerminalCloseTab).toBeNull();
  });

  it("closes a quiet group at once", async () => {
    const tabs = [terminal(1), terminal(3, "g1"), terminal(4, "g1")];
    const { result, disposeGroup } = setup(tabs, [group("g1")]);
    await act(() => result.current.requestCloseGroup("g1"));
    expect(disposeGroup).toHaveBeenCalledTimes(1);
    expect(disposeGroup).toHaveBeenCalledWith("g1");
    expect(result.current.pendingGroupClose).toBeNull();
  });

  it("closes the group on confirm", async () => {
    foreground.mockResolvedValue(true);
    const tabs = [terminal(1), terminal(3, "g1")];
    const { result, disposeGroup } = setup(tabs, [group("g1")]);
    await act(() => result.current.requestCloseGroup("g1"));
    expect(result.current.pendingGroupClose).not.toBeNull();
    act(() => result.current.confirmGroupClose());
    expect(disposeGroup).toHaveBeenCalledTimes(1);
    expect(disposeGroup).toHaveBeenCalledWith("g1");
    expect(result.current.pendingGroupClose).toBeNull();
  });

  it("leaves everything as is on cancel", async () => {
    foreground.mockResolvedValue(true);
    const tabs = [terminal(1), terminal(3, "g1")];
    const { result, disposeGroup, disposeTab } = setup(tabs, [group("g1")]);
    await act(() => result.current.requestCloseGroup("g1"));
    act(() => result.current.cancelGroupClose());
    expect(disposeGroup).not.toHaveBeenCalled();
    expect(disposeTab).not.toHaveBeenCalled();
    expect(result.current.pendingGroupClose).toBeNull();
  });

  it("counts a member whose process check fails", async () => {
    foreground.mockRejectedValue(new Error("gone"));
    const tabs = [terminal(1), terminal(3, "g1")];
    const { result, disposeGroup } = setup(tabs, [group("g1")]);
    await act(() => result.current.requestCloseGroup("g1"));
    expect(result.current.pendingGroupClose).toMatchObject({ n: 1, m: 1 });
    expect(disposeGroup).not.toHaveBeenCalled();
  });
});

describe("useTabCloseGuards single close", () => {
  afterEach(cleanup);
  beforeEach(() => {
    foreground.mockReset();
    nextActive.mockClear();
  });

  it("routes each tab through closeConfirmReason and passes the groups on", async () => {
    foreground.mockImplementation((leaf) => Promise.resolve(leaf === 30));
    const groups = [group("g1", true)];
    const tabs = [terminal(1), editor(2, true), terminal(3), terminal(5, "g1")];
    const { result, disposeTab } = setup(tabs, groups);

    await act(() => result.current.handleClose(2));
    expect(result.current.pendingCloseTab).toBe(2);
    act(() => result.current.cancelClose());

    await act(() => result.current.handleClose(3));
    expect(result.current.pendingTerminalCloseTab).toBe(3);
    act(() => result.current.cancelTerminalClose());

    await act(() => result.current.handleClose(1));
    expect(disposeTab).toHaveBeenCalledTimes(1);
    expect(disposeTab).toHaveBeenCalledWith(1);
    expect(nextActive).toHaveBeenLastCalledWith(tabs, 1, groups);
  });
});
