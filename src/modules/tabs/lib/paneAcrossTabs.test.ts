import type { PaneNode } from "@/modules/terminal/lib/panes";
import { describe, expect, it } from "vitest";
import {
  breakOutPaneFromTabs,
  canMovePaneInto,
  insertTabAtSpaceGap,
  movePaneIntoTab,
  type Tab,
  type TerminalTab,
} from "./useTabs";

const leaf = (id: number, cwd?: string): PaneNode => ({
  kind: "leaf",
  id,
  cwd,
});

const row = (...children: PaneNode[]): PaneNode => ({
  kind: "split",
  id: 900,
  dir: "row",
  children,
});

function term(
  id: number,
  tree: PaneNode,
  extra: Partial<TerminalTab> = {},
): Tab {
  const first = tree.kind === "leaf" ? tree.id : tree.children[0].id;
  return {
    id,
    kind: "terminal",
    spaceId: "a",
    title: "shell",
    paneTree: tree,
    activeLeafId: first,
    ...extra,
  } as Tab;
}

const ids = (tabs: Tab[]) => tabs.map((t) => t.id);
const tree = (tabs: Tab[], id: number): PaneNode => {
  const t = tabs.find((x) => x.id === id);
  if (t?.kind !== "terminal") throw new Error(`tab ${id} is not a terminal`);
  return t.paneTree;
};
const leavesOf = (tabs: Tab[], id: number): number[] => {
  const n = tree(tabs, id);
  return n.kind === "leaf" ? [n.id] : n.children.map((c) => c.id);
};

describe("insertTabAtSpaceGap", () => {
  const born = term(9, leaf(90));

  it("places the tab at the gap it was dropped on", () => {
    const tabs = [term(1, leaf(10)), term(2, leaf(20)), term(3, leaf(30))];
    expect(ids(insertTabAtSpaceGap(tabs, born, 0))).toEqual([9, 1, 2, 3]);
    expect(ids(insertTabAtSpaceGap(tabs, born, 2))).toEqual([1, 2, 9, 3]);
    expect(ids(insertTabAtSpaceGap(tabs, born, 3))).toEqual([1, 2, 3, 9]);
  });

  it("clamps a gap past the end of the strip", () => {
    const tabs = [term(1, leaf(10))];
    expect(ids(insertTabAtSpaceGap(tabs, born, 99))).toEqual([1, 9]);
    expect(ids(insertTabAtSpaceGap(tabs, born, -3))).toEqual([9, 1]);
  });

  it("counts gaps within the tab's own space, not the whole list", () => {
    const tabs = [
      term(1, leaf(10), { spaceId: "b" }),
      term(2, leaf(20)),
      term(3, leaf(30), { spaceId: "b" }),
      term(4, leaf(40)),
    ];
    // Gap 1 of space "a" is between tabs 2 and 4, which sit apart in the flat
    // list, so only the space-relative order is meaningful.
    const next = insertTabAtSpaceGap(tabs, born, 1);
    expect(ids(next.filter((t) => t.spaceId === "a"))).toEqual([2, 9, 4]);
    expect(ids(next.filter((t) => t.spaceId === "b"))).toEqual([1, 3]);
  });

  it("appends when the space is still empty", () => {
    const tabs = [term(1, leaf(10), { spaceId: "b" })];
    expect(ids(insertTabAtSpaceGap(tabs, born, 0))).toEqual([1, 9]);
  });
});

describe("breakOutPaneFromTabs", () => {
  it("gives the pane a tab of its own at the dropped gap", () => {
    const tabs = [term(1, row(leaf(10), leaf(11))), term(2, leaf(20))];
    const out = breakOutPaneFromTabs(tabs, 11, 7, 1);
    if (!out) throw new Error("expected a break-out");
    expect(ids(out.tabs)).toEqual([1, 7, 2]);
    expect(tree(out.tabs, 7)).toEqual({ kind: "leaf", id: 11, cwd: undefined });
    // The split collapses to the surviving pane.
    expect(tree(out.tabs, 1)).toEqual({ kind: "leaf", id: 10, cwd: undefined });
  });

  it("keeps the leaf object, so its live session travels with it", () => {
    const live: PaneNode = {
      kind: "leaf",
      id: 11,
      cwd: "/srv",
      tmuxSession: "terax-rs-abc",
    };
    const tabs = [term(1, row(leaf(10), live))];
    const out = breakOutPaneFromTabs(tabs, 11, 7, 1);
    if (!out) throw new Error("expected a break-out");
    expect(tree(out.tabs, 7)).toBe(live);
    const born = out.tabs.find((t) => t.id === 7);
    if (born?.kind !== "terminal") throw new Error("expected a terminal tab");
    expect(born.cwd).toBe("/srv");
    expect(born.tmuxSession).toBe("terax-rs-abc");
  });

  it("inherits the environment but not the user's name for the old tab", () => {
    const ssh = { kind: "ssh", host: "litha" } as const;
    const tabs = [
      term(1, row(leaf(10), leaf(11)), {
        workspace: ssh,
        private: true,
        customTitle: "deploy",
      }),
    ];
    const out = breakOutPaneFromTabs(tabs, 11, 7, 1);
    const born = out?.tabs.find((t) => t.id === 7);
    if (born?.kind !== "terminal") throw new Error("expected a terminal tab");
    expect(born.workspace).toEqual(ssh);
    expect(born.private).toBe(true);
    expect(born.customTitle).toBeUndefined();
  });

  it("moves the source tab's focus to the neighbor it kept", () => {
    const tabs = [
      term(1, row(leaf(10), leaf(11), leaf(12)), { activeLeafId: 11 }),
    ];
    const out = breakOutPaneFromTabs(tabs, 11, 7, 1);
    const src = out?.tabs.find((t) => t.id === 1);
    if (src?.kind !== "terminal") throw new Error("expected a terminal tab");
    expect(src.activeLeafId).toBe(12);
  });

  it("leaves the source tab's focus alone when another pane left", () => {
    const tabs = [
      term(1, row(leaf(10), leaf(11), leaf(12)), { activeLeafId: 10 }),
    ];
    const out = breakOutPaneFromTabs(tabs, 12, 7, 1);
    const src = out?.tabs.find((t) => t.id === 1);
    if (src?.kind !== "terminal") throw new Error("expected a terminal tab");
    expect(src.activeLeafId).toBe(10);
  });

  it("refuses a lone pane and an unknown leaf", () => {
    const tabs = [term(1, leaf(10))];
    expect(breakOutPaneFromTabs(tabs, 10, 7, 0)).toBeNull();
    expect(breakOutPaneFromTabs(tabs, 99, 7, 0)).toBeNull();
  });

  it("reports where the pane sat, so the move can be undone", () => {
    const tabs = [term(1, row(leaf(10), leaf(11)))];
    const out = breakOutPaneFromTabs(tabs, 11, 7, 1);
    expect(out?.undo).toEqual({
      tabId: 7,
      leafId: 11,
      sourceTabId: 1,
      anchorLeafId: 10,
      edge: "right",
    });
  });
});

describe("movePaneIntoTab", () => {
  it("undoes a break-out back into the same spot", () => {
    const before = [
      term(1, row(leaf(10), leaf(11), leaf(12))),
      term(2, leaf(20)),
    ];
    const out = breakOutPaneFromTabs(before, 11, 7, 1);
    if (!out) throw new Error("expected a break-out");
    const back = movePaneIntoTab(
      out.tabs,
      out.undo.leafId,
      out.undo.sourceTabId,
      out.undo.anchorLeafId,
      out.undo.edge,
      99,
    );
    if (typeof back === "string") throw new Error(`refused: ${back}`);
    expect(ids(back)).toEqual([1, 2]);
    expect(leavesOf(back, 1)).toEqual([10, 11, 12]);
  });

  it("closes the source tab when its last pane leaves", () => {
    const tabs = [term(1, leaf(10)), term(2, leaf(20))];
    const next = movePaneIntoTab(tabs, 10, 2, 20, "right", 99);
    if (typeof next === "string") throw new Error(`refused: ${next}`);
    expect(ids(next)).toEqual([2]);
    expect(leavesOf(next, 2)).toEqual([20, 10]);
  });

  it("focuses the arriving pane in the target tab", () => {
    const tabs = [term(1, leaf(10, "/src")), term(2, row(leaf(20), leaf(21)))];
    const next = movePaneIntoTab(tabs, 10, 2, 21, "bottom", 99);
    if (typeof next === "string") throw new Error(`refused: ${next}`);
    const dst = next.find((t) => t.id === 2);
    if (dst?.kind !== "terminal") throw new Error("expected a terminal tab");
    expect(dst.activeLeafId).toBe(10);
    expect(dst.cwd).toBe("/src");
  });

  it("wakes a cold target when a live pane lands in it", () => {
    const tabs = [
      term(1, row(leaf(10), leaf(11))),
      term(2, leaf(20), { cold: true }),
    ];
    const next = movePaneIntoTab(tabs, 10, 2, 20, "right", 99);
    if (typeof next === "string") throw new Error(`refused: ${next}`);
    expect(next.find((t) => t.id === 2)?.cold).toBeUndefined();
  });

  it("refuses a full target, counting one pane and not the whole tab", () => {
    const four = row(leaf(20), leaf(21), leaf(22), leaf(23));
    const tabs = [term(1, row(leaf(10), leaf(11))), term(2, four)];
    expect(movePaneIntoTab(tabs, 10, 2, 20, "right", 99)).toBe("cap");
    // Three panes leave room for exactly one more.
    const three = [
      term(1, row(leaf(10), leaf(11))),
      term(2, row(leaf(20), leaf(21), leaf(22))),
    ];
    expect(typeof movePaneIntoTab(three, 10, 2, 20, "right", 99)).not.toBe(
      "string",
    );
  });

  it("refuses tabs that disagree on environment, privacy or blocks", () => {
    const local = term(1, row(leaf(10), leaf(11)));
    const remote = term(2, leaf(20), {
      workspace: { kind: "ssh", host: "litha" },
    });
    expect(movePaneIntoTab([local, remote], 10, 2, 20, "right", 99)).toBe(
      "incompatible",
    );
    const priv = term(3, leaf(30), { private: true });
    expect(movePaneIntoTab([local, priv], 10, 3, 30, "right", 99)).toBe(
      "incompatible",
    );
    const blocks = term(4, leaf(40), { blocks: true });
    expect(movePaneIntoTab([local, blocks], 10, 4, 40, "right", 99)).toBe(
      "incompatible",
    );
  });

  it("refuses an unknown leaf, an unknown target or the tab it is already in", () => {
    const tabs = [term(1, row(leaf(10), leaf(11))), term(2, leaf(20))];
    expect(movePaneIntoTab(tabs, 99, 2, 20, "right", 99)).toBe("invalid");
    expect(movePaneIntoTab(tabs, 10, 88, 20, "right", 99)).toBe("invalid");
    expect(movePaneIntoTab(tabs, 10, 1, 11, "right", 99)).toBe("invalid");
    expect(movePaneIntoTab(tabs, 10, 2, 88, "right", 99)).toBe("invalid");
  });
});

describe("canMovePaneInto", () => {
  it("counts room for one pane, unlike a whole-tab merge", () => {
    const three = term(1, row(leaf(10), leaf(11), leaf(12)));
    const one = term(2, leaf(20));
    // Merging both tabs would be four panes and is allowed; so is one pane.
    expect(canMovePaneInto(three, one)).toBeNull();
    const four = term(3, row(leaf(30), leaf(31), leaf(32), leaf(33)));
    expect(canMovePaneInto(one, four)).toBe("cap");
  });
});
