import { describe, expect, it } from "vitest";
import {
  activeAfterHide,
  applyGapTarget,
  assignToGroup,
  dissolveGroup,
  type GroupState,
  groupFromTab,
  moveGroupAcrossSpaces,
  moveGroupBlock,
  nextGroupColor,
  normalizeGroupName,
  normalizeGroups,
  planGroupClose,
  removeFromGroup,
  stripLayout,
  type TabGroup,
  tabForSpaceSwitch,
  visibleTabsInSpace,
} from "./tabGroups";
import type { Tab } from "./useTabs";

function term(id: number, groupId?: string, spaceId = "a"): Tab {
  return {
    id,
    kind: "terminal",
    spaceId,
    title: "shell",
    paneTree: { kind: "leaf", id: id * 10 },
    activeLeafId: id * 10,
    ...(groupId ? { groupId } : {}),
  } as Tab;
}

function group(id: string, over: Partial<TabGroup> = {}): TabGroup {
  return { id, spaceId: "a", name: "", color: 0, collapsed: false, ...over };
}

/** The strip of a space in the plan's notation: `G1(2,3)` for a group. */
function strip(state: GroupState, spaceId = "a"): string {
  return stripLayout(state, spaceId)
    .map((item) =>
      item.kind === "tab"
        ? String(item.tab.id)
        : `${item.group.id}(${item.members.map((m) => m.id).join(",")})`,
    )
    .join(" ");
}

function ids(tabs: Tab[]): number[] {
  return tabs.map((t) => t.id);
}

describe("visibleTabsInSpace", () => {
  it("hides members of collapsed groups unless the whole strip is asked for", () => {
    const g1 = group("G1", { collapsed: true });
    const state: GroupState = {
      tabs: [
        term(1),
        term(2, "G1"),
        term(3, "G1"),
        term(4),
        term(5, undefined, "b"),
      ],
      groups: [g1],
    };
    expect(ids(visibleTabsInSpace(state, "a"))).toEqual([1, 4]);
    expect(ids(visibleTabsInSpace(state, "a", { all: true }))).toEqual([
      1, 2, 3, 4,
    ]);

    const open = { ...state, groups: [{ ...g1, collapsed: false }] };
    expect(ids(visibleTabsInSpace(open, "a"))).toEqual([1, 2, 3, 4]);
    expect(ids(visibleTabsInSpace(open, "a", { all: true }))).toEqual([
      1, 2, 3, 4,
    ]);
  });
});

describe("stripLayout", () => {
  it("mixes loose tabs and groups, members in order, other spaces left out", () => {
    const g1 = group("G1", { name: "Messungen" });
    const state: GroupState = {
      tabs: [
        term(1),
        term(2, "G1"),
        term(5, undefined, "b"),
        term(3, "G1"),
        term(4),
      ],
      groups: [g1],
    };
    const items = stripLayout(state, "a");
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({ kind: "tab", tab: state.tabs[0] });
    expect(items[1]).toMatchObject({ kind: "group", group: g1, count: 2 });
    expect(items[1].kind === "group" && ids(items[1].members)).toEqual([2, 3]);
    expect(items[2]).toEqual({ kind: "tab", tab: state.tabs[4] });

    const collapsed = stripLayout(
      { ...state, groups: [{ ...g1, collapsed: true }] },
      "a",
    );
    expect(collapsed[1]).toMatchObject({ kind: "group", count: 2 });
    expect(collapsed[1].kind === "group" && ids(collapsed[1].members)).toEqual([
      2, 3,
    ]);
  });

  it("drops nothing however many groups and tabs there are", () => {
    const tabs: Tab[] = [];
    const groups: TabGroup[] = [];
    let id = 1;
    for (let g = 0; g < 20; g++) {
      groups.push(group(`G${g}`, { color: g % 8 }));
      for (let m = 0; m < 5; m++) tabs.push(term(id++, `G${g}`));
      if (g < 10) tabs.push(term(id++));
    }
    const items = stripLayout({ tabs, groups }, "a");
    expect(items).toHaveLength(30);
    for (const item of items) {
      if (item.kind === "group") expect(item.count).toBe(5);
    }
    expect(items.filter((i) => i.kind === "group")).toHaveLength(20);
  });
});

describe("normalizeGroups", () => {
  it("keeps members together and drops stale references and empty groups", () => {
    const state: GroupState = {
      tabs: [
        term(2, "G1"),
        term(1),
        term(3, "G1"),
        term(4, "g7"),
        term(6, "G1", "b"),
      ],
      groups: [group("G1"), group("G9")],
    };
    const next = normalizeGroups(state);
    expect(ids(next.tabs.filter((t) => t.spaceId === "a"))).toEqual([
      2, 3, 1, 4,
    ]);
    expect(next.tabs.find((t) => t.id === 4)?.groupId).toBeUndefined();
    expect(next.tabs.find((t) => t.id === 6)?.groupId).toBeUndefined();
    expect(next.groups.map((g) => g.id)).toEqual(["G1"]);
  });

  it("returns the same state when nothing needs fixing", () => {
    const state: GroupState = {
      tabs: [term(1), term(2, "G1"), term(3, "G1")],
      groups: [group("G1")],
    };
    expect(normalizeGroups(state)).toBe(state);
  });

  it("keeps other spaces in their array slots", () => {
    const state: GroupState = {
      tabs: [term(2, "G1"), term(7, undefined, "b"), term(1), term(3, "G1")],
      groups: [group("G1")],
    };
    expect(ids(normalizeGroups(state).tabs)).toEqual([2, 7, 3, 1]);
  });
});

describe("groupFromTab", () => {
  it("opens a fresh group at the tab, leaving its old group", () => {
    const state: GroupState = {
      tabs: [term(1), term(2, "G1"), term(3, "G1"), term(4, "G2")],
      groups: [group("G1", { color: 0 }), group("G2", { color: 1 })],
    };
    const next = groupFromTab(state, 3, "g9");
    expect(strip(next)).toBe("1 G1(2) g9(3) G2(4)");
    expect(next.groups.find((g) => g.id === "g9")).toEqual({
      id: "g9",
      spaceId: "a",
      name: "",
      color: 2,
      collapsed: false,
    });
    expect(next.tabs.filter((t) => t.id === 3).map((t) => t.groupId)).toEqual([
      "g9",
    ]);
  });

  it("does nothing for a missing tab", () => {
    const state: GroupState = { tabs: [term(1)], groups: [] };
    expect(groupFromTab(state, 99, "g9")).toBe(state);
  });
});

describe("assignToGroup", () => {
  const state: GroupState = {
    tabs: [
      term(1),
      term(2, "G1"),
      term(3, "G2"),
      term(4),
      term(5, undefined, "b"),
    ],
    groups: [group("G1"), group("G2", { color: 1 })],
  };

  it("makes the tab the last member", () => {
    expect(strip(assignToGroup(state, 4, "G1"))).toBe("1 G1(2,4) G2(3)");
  });

  it("drops the group the tab leaves empty", () => {
    const next = assignToGroup(state, 3, "G1");
    expect(strip(next)).toBe("1 G1(2,3) 4");
    expect(next.groups.map((g) => g.id)).toEqual(["G1"]);
  });

  it("refuses a tab from another space", () => {
    expect(assignToGroup(state, 5, "G1")).toBe(state);
  });

  it("keeps the target group's collapsed state", () => {
    const folded = {
      ...state,
      groups: [group("G1", { collapsed: true }), state.groups[1]],
    };
    expect(assignToGroup(folded, 4, "G1").groups[0].collapsed).toBe(true);
  });
});

describe("removeFromGroup", () => {
  it("puts the tab right behind its former group", () => {
    const state: GroupState = {
      tabs: [term(1), term(2, "G1"), term(3, "G1"), term(4, "G1"), term(5)],
      groups: [group("G1")],
    };
    const next = removeFromGroup(state, 2);
    expect(strip(next)).toBe("1 G1(3,4) 2 5");
  });

  it("removes the group with its last member", () => {
    const state: GroupState = {
      tabs: [term(1), term(2, "G1"), term(5)],
      groups: [group("G1")],
    };
    const next = removeFromGroup(state, 2);
    expect(strip(next)).toBe("1 2 5");
    expect(next.groups).toEqual([]);
  });
});

describe("dissolveGroup", () => {
  it("leaves every member loose in place", () => {
    const state: GroupState = {
      tabs: [term(1), term(2, "G1"), term(3, "G1"), term(4)],
      groups: [group("G1", { collapsed: true })],
    };
    const next = dissolveGroup(state, "G1");
    expect(strip(next)).toBe("1 2 3 4");
    expect(next.groups).toEqual([]);
    expect(next.tabs.every((t) => t.groupId === undefined)).toBe(true);
  });
});

describe("nextGroupColor", () => {
  it("picks the first colour the space does not wear yet", () => {
    const groups = [
      group("A", { color: 0 }),
      group("B", { color: 1 }),
      group("C", { color: 3 }),
      group("D", { color: 2, spaceId: "b" }),
    ];
    expect(nextGroupColor(groups, "a")).toBe(2);
  });

  it("starts over at the least worn colour once all are taken", () => {
    const eight = Array.from({ length: 8 }, (_, c) =>
      group(`G${c}`, { color: c }),
    );
    expect(nextGroupColor(eight, "a")).toBe(0);
    expect(nextGroupColor([...eight, group("G8", { color: 0 })], "a")).toBe(1);
  });
});

describe("normalizeGroupName", () => {
  const emoji = "\u{1F600}";

  it("trims and caps at 32 UTF-16 units without splitting a character", () => {
    expect(normalizeGroupName("  Messungen  ")).toBe("Messungen");
    expect(normalizeGroupName("")).toBe("");
    expect(normalizeGroupName("   ")).toBe("");
    expect(normalizeGroupName("x".repeat(40))).toBe("x".repeat(32));
    expect(normalizeGroupName(`${"x".repeat(31)}${emoji}`)).toBe(
      "x".repeat(31),
    );
    const fits = `${"x".repeat(30)}${emoji}`;
    expect(fits).toHaveLength(32);
    expect(normalizeGroupName(fits)).toBe(fits);
  });

  it("is stable when applied again", () => {
    const once = normalizeGroupName(`${"x".repeat(31)} ${emoji}`);
    expect(normalizeGroupName(once)).toBe(once);
  });

  it("lets two groups share a name", () => {
    const state: GroupState = {
      tabs: [term(1, "G1"), term(2, "G2")],
      groups: [group("G1", { name: "Same" }), group("G2", { name: "Same" })],
    };
    expect(normalizeGroups(state)).toBe(state);
  });
});

describe("activeAfterHide", () => {
  it("prefers the next visible tab to the right, skipping collapsed groups", () => {
    const state: GroupState = {
      tabs: [term(1), term(2, "G1"), term(3, "G1"), term(4, "G2"), term(5)],
      groups: [group("G1"), group("G2", { collapsed: true })],
    };
    expect(activeAfterHide(state, "G1")).toBe(5);
  });

  it("falls back to the left", () => {
    const state: GroupState = {
      tabs: [term(1), term(2, "G1"), term(3, "G1")],
      groups: [group("G1")],
    };
    expect(activeAfterHide(state, "G1")).toBe(1);
  });

  it("asks for a new terminal when nothing stays visible", () => {
    const state: GroupState = {
      tabs: [term(2, "G1"), term(3, "G1"), term(4, "G2")],
      groups: [group("G1"), group("G2", { collapsed: true })],
    };
    expect(activeAfterHide(state, "G1")).toBe("new-terminal");
  });
});

describe("applyGapTarget", () => {
  const tabs = [term(1), term(2, "G1"), term(3, "G1"), term(4)];
  const open: GroupState = { tabs, groups: [group("G1")] };
  const folded: GroupState = {
    tabs,
    groups: [group("G1", { collapsed: true })],
  };
  const t4 = tabs[3];

  it("joins the group at a gap inside it", () => {
    const next = applyGapTarget(open, t4, {
      index: 3,
      groupId: "G1",
      onCollapsedHeader: false,
    });
    expect(strip(next)).toBe("1 G1(2,4,3)");
  });

  it("stays loose at a gap outside any group", () => {
    const next = applyGapTarget(open, t4, {
      index: 0,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(strip(next)).toBe("4 1 G1(2,3)");
  });

  it("places a new tab, such as a broken-out pane", () => {
    const next = applyGapTarget(open, term(9), {
      index: 3,
      groupId: "G1",
      onCollapsedHeader: false,
    });
    expect(strip(next)).toBe("1 G1(2,9,3) 4");
  });

  it("treats the gap before a collapsed header as before the group", () => {
    const next = applyGapTarget(folded, t4, {
      index: 1,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(strip(next)).toBe("1 4 G1(2,3)");
  });

  it("makes a tab dropped on a collapsed header its last member, still collapsed", () => {
    const next = applyGapTarget(folded, t4, {
      index: 1,
      groupId: "G1",
      onCollapsedHeader: true,
    });
    expect(strip(next)).toBe("1 G1(2,3,4)");
    expect(next.groups[0].collapsed).toBe(true);
  });

  it("leaves a member loose at the gap before its own header", () => {
    const next = applyGapTarget(open, tabs[1], {
      index: 1,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(strip(next)).toBe("1 2 G1(3) 4");
  });
});

describe("moveGroupBlock", () => {
  const state: GroupState = {
    tabs: [
      term(1),
      term(2, "G1"),
      term(3, "G1"),
      term(4, "G2"),
      term(5, "G2"),
      term(6),
    ],
    groups: [group("G1"), group("G2", { color: 1 })],
  };

  it("moves the block to the end", () => {
    const next = moveGroupBlock(state, "G1", {
      index: 8,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(strip(next)).toBe("1 G2(4,5) 6 G1(2,3)");
  });

  it("counts a gap inside another group as the gap right behind it", () => {
    const next = moveGroupBlock(state, "G1", {
      index: 6,
      groupId: "G2",
      onCollapsedHeader: false,
    });
    expect(strip(next)).toBe("1 G2(4,5) G1(2,3) 6");
  });

  it("moves the block to the front, keeping order and collapsed state", () => {
    const folded = {
      ...state,
      groups: [group("G1", { collapsed: true }), state.groups[1]],
    };
    const next = moveGroupBlock(folded, "G1", {
      index: 0,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(strip(next)).toBe("G1(2,3) 1 G2(4,5) 6");
    expect(next.groups.find((g) => g.id === "G1")?.collapsed).toBe(true);
  });
});

describe("moveGroupAcrossSpaces", () => {
  const g1 = group("G1", { name: "Messungen", color: 4, collapsed: true });

  it("puts the group at the end of the target strip with its metadata", () => {
    const state: GroupState = {
      tabs: [term(1), term(2, "G1"), term(3, "G1"), term(7, undefined, "b")],
      groups: [g1],
    };
    const move = moveGroupAcrossSpaces(state, "G1", "b", 1);
    expect(strip(move.state, "b")).toBe("7 G1(2,3)");
    expect(strip(move.state, "a")).toBe("1");
    expect(move.state.groups[0]).toEqual({ ...g1, spaceId: "b" });
    expect(move.sourceEmptied).toBe(false);
    expect(move.activeMoved).toBe(false);
  });

  it("reports an emptied source space and a moved active tab", () => {
    const state: GroupState = {
      tabs: [term(2, "G1"), term(3, "G1"), term(7, undefined, "b")],
      groups: [g1],
    };
    const move = moveGroupAcrossSpaces(state, "G1", "b", 3);
    expect(move.sourceEmptied).toBe(true);
    expect(move.activeMoved).toBe(true);
  });
});

describe("tabForSpaceSwitch", () => {
  const folded = group("G1", { collapsed: true });

  it("picks the last visible tab of the space", () => {
    const state: GroupState = {
      tabs: [
        term(1),
        term(2),
        term(3, "G1"),
        term(4, "G1"),
        term(9, undefined, "b"),
      ],
      groups: [folded],
    };
    expect(tabForSpaceSwitch(state, "a", 9)).toBe(2);
    expect(tabForSpaceSwitch(state, "a", 1)).toBe(1);
    expect(tabForSpaceSwitch(state, "c", 9)).toBeNull();
  });

  it("falls back to the last tab when none is visible", () => {
    const state: GroupState = {
      tabs: [term(3, "G1"), term(4, "G1"), term(9, undefined, "b")],
      groups: [folded],
    };
    expect(tabForSpaceSwitch(state, "a", 9)).toBe(4);
  });
});

describe("planGroupClose", () => {
  const tabs = [term(1), term(2, "G1"), term(3, "G1"), term(4, "G1")];

  it("counts members and those that need confirming", () => {
    expect(planGroupClose(tabs, "G1", new Set([3, 9]))).toEqual({
      groupId: "G1",
      memberIds: [2, 3, 4],
      n: 3,
      m: 1,
    });
    expect(planGroupClose(tabs, "G1", new Set())).toEqual({
      groupId: "G1",
      memberIds: [2, 3, 4],
      n: 3,
      m: 0,
    });
  });

  it("is null for an unknown group", () => {
    expect(planGroupClose(tabs, "nope", new Set())).toBeNull();
  });
});
