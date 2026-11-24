// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/terminal/lib/useTerminalSession", () => ({
  disposeSession: vi.fn(),
}));
vi.mock("@/modules/terminal/lib/tmux", () => ({
  killTmuxSession: vi.fn(),
  listTmuxSessions: vi.fn(() => Promise.resolve([])),
  sanitizeSessionName: (n: string) => n,
  isValidSessionName: (n: string) => n.length > 0,
}));

import type { SpaceMeta } from "@/modules/spaces/lib/store";
import { useSpaces } from "@/modules/spaces/lib/useSpaces";
import { stripLayout, type TabGroup } from "./tabGroups";
import { type Tab, useTabs } from "./useTabs";

/** Plan tab `tN` is id 100 + N, clear of the ids the hook allocates. */
const t = (n: number) => 100 + n;

function term(n: number, groupId?: string, spaceId = "a"): Tab {
  return {
    id: t(n),
    kind: "terminal",
    spaceId,
    title: "shell",
    paneTree: { kind: "leaf", id: t(n) * 10 },
    activeLeafId: t(n) * 10,
    ...(groupId ? { groupId } : {}),
  } as Tab;
}

function group(id: string, over: Partial<TabGroup> = {}): TabGroup {
  return { id, spaceId: "a", name: "", color: 0, collapsed: false, ...over };
}

const label = (id: number) => (id > 100 ? `t${id - 100}` : "new");

type Snapshot = { tabs: Tab[]; groups: TabGroup[]; activeId: number };

/** A space's strip in the plan's notation; `c` marks a collapsed group. */
function strip(s: Snapshot, spaceId = "a"): string {
  return stripLayout(s, spaceId)
    .map((item) =>
      item.kind === "tab"
        ? label(item.tab.id)
        : `${item.group.id}${item.group.collapsed ? "c" : ""}(${item.members
            .map((m) => label(m.id))
            .join(",")})`,
    )
    .join(" ");
}

function setup(tabs: Tab[], groups: TabGroup[], active: number) {
  const hook = renderHook(() => useTabs());
  act(() => {
    hook.result.current.setActiveSpaceForNewTabs("a");
    hook.result.current.replaceTabs(tabs, active, groups);
  });
  const api = () => hook.result.current;
  const now = (): Snapshot => ({
    tabs: api().tabs,
    groups: api().groups,
    activeId: api().activeId,
  });
  return { api, now, run: (fn: () => void) => act(fn) };
}

function find(s: Snapshot, id: number): Tab {
  const tab = s.tabs.find((x) => x.id === id);
  if (!tab) throw new Error(`tab ${id} is gone`);
  return tab;
}

beforeEach(() => {
  useSpaces
    .getState()
    .hydrate([{ id: "a" } as SpaceMeta, { id: "b" } as SpaceMeta], "a");
});

afterEach(cleanup);

describe("useTabs groups: reorder in the space overview", () => {
  it("keeps a collapsed target group collapsed and moves the active tab on", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3, "G1"), term(4)],
      [group("G1", { collapsed: true })],
      t(4),
    );
    h.run(() => {
      h.api().reorderTab(t(4), t(2), "top");
    });
    const s = h.now();
    expect(strip(s)).toBe("t1 G1c(t4,t2,t3)");
    expect(s.activeId).toBe(t(1));
  });

  it("spawns a terminal in the folder given when nothing else is visible", () => {
    const h = setup(
      [term(2, "G1"), term(3)],
      [group("G1", { collapsed: true })],
      t(3),
    );
    h.run(() => {
      h.api().reorderTab(t(3), t(2), "bottom", "/work");
    });
    const s = h.now();
    expect(strip(s)).toBe("G1c(t2,t3) new");
    const fresh = find(s, s.activeId);
    expect(fresh.kind).toBe("terminal");
    expect(fresh.kind === "terminal" && fresh.cwd).toBe("/work");
    expect(fresh.groupId).toBeUndefined();
  });

  it("across spaces, leaves its group and takes the target's space and group", () => {
    const h = setup(
      [
        term(1),
        term(2, "G1"),
        term(3, "G1"),
        term(7, "G2", "b"),
        term(8, "G2", "b"),
      ],
      [group("G1"), group("G2", { spaceId: "b" })],
      t(1),
    );
    h.run(() => {
      h.api().reorderTab(t(2), t(7), "bottom");
    });
    const s = h.now();
    expect(strip(s, "a")).toBe("t1 G1(t3)");
    expect(strip(s, "b")).toBe("G2(t7,t2,t8)");
    expect(find(s, t(2))).toMatchObject({ spaceId: "b", groupId: "G2" });
    expect(s.activeId).toBe(t(1));
  });

  it("across spaces, expands the collapsed group its successor lies in", () => {
    const h = setup(
      [term(2, "G1"), term(3, "G1"), term(4), term(7, undefined, "b")],
      [group("G1", { collapsed: true })],
      t(4),
    );
    const before = h.now().tabs.length;
    h.run(() => {
      h.api().reorderTab(t(4), t(7), "bottom");
    });
    const s = h.now();
    expect(strip(s, "a")).toBe("G1(t2,t3)");
    expect(s.activeId).toBe(t(3));
    expect(s.tabs).toHaveLength(before);
    expect(find(s, t(4)).spaceId).toBe("b");
  });
});
