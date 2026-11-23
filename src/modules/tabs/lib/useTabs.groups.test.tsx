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
import { leafIds, type PaneNode } from "@/modules/terminal/lib/panes";
import { disposeSession } from "@/modules/terminal/lib/useTerminalSession";
import { stripLayout, type TabGroup } from "./tabGroups";
import {
  type BreakOutRefusal,
  type BrokenOutPane,
  nextActiveInSpace,
  pickTabBySpaceIndex,
  type Tab,
  type TerminalTab,
  useTabs,
} from "./useTabs";

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

function split(n: number, a: number, b: number, groupId?: string): Tab {
  const tree: PaneNode = {
    kind: "split",
    id: 9000 + n,
    dir: "row",
    children: [
      { kind: "leaf", id: a },
      { kind: "leaf", id: b },
    ],
  };
  return {
    ...(term(n, groupId) as TerminalTab),
    paneTree: tree,
    activeLeafId: a,
  };
}

function editor(
  n: number,
  path: string,
  preview: boolean,
  groupId?: string,
): Tab {
  return {
    id: t(n),
    kind: "editor",
    spaceId: "a",
    title: path,
    path,
    dirty: false,
    preview,
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

/** NFR-4: members contiguous, no empty group, active tab never hidden. */
function violations(s: Snapshot): string[] {
  const out: string[] = [];
  for (const g of s.groups) {
    const inSpace = s.tabs.filter((x) => x.spaceId === g.spaceId);
    const at = inSpace
      .map((x, i) => (x.groupId === g.id ? i : -1))
      .filter((i) => i >= 0);
    if (at.length === 0) out.push(`${g.id} has no member`);
    else if (at[at.length - 1] - at[0] !== at.length - 1)
      out.push(`${g.id} is not contiguous`);
  }
  const active = s.tabs.find((x) => x.id === s.activeId);
  const hiding = s.groups.find((g) => g.id === active?.groupId);
  if (hiding?.collapsed) out.push(`active tab hidden in ${hiding.id}`);
  return out;
}

function setup(tabs: Tab[], groups: TabGroup[], active: number) {
  const renders: Snapshot[] = [];
  const hook = renderHook(() => {
    const r = useTabs();
    renders.push({ tabs: r.tabs, groups: r.groups, activeId: r.activeId });
    return r;
  });
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
  const run = (fn: () => void) => act(fn);
  return { api, now, run, renders };
}

function find(s: Snapshot, id: number): Tab {
  const tab = s.tabs.find((x) => x.id === id);
  if (!tab) throw new Error(`tab ${id} is gone`);
  return tab;
}

function groupOf(s: Snapshot, id: string): TabGroup | undefined {
  return s.groups.find((g) => g.id === id);
}

beforeEach(() => {
  useSpaces
    .getState()
    .hydrate([{ id: "a" } as SpaceMeta, { id: "b" } as SpaceMeta], "a");
});

afterEach(() => {
  cleanup();
  vi.mocked(disposeSession).mockClear();
});

describe("useTabs groups: membership", () => {
  it("creates a group at the tab's place and returns its id", () => {
    const h = setup([term(1), term(2), term(3)], [], t(1));
    let id: string | null = null;
    h.run(() => {
      id = h.api().createGroupFromTab(t(2));
    });
    expect(id).not.toBeNull();
    const g = groupOf(h.now(), id as unknown as string);
    expect(g).toMatchObject({ name: "", color: 0, collapsed: false });
    expect(strip(h.now())).toBe(`t1 ${id}(t2) t3`);
    expect(h.now().activeId).toBe(t(1));
  });

  it("adds a tab as last member and keeps a collapsed group collapsed", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3)],
      [group("G1", { collapsed: true })],
      t(1),
    );
    h.run(() => h.api().addTabToGroup(t(3), "G1"));
    expect(strip(h.now())).toBe("t1 G1c(t2,t3)");
    expect(h.now().activeId).toBe(t(1));
  });

  it("moves the active tab on when it joins a collapsed group", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3)],
      [group("G1", { collapsed: true })],
      t(3),
    );
    h.run(() => h.api().addTabToGroup(t(3), "G1", "/work"));
    expect(strip(h.now())).toBe("t1 G1c(t2,t3)");
    expect(h.now().activeId).toBe(t(1));
  });

  it("spawns a terminal when joining leaves nothing visible", () => {
    const h = setup(
      [term(2, "G1"), term(3)],
      [group("G1", { collapsed: true })],
      t(3),
    );
    h.run(() => h.api().addTabToGroup(t(3), "G1", "/work"));
    const s = h.now();
    expect(strip(s)).toBe("G1c(t2,t3) new");
    const fresh = find(s, s.activeId);
    expect(fresh.kind).toBe("terminal");
    expect(fresh.kind === "terminal" && fresh.cwd).toBe("/work");
    expect(fresh.groupId).toBeUndefined();
  });

  it("puts a removed tab right behind its group", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3, "G1"), term(4)],
      [group("G1")],
      t(1),
    );
    h.run(() => h.api().removeTabFromGroup(t(2)));
    expect(strip(h.now())).toBe("t1 G1(t3) t2 t4");
  });

  it("ungroups in place and keeps the active tab", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3, "G1"), term(4)],
      [group("G1")],
      t(3),
    );
    h.run(() => h.api().ungroup("G1"));
    expect(strip(h.now())).toBe("t1 t2 t3 t4");
    expect(h.now().groups).toEqual([]);
    expect(h.now().activeId).toBe(t(3));
  });

  it("normalizes names and falls back to the first colour", () => {
    const h = setup([term(1, "G1")], [group("G1")], t(1));
    h.run(() => h.api().renameGroup("G1", "  Messungen  "));
    expect(groupOf(h.now(), "G1")?.name).toBe("Messungen");
    h.run(() => h.api().renameGroup("G1", "x".repeat(40)));
    expect(groupOf(h.now(), "G1")?.name).toBe("x".repeat(32));
    h.run(() => h.api().setGroupColor("G1", 5));
    expect(groupOf(h.now(), "G1")?.color).toBe(5);
    h.run(() => h.api().setGroupColor("G1", 9));
    expect(groupOf(h.now(), "G1")?.color).toBe(0);
  });
});

describe("useTabs groups: collapsing", () => {
  it("moves the active tab on when its group collapses, keeping members mounted", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3, "G1"), term(4)],
      [group("G1")],
      t(3),
    );
    const before = h.now();
    h.run(() => h.api().toggleGroupCollapsed("G1"));
    const s = h.now();
    expect(groupOf(s, "G1")?.collapsed).toBe(true);
    expect(s.activeId).toBe(t(4));
    for (const n of [2, 3]) {
      const tab = find(s, t(n)) as TerminalTab;
      expect(tab.cold).toBeFalsy();
      expect(tab.paneTree).toBe((find(before, t(n)) as TerminalTab).paneTree);
    }
    h.run(() => h.api().toggleGroupCollapsed("G1"));
    expect(groupOf(h.now(), "G1")?.collapsed).toBe(false);
    expect(h.now().activeId).toBe(t(4));
  });

  it("spawns a terminal when collapsing hides the whole space", () => {
    const h = setup([term(2, "G1"), term(3, "G1")], [group("G1")], t(2));
    h.run(() => h.api().toggleGroupCollapsed("G1", "/work"));
    const s = h.now();
    expect(strip(s)).toBe("G1c(t2,t3) new");
    const fresh = find(s, s.activeId);
    expect(fresh.kind === "terminal" && fresh.cwd).toBe("/work");
    expect(fresh.groupId).toBeUndefined();
  });

  it("expands the group of a tab that becomes active, in the same commit", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3, "G1")],
      [group("G1", { collapsed: true })],
      t(1),
    );
    h.run(() => h.api().setActiveId(t(3)));
    expect(h.now().activeId).toBe(t(3));
    expect(groupOf(h.now(), "G1")?.collapsed).toBe(false);
    expect(h.renders.flatMap(violations)).toEqual([]);
  });

  it("expands the group of an already open file", () => {
    const h = setup(
      [term(1), editor(2, "/a.ts", false, "G1"), term(3, "G1")],
      [group("G1", { collapsed: true })],
      t(1),
    );
    h.run(() => {
      h.api().openFileTab("/a.ts");
    });
    expect(h.now().activeId).toBe(t(2));
    expect(groupOf(h.now(), "G1")?.collapsed).toBe(false);
    expect(h.renders.flatMap(violations)).toEqual([]);
  });

  it("expands only the active tab's group when state is replaced", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3, "G1"), term(4, "G2")],
      [group("G1", { collapsed: true }), group("G2", { collapsed: true })],
      t(3),
    );
    expect(groupOf(h.now(), "G1")?.collapsed).toBe(false);
    expect(groupOf(h.now(), "G2")?.collapsed).toBe(true);
    expect(h.now().activeId).toBe(t(3));
  });

  it("skips collapsed members when selecting by index", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3, "G1"), term(4)],
      [group("G1", { collapsed: true })],
      t(1),
    );
    h.run(() => h.api().selectByIndex(1, "a"));
    expect(h.now().activeId).toBe(t(4));
    h.run(() => h.api().selectByIndex(2, "a"));
    expect(h.now().activeId).toBe(t(4));
    expect(pickTabBySpaceIndex([term(1), term(2), term(3)], 1, "a")?.id).toBe(
      t(2),
    );
  });

  it("sees the collapse queued in the same update when closing a tab", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3, "G1"), term(4)],
      [group("G1")],
      t(4),
    );
    h.run(() => {
      h.api().toggleGroupCollapsed("G1");
      h.api().closeTab(t(4));
    });
    expect(groupOf(h.now(), "G1")?.collapsed).toBe(true);
    expect(h.now().activeId).toBe(t(1));
  });
});

describe("useTabs groups: closing", () => {
  const collapsed = [group("G1", { collapsed: true })];

  it("prefers a visible successor and keeps the group collapsed", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3, "G1"), term(4)],
      collapsed,
      t(4),
    );
    h.run(() => h.api().closeTab(t(4)));
    expect(h.now().activeId).toBe(t(1));
    expect(groupOf(h.now(), "G1")?.collapsed).toBe(true);
  });

  it("falls back to the nearest collapsed tab and expands its group", () => {
    const left = setup(
      [term(2, "G1"), term(3, "G1"), term(4)],
      collapsed,
      t(4),
    );
    left.run(() => left.api().closeTab(t(4)));
    expect(left.now().activeId).toBe(t(3));
    expect(groupOf(left.now(), "G1")?.collapsed).toBe(false);
    cleanup();
    const right = setup(
      [term(4), term(2, "G1"), term(3, "G1")],
      collapsed,
      t(4),
    );
    right.run(() => right.api().closeTab(t(4)));
    expect(right.now().activeId).toBe(t(2));
    expect(groupOf(right.now(), "G1")?.collapsed).toBe(false);
  });

  it("refuses a successor only for the last tab of a space", () => {
    const tabs = [term(2, "G1"), term(3, "G1"), term(4)];
    expect(nextActiveInSpace(tabs, t(4), collapsed)).not.toBeNull();
    expect(nextActiveInSpace([term(4)], t(4), collapsed)).toBeNull();
    expect(
      nextActiveInSpace([term(4), term(7, undefined, "b")], t(4), collapsed),
    ).toBeNull();
  });

  it("closes a whole group and spawns a terminal for an emptied space", () => {
    const h = setup([term(2, "G1"), term(3, "G1")], [group("G1")], t(2));
    h.run(() => h.api().closeGroup("G1", "/work"));
    const s = h.now();
    expect(strip(s)).toBe("new");
    const fresh = find(s, s.activeId);
    expect(fresh.kind === "terminal" && fresh.cwd).toBe("/work");
    expect(groupOf(s, "G1")).toBeUndefined();
    const disposed = vi.mocked(disposeSession).mock.calls.map((c) => c[0]);
    expect(disposed).toEqual([t(2) * 10, t(3) * 10]);
  });

  it("activates a neighbour after closing a group, expanding a collapsed one", () => {
    const loose = setup(
      [term(1), term(2, "G1"), term(3, "G1")],
      [group("G1")],
      t(2),
    );
    loose.run(() => loose.api().closeGroup("G1", "/work"));
    expect(strip(loose.now())).toBe("t1");
    expect(loose.now().activeId).toBe(t(1));
    cleanup();
    const grouped = setup(
      [term(5, "G2"), term(2, "G1"), term(3, "G1")],
      [group("G2", { collapsed: true }), group("G1")],
      t(2),
    );
    grouped.run(() => grouped.api().closeGroup("G1", "/work"));
    expect(grouped.now().activeId).toBe(t(5));
    expect(groupOf(grouped.now(), "G2")?.collapsed).toBe(false);
    expect(groupOf(grouped.now(), "G1")).toBeUndefined();
  });
});

describe("useTabs groups: dragging and moving", () => {
  const base = () => [term(1), term(2, "G1"), term(3, "G1"), term(4)];

  it("sets membership from the gap a tab is dropped into", () => {
    const into = setup(base(), [group("G1")], t(1));
    into.run(() =>
      into.api().reorderTabByGap(t(4), {
        index: 3,
        groupId: "G1",
        onCollapsedHeader: false,
      }),
    );
    expect(strip(into.now())).toBe("t1 G1(t2,t4,t3)");
    cleanup();
    const out = setup(base(), [group("G1")], t(1));
    out.run(() =>
      out.api().reorderTabByGap(t(2), {
        index: 5,
        groupId: null,
        onCollapsedHeader: false,
      }),
    );
    expect(strip(out.now())).toBe("t1 G1(t3) t4 t2");
  });

  it("keeps the group of a merge target and drops the merged source", () => {
    const a = setup(base(), [group("G1")], t(1));
    a.run(() => {
      a.api().mergeTabInto(t(4), t(2));
    });
    expect(strip(a.now())).toBe("t1 G1(t2,t3)");
    expect(leafIds((find(a.now(), t(2)) as TerminalTab).paneTree)).toHaveLength(
      2,
    );
    cleanup();
    const b = setup(base(), [group("G1")], t(1));
    b.run(() => {
      b.api().mergeTabInto(t(3), t(1));
    });
    expect(strip(b.now())).toBe("t1 G1(t2) t4");
    expect(leafIds((find(b.now(), t(1)) as TerminalTab).paneTree)).toHaveLength(
      2,
    );
  });

  it("moves the active tab on when it is dropped on a collapsed header", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3)],
      [group("G1", { collapsed: true })],
      t(3),
    );
    h.run(() =>
      h.api().reorderTabByGap(t(3), {
        index: 1,
        groupId: "G1",
        onCollapsedHeader: true,
      }),
    );
    expect(strip(h.now())).toBe("t1 G1c(t2,t3)");
    expect(h.now().activeId).toBe(t(1));
  });

  it("moves a group as a block", () => {
    const h = setup(
      [term(1), term(2, "G1"), term(3, "G1"), term(4), term(5)],
      [group("G1")],
      t(1),
    );
    h.run(() =>
      h.api().moveGroupByGap("G1", {
        index: 6,
        groupId: null,
        onCollapsedHeader: false,
      }),
    );
    expect(strip(h.now())).toBe("t1 t4 t5 G1(t2,t3)");
    expect(groupOf(h.now(), "G1")?.collapsed).toBe(false);
  });

  it("moves a group to another space without following it", () => {
    const meta = { name: "Messungen", color: 4, collapsed: true };
    const tabs = [
      term(1),
      term(2, "G1"),
      term(3, "G1"),
      term(7, undefined, "b"),
    ];
    const h = setup(tabs, [group("G1", meta)], t(1));
    h.run(() => h.api().moveGroupToSpace("G1", "b"));
    expect(strip(h.now(), "b")).toBe("t7 G1c(t2,t3)");
    expect(groupOf(h.now(), "G1")).toMatchObject({ ...meta, spaceId: "b" });
    expect(strip(h.now(), "a")).toBe("t1");
    expect(h.now().activeId).toBe(t(1));
    expect(useSpaces.getState().activeId).toBe("a");
    cleanup();
    const open = setup(tabs, [group("G1")], t(2));
    open.run(() => open.api().moveGroupToSpace("G1", "b"));
    expect(open.now().activeId).toBe(t(1));
  });

  it("spawns a terminal in an emptied source space and ignores bad targets", () => {
    const tabs = [term(2, "G1"), term(3, "G1"), term(7, undefined, "b")];
    const h = setup(tabs, [group("G1")], t(2));
    const before = h.now();
    h.run(() => h.api().moveGroupToSpace("G1", "a"));
    h.run(() => h.api().moveGroupToSpace("G1", "zz"));
    expect(h.now().tabs).toBe(before.tabs);
    expect(h.now().groups).toBe(before.groups);
    h.run(() => h.api().moveGroupToSpace("G1", "b", "/work"));
    const s = h.now();
    expect(strip(s, "a")).toBe("new");
    const fresh = find(s, s.activeId);
    expect(fresh.spaceId).toBe("a");
    expect(fresh.kind === "terminal" && fresh.cwd).toBe("/work");
    expect(useSpaces.getState().activeId).toBe("a");
  });

  it("breaks a pane out into the gap's group and undoes it", () => {
    const h = setup(
      [term(1), split(2, 1021, 1022, "G1"), term(3, "G1")],
      [group("G1")],
      t(2),
    );
    let out: BrokenOutPane | BreakOutRefusal = "collapsed";
    h.run(() => {
      out = h.api().breakOutPane(1022, {
        index: 3,
        groupId: "G1",
        onCollapsedHeader: false,
      });
    });
    if (typeof out === "string") throw new Error(`refused: ${out}`);
    const record: BrokenOutPane = out;
    expect(strip(h.now())).toBe("t1 G1(t2,new,t3)");
    expect(h.now().activeId).toBe(record.tabId);
    h.run(() => {
      h.api().undoBreakOutPane(record);
    });
    expect(strip(h.now())).toBe("t1 G1(t2,t3)");
    expect(leafIds((find(h.now(), t(2)) as TerminalTab).paneTree)).toEqual([
      1021, 1022,
    ]);
  });

  it("drops the group membership when a tab changes space", () => {
    const tabs = [
      term(1),
      term(2, "G1"),
      term(3, "G1"),
      term(7, undefined, "b"),
    ];
    const h = setup(tabs, [group("G1")], t(1));
    h.run(() => {
      h.api().moveTabToSpace(t(3), "b");
    });
    expect(find(h.now(), t(3))).toMatchObject({ spaceId: "b" });
    expect(find(h.now(), t(3)).groupId).toBeUndefined();
    expect(strip(h.now(), "a")).toBe("t1 G1(t2)");
    cleanup();
    const r = setup(tabs, [group("G1")], t(1));
    r.run(() => {
      r.api().reorderTab(t(2), t(7), "bottom");
    });
    expect(strip(r.now(), "b")).toBe("t7 t2");
    expect(find(r.now(), t(2)).groupId).toBeUndefined();
  });

  it("reports following the last tab of a space into its new one", () => {
    const h = setup([term(3), term(7, undefined, "b")], [], t(3));
    let follow = false;
    h.run(() => {
      follow = h.api().moveTabToSpace(t(3), "b");
    });
    expect(follow).toBe(true);
  });

  it("takes the target's group in the space overview", () => {
    const a = setup(base(), [group("G1")], t(1));
    a.run(() => {
      a.api().reorderTab(t(4), t(2), "top");
    });
    expect(strip(a.now())).toBe("t1 G1(t4,t2,t3)");
    cleanup();
    const b = setup(base(), [group("G1")], t(1));
    b.run(() => {
      b.api().reorderTab(t(2), t(4), "bottom");
    });
    expect(strip(b.now())).toBe("t1 G1(t3) t4 t2");
  });
});

describe("useTabs groups: a group disappears with its last member", () => {
  const ops: Array<[string, (api: ReturnType<typeof useTabs>) => void]> = [
    ["closeTab", (api) => api.closeTab(t(2))],
    ["removeTabFromGroup", (api) => api.removeTabFromGroup(t(2))],
    ["moveTabToSpace", (api) => void api.moveTabToSpace(t(2), "b")],
    ["mergeTabInto", (api) => void api.mergeTabInto(t(2), t(1))],
    [
      "reorderTabByGap",
      (api) =>
        api.reorderTabByGap(t(2), {
          index: 0,
          groupId: null,
          onCollapsedHeader: false,
        }),
    ],
  ];
  for (const [name, op] of ops) {
    it(name, () => {
      const h = setup([term(1), term(2, "G1")], [group("G1")], t(1));
      h.run(() => op(h.api()));
      expect(h.now().groups).toEqual([]);
    });
  }

  it("removeTabsForSpace", () => {
    const h = setup(
      [
        term(1),
        term(7, undefined, "b"),
        term(8, "G5", "b"),
        term(9, "G5", "b"),
      ],
      [group("G5", { spaceId: "b" })],
      t(1),
    );
    h.run(() => h.api().removeTabsForSpace("b", "a"));
    expect(h.now().tabs.map((x) => x.id)).toEqual([t(1)]);
    expect(h.now().groups).toEqual([]);
  });
});

describe("useTabs groups: new tabs next to a group", () => {
  it("places a replacing preview loose behind the group it stood in", () => {
    const h = setup(
      [term(1), editor(2, "/a.ts", true, "G1"), term(3, "G1")],
      [group("G1")],
      t(1),
    );
    h.run(() => {
      h.api().openFileTab("/b.ts", false);
    });
    expect(strip(h.now())).toBe("t1 G1(t3) new");
    cleanup();
    const last = setup(
      [term(1), editor(2, "/a.ts", true, "G1")],
      [group("G1")],
      t(1),
    );
    last.run(() => {
      last.api().openFileTab("/b.ts", false);
    });
    expect(strip(last.now())).toBe("t1 new");
    expect(last.now().groups).toEqual([]);
  });

  it("appends a new terminal loose behind the group", () => {
    const h = setup(
      [term(1), editor(2, "/a.ts", true, "G1"), term(3, "G1")],
      [group("G1")],
      t(1),
    );
    h.run(() => {
      h.api().newTab();
    });
    expect(strip(h.now())).toBe("t1 G1(t2,t3) new");
  });
});

describe("useTabs groups: consistency", () => {
  it("holds after every step of a mixed sequence", () => {
    const h = setup(
      [term(1), term(2), term(3), term(4), term(7, undefined, "b")],
      [],
      t(1),
    );
    let g = "";
    h.run(() => {
      g = h.api().createGroupFromTab(t(2)) ?? "";
    });
    expect(g).not.toBe("");
    const steps: Array<() => void> = [
      () => h.api().addTabToGroup(t(4), g),
      () => h.api().setActiveId(t(4)),
      () => h.api().toggleGroupCollapsed(g),
      () => h.api().toggleGroupCollapsed(g),
      () =>
        h.api().reorderTabByGap(t(1), {
          index: 2,
          groupId: g,
          onCollapsedHeader: false,
        }),
      () => h.api().removeTabFromGroup(t(2)),
      () => void h.api().moveTabToSpace(t(3), "b"),
      () => h.api().closeTab(t(4)),
    ];
    for (const step of steps) {
      h.run(step);
      expect(violations(h.now())).toEqual([]);
    }
    expect(h.renders.flatMap(violations)).toEqual([]);
  });
});
