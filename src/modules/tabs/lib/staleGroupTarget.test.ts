import { describe, expect, it } from "vitest";
import {
  applyGapTarget,
  type GroupState,
  moveGroupBlock,
  normalizeGroupColor,
  type TabGroup,
} from "./tabGroups";
import type { Tab } from "./useTabs";
import { SPACE_COLORS } from "@/modules/spaces/lib/spaceColor";

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

const ids = (s: GroupState) => s.tabs.map((t) => t.id);

describe("moveGroupBlock with a target group that is gone", () => {
  it("leaves the state as it is", () => {
    const state: GroupState = {
      tabs: [term(1, "G1"), term(2), term(3, "G2")],
      groups: [group("G1"), group("G2")],
    };
    const next = moveGroupBlock(state, "G1", {
      index: 3,
      groupId: "gone",
      onCollapsedHeader: false,
    });
    expect(next).toBe(state);
  });

  it("leaves the state as it is when the target group sits in another space", () => {
    const state: GroupState = {
      tabs: [term(1, "G1"), term(2), term(3, "G2", "b")],
      groups: [group("G1"), group("G2", { spaceId: "b" })],
    };
    const next = moveGroupBlock(state, "G1", {
      index: 2,
      groupId: "G2",
      onCollapsedHeader: false,
    });
    expect(next).toBe(state);
  });

  it("still moves behind a target group that exists", () => {
    const state: GroupState = {
      tabs: [term(1, "G1"), term(2), term(3, "G2"), term(4)],
      groups: [group("G1"), group("G2")],
    };
    const next = moveGroupBlock(state, "G1", {
      index: 3,
      groupId: "G2",
      onCollapsedHeader: false,
    });
    expect(ids(next)).toEqual([2, 3, 1, 4]);
  });
});

describe("applyGapTarget with a target group that is gone", () => {
  it("leaves a reorder undone, on a header as in a gap", () => {
    const state: GroupState = {
      tabs: [term(1), term(3), term(4)],
      groups: [],
    };
    const tab = state.tabs[2];
    expect(
      applyGapTarget(state, tab, {
        index: 1,
        groupId: "gone",
        onCollapsedHeader: true,
      }),
    ).toBe(state);
    expect(
      applyGapTarget(state, tab, {
        index: 1,
        groupId: "gone",
        onCollapsedHeader: false,
      }),
    ).toBe(state);
  });

  it("places a new tab loose at the gap so a broken-out pane is kept", () => {
    const state: GroupState = {
      tabs: [term(1), term(3), term(4)],
      groups: [],
    };
    const next = applyGapTarget(state, term(9), {
      index: 1,
      groupId: "gone",
      onCollapsedHeader: true,
    });
    expect(ids(next)).toEqual([1, 9, 3, 4]);
    expect(next.tabs[1].groupId).toBeUndefined();
  });
});

describe("normalizeGroupColor", () => {
  it("keeps every palette index", () => {
    for (let c = 0; c < SPACE_COLORS.length; c++) {
      expect(normalizeGroupColor(c)).toBe(c);
    }
  });

  it("falls back to the first colour for anything else", () => {
    for (const v of [
      -1,
      SPACE_COLORS.length,
      1.5,
      Number.NaN,
      "2",
      null,
      undefined,
      {},
    ]) {
      expect(normalizeGroupColor(v)).toBe(0);
    }
  });
});
