import { findLeafCwd, type PaneNode } from "@/modules/terminal/lib/panes";
import { describe, expect, it } from "vitest";
import {
  breakOutPaneFromTabs,
  insertTabAtSpaceGap,
  type Tab,
  type TerminalTab,
  undoBreakOut,
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
const tree_ = (tabs: Tab[], id: number): PaneNode => {
  const t = tabs.find((x) => x.id === id);
  if (t?.kind !== "terminal") throw new Error(`tab ${id} is not a terminal`);
  return t.paneTree;
};
const leavesOf = (tabs: Tab[], id: number): number[] => {
  const n = tree_(tabs, id);
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
    expect(tree_(out.tabs, 7)).toEqual({
      kind: "leaf",
      id: 11,
      cwd: undefined,
    });
    // The split collapses to the surviving pane.
    expect(tree_(out.tabs, 1)).toEqual({
      kind: "leaf",
      id: 10,
      cwd: undefined,
    });
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
    expect(tree_(out.tabs, 7)).toBe(live);
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

  it("records the layout it left behind, so the move can be undone", () => {
    const tree = row(leaf(10), leaf(11));
    const tabs = [term(1, tree, { activeLeafId: 10 })];
    const out = breakOutPaneFromTabs(tabs, 11, 7, 1);
    expect(out?.undo).toEqual({
      tabId: 7,
      leafId: 11,
      sourceTabId: 1,
      prevTree: tree,
      prevActiveLeafId: 10,
    });
  });
});

describe("undoBreakOut", () => {
  const col = (...children: PaneNode[]): PaneNode => ({
    kind: "split",
    id: 901,
    dir: "col",
    children,
  });

  function brokenOut(tabs: Tab[], leafId: number, gap = 1) {
    const out = breakOutPaneFromTabs(tabs, leafId, 7, gap);
    if (!out) throw new Error("expected a break-out");
    return out;
  }

  it("restores the exact layout, not just the side the pane sat on", () => {
    // row[ col[10,11], 12 ]: pane 12 is a full-height column. Re-attaching it
    // to a neighbor leaf would bring it back as a cell inside the column.
    const tree = row(col(leaf(10), leaf(11)), leaf(12));
    const out = brokenOut([term(1, tree)], 12);
    const back = undoBreakOut(out.tabs, out.undo);
    if (typeof back === "string") throw new Error(`refused: ${back}`);
    expect(ids(back)).toEqual([1]);
    expect(tree_(back, 1)).toEqual(tree);
  });

  it("restores a plain row and closes the tab the pane was born into", () => {
    const before = [
      term(1, row(leaf(10), leaf(11), leaf(12))),
      term(2, leaf(20)),
    ];
    const out = brokenOut(before, 11);
    const back = undoBreakOut(out.tabs, out.undo);
    if (typeof back === "string") throw new Error(`refused: ${back}`);
    expect(ids(back)).toEqual([1, 2]);
    expect(leavesOf(back, 1)).toEqual([10, 11, 12]);
  });

  it("gives the source tab its old focus back", () => {
    const out = brokenOut(
      [term(1, row(leaf(10), leaf(11)), { activeLeafId: 10 })],
      11,
    );
    const back = undoBreakOut(out.tabs, out.undo);
    if (typeof back === "string") throw new Error(`refused: ${back}`);
    const src = back.find((t) => t.id === 1);
    if (src?.kind !== "terminal") throw new Error("expected a terminal tab");
    expect(src.activeLeafId).toBe(10);
  });

  it("keeps a cwd the pane picked up after the drop", () => {
    const out = brokenOut([term(1, row(leaf(10, "/a"), leaf(11, "/a")))], 11);
    // The broken-out pane cd's while the toast stands.
    const moved = out.tabs.map((t) =>
      t.id === 7 ? ({ ...t, paneTree: leaf(11, "/elsewhere") } as Tab) : t,
    );
    const back = undoBreakOut(moved, out.undo);
    if (typeof back === "string") throw new Error(`refused: ${back}`);
    const src = back.find((t) => t.id === 1);
    if (src?.kind !== "terminal") throw new Error("expected a terminal tab");
    expect(findLeafCwd(src.paneTree, 11)).toBe("/elsewhere");
    expect(findLeafCwd(src.paneTree, 10)).toBe("/a");
  });

  it("refuses once the new tab has grown panes of its own", () => {
    const out = brokenOut([term(1, row(leaf(10), leaf(11)))], 11);
    const split = out.tabs.map((t) =>
      t.id === 7 ? ({ ...t, paneTree: row(leaf(11), leaf(30)) } as Tab) : t,
    );
    expect(undoBreakOut(split, out.undo)).toBe("invalid");
  });

  it("refuses once the old tab has changed shape", () => {
    const out = brokenOut([term(1, row(leaf(10), leaf(11), leaf(12)))], 11);
    const grown = out.tabs.map((t) =>
      t.id === 1
        ? ({ ...t, paneTree: row(leaf(10), leaf(12), leaf(31)) } as Tab)
        : t,
    );
    expect(undoBreakOut(grown, out.undo)).toBe("invalid");
    const reordered = out.tabs.map((t) =>
      t.id === 1 ? ({ ...t, paneTree: row(leaf(12), leaf(10)) } as Tab) : t,
    );
    expect(undoBreakOut(reordered, out.undo)).toBe("invalid");
  });

  it("refuses when either tab is gone", () => {
    const out = brokenOut([term(1, row(leaf(10), leaf(11)))], 11);
    expect(
      undoBreakOut(
        out.tabs.filter((t) => t.id !== 7),
        out.undo,
      ),
    ).toBe("invalid");
    expect(
      undoBreakOut(
        out.tabs.filter((t) => t.id !== 1),
        out.undo,
      ),
    ).toBe("invalid");
  });
});
