// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveState = vi.fn((_id: string, _state: unknown) => Promise.resolve());
const hiddenListeners = new Set<(hidden: boolean) => void>();

vi.mock("./store", () => ({
  saveState: (id: string, state: unknown) => saveState(id, state),
}));
vi.mock("./useSpaces", () => ({
  useSpaces: { getState: () => ({ initialActiveIndex: {} }) },
}));
vi.mock("@/lib/windowVisibility", () => ({
  subscribeWindowHidden: (fn: (hidden: boolean) => void) => {
    hiddenListeners.add(fn);
    return () => hiddenListeners.delete(fn);
  },
}));

import type { TabGroup } from "@/modules/tabs/lib/tabGroups";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import type { SpaceState } from "./store";
import { useSpacePersistence } from "./useSpacePersistence";

function term(id: number, over: Partial<Tab> = {}): Tab {
  return {
    id,
    kind: "terminal",
    spaceId: "a",
    title: `t${id}`,
    paneTree: { kind: "leaf", id: id * 10, cwd: `/w/${id}` },
    activeLeafId: id * 10,
    ...over,
  } as Tab;
}

const g1 = (over: Partial<TabGroup> = {}): TabGroup => ({
  id: "G1",
  spaceId: "a",
  name: "one",
  color: 2,
  collapsed: false,
  ...over,
});

const tabs = [term(1), term(2, { groupId: "G1" }), term(3, { groupId: "G1" })];

type Props = { groups: TabGroup[]; tabs?: Tab[] };

function setup(initial: TabGroup[]) {
  const hook = renderHook(
    (p: Props) =>
      useSpacePersistence({
        tabs: p.tabs ?? tabs,
        groups: p.groups,
        activeId: 1,
        activeSpaceId: "a",
        enabled: true,
      }),
    { initialProps: { groups: initial } },
  );
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(saveState).toHaveBeenCalledTimes(1);
  saveState.mockClear();
  return hook;
}

function lastWrite(): SpaceState {
  const call = saveState.mock.lastCall;
  if (!call) throw new Error("nothing written");
  return call[1] as SpaceState;
}

describe("useSpacePersistence with groups", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveState.mockClear();
  });
  afterEach(() => {
    cleanup();
    hiddenListeners.clear();
    vi.useRealTimers();
  });

  it("writes a rename, a recolour and a collapse alone after the delay, once each", () => {
    const hook = setup([g1()]);
    const steps: Array<[Partial<TabGroup>, Record<string, unknown>]> = [
      [{ name: "two" }, { name: "two", color: 2 }],
      [
        { name: "two", color: 5 },
        { name: "two", color: 5 },
      ],
      [
        { name: "two", color: 5, collapsed: true },
        { name: "two", color: 5, collapsed: true },
      ],
    ];
    for (const [change, written] of steps) {
      hook.rerender({ groups: [g1(change)] });
      act(() => {
        vi.advanceTimersByTime(2999);
      });
      expect(saveState).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(saveState).toHaveBeenCalledTimes(1);
      expect(saveState.mock.calls[0][0]).toBe("a");
      expect(lastWrite().groups).toEqual([written]);
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(saveState).toHaveBeenCalledTimes(1);
      saveState.mockClear();
    }
  });

  it("does not write when the groups are new but equal objects", () => {
    const hook = setup([g1()]);
    hook.rerender({ groups: [g1()] });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(saveState).not.toHaveBeenCalled();
  });

  it("writes a pending group change at once on blur", () => {
    const hook = setup([g1()]);
    hook.rerender({ groups: [g1({ name: "blurred" })] });
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(lastWrite().groups?.[0].name).toBe("blurred");
  });

  it("writes a pending group change at once when the window hides", () => {
    const hook = setup([g1()]);
    hook.rerender({ groups: [g1({ collapsed: true })] });
    act(() => {
      for (const fn of hiddenListeners) fn(true);
    });
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(lastWrite().groups?.[0].collapsed).toBe(true);
  });

  it("writes a pending group change at once before unload", () => {
    const hook = setup([g1()]);
    hook.rerender({ groups: [g1({ color: 7 })] });
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(saveState).toHaveBeenCalledTimes(1);
    expect(lastWrite().groups?.[0].color).toBe(7);
  });

  it("writes each space's groups only under that space's state", () => {
    const both = [
      term(1, { groupId: "G1" }),
      term(2, { spaceId: "b", groupId: "G2" }),
    ];
    renderHook(() =>
      useSpacePersistence({
        tabs: both,
        groups: [g1(), { ...g1({ name: "bee" }), id: "G2", spaceId: "b" }],
        activeId: 1,
        activeSpaceId: "a",
        enabled: true,
      }),
    );
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const byId = new Map(
      saveState.mock.calls.map(([id, st]) => [id, st as SpaceState]),
    );
    expect([...byId.keys()].sort()).toEqual(["a", "b"]);
    expect(byId.get("a")?.groups?.map((g) => g.name)).toEqual(["one"]);
    expect(byId.get("b")?.groups?.map((g) => g.name)).toEqual(["bee"]);
  });
});
