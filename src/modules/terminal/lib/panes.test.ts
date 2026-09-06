import { describe, expect, it } from "vitest";
import {
  attachSubtree,
  findLeafCwd,
  leafIds,
  moveLeaf,
  type PaneNode,
  sameLayout,
  setLeafTmuxSession,
  swapLeaves,
  withLeavesFrom,
} from "./panes";

type Split = Extract<PaneNode, { kind: "split" }>;

function findLeaf(n: PaneNode, id: number): PaneNode | null {
  if (n.kind === "leaf") return n.id === id ? n : null;
  for (const c of n.children) {
    const f = findLeaf(c, id);
    if (f) return f;
  }
  return null;
}

function ids(n: PaneNode): number[] {
  return n.kind === "split" ? n.children.map((c) => c.id) : [n.id];
}

describe("setLeafTmuxSession", () => {
  it("sets the session on the matching leaf only", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [
        { kind: "leaf", id: 2 },
        { kind: "leaf", id: 3 },
      ],
    };
    const next = setLeafTmuxSession(tree, 2, "main") as Split;
    expect(next).not.toBe(tree);
    expect(next.children[0]).toMatchObject({ id: 2, tmuxSession: "main" });
    expect(next.children[1]).toEqual({ kind: "leaf", id: 3 });
  });

  it("returns the same node when unchanged (referential stability)", () => {
    const leaf: PaneNode = { kind: "leaf", id: 5, tmuxSession: "work" };
    expect(setLeafTmuxSession(leaf, 5, "work")).toBe(leaf);
  });

  it("is a no-op for a missing leaf id", () => {
    const tree: PaneNode = { kind: "leaf", id: 9 };
    expect(setLeafTmuxSession(tree, 99, "x")).toBe(tree);
  });

  it("updates a nested leaf and keeps untouched subtrees by reference", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "col",
      children: [
        { kind: "leaf", id: 2 },
        {
          kind: "split",
          id: 3,
          dir: "row",
          children: [
            { kind: "leaf", id: 4 },
            { kind: "leaf", id: 5 },
          ],
        },
      ],
    };
    const next = setLeafTmuxSession(tree, 4, "s1") as Split;
    expect(next).not.toBe(tree);
    // The sibling that did not change keeps its identity.
    expect(next.children[0]).toBe(tree.children[0]);
    const innerSplit = next.children[1] as Split;
    expect(innerSplit.children[0]).toMatchObject({ id: 4, tmuxSession: "s1" });
    expect(innerSplit.children[1]).toEqual({ kind: "leaf", id: 5 });
  });
});

describe("moveLeaf", () => {
  const twoRow: PaneNode = {
    kind: "split",
    id: 1,
    dir: "row",
    children: [
      { kind: "leaf", id: 2, cwd: "/a" },
      { kind: "leaf", id: 3, cwd: "/b" },
    ],
  };

  it("is a no-op when source === target", () => {
    expect(moveLeaf(twoRow, 2, 2, "right", 99)).toBe(twoRow);
  });

  it("is a no-op when the source is the only leaf", () => {
    const solo: PaneNode = { kind: "leaf", id: 7 };
    expect(moveLeaf(solo, 7, 7, "left", 99)).toBe(solo);
  });

  it("collapses the emptied split and re-splits at the target, keeping id + cwd", () => {
    // Source(3) and target(2) share the 2-child row split → removeLeaf collapses
    // it to leaf 2, then insert 3 below → a col split [2 (top), 3 (bottom)].
    const next = moveLeaf(twoRow, 3, 2, "bottom", 99) as Split;
    expect(next.kind).toBe("split");
    expect(next.dir).toBe("col");
    expect(ids(next)).toEqual([2, 3]);
    // No leaf lost or duplicated; moved leaf keeps its id and cwd (→ session).
    expect(leafIds(next).sort()).toEqual([2, 3]);
    expect(findLeaf(next, 3)).toMatchObject({ id: 3, cwd: "/b" });
  });

  it("merges into a same-direction split instead of nesting", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "col",
      children: [
        { kind: "leaf", id: 2 },
        { kind: "leaf", id: 3 },
        { kind: "leaf", id: 4 },
      ],
    };
    // Move leaf 4 above leaf 2 (top → col dir, same as the enclosing split).
    const next = moveLeaf(tree, 4, 2, "top", 99) as Split;
    expect(next.dir).toBe("col");
    expect(ids(next)).toEqual([4, 2, 3]); // flat, no nested split
  });
});

describe("attachSubtree (merge a tab's pane tree into another tab)", () => {
  const leaf = (id: number): PaneNode => ({ kind: "leaf", id });

  it("splits a single-leaf tab with the incoming leaf on the requested edge", () => {
    const out = attachSubtree(leaf(1), 1, leaf(2), "right", 100);
    expect(out).toEqual({
      kind: "split",
      id: 100,
      dir: "row",
      children: [leaf(1), leaf(2)],
    });
    const before = attachSubtree(leaf(1), 1, leaf(2), "left", 100);
    expect(leafIds(before)).toEqual([2, 1]);
  });

  it("flattens an incoming split of the same direction, ids included", () => {
    const incoming: PaneNode = {
      kind: "split",
      id: 50,
      dir: "col",
      children: [leaf(7), leaf(8)],
    };
    const out = attachSubtree(leaf(1), 1, incoming, "bottom", 100);
    expect(out).toEqual({
      kind: "split",
      id: 100,
      dir: "col",
      children: [leaf(1), leaf(7), leaf(8)],
    });
  });

  it("keeps an incoming split of the other direction nested", () => {
    const incoming: PaneNode = {
      kind: "split",
      id: 50,
      dir: "row",
      children: [leaf(7), leaf(8)],
    };
    const out = attachSubtree(leaf(1), 1, incoming, "bottom", 100);
    expect(out).toEqual({
      kind: "split",
      id: 100,
      dir: "col",
      children: [leaf(1), incoming],
    });
    expect(leafIds(out)).toEqual([1, 7, 8]);
  });

  it("flattens when merging two same-direction splits (no row inside row)", () => {
    const target: PaneNode = {
      kind: "split",
      id: 10,
      dir: "row",
      children: [leaf(1), leaf(2)],
    };
    const incoming: PaneNode = {
      kind: "split",
      id: 50,
      dir: "row",
      children: [leaf(7), leaf(8)],
    };
    const out = attachSubtree(target, 2, incoming, "right", 100);
    expect(out).toEqual({
      ...target,
      children: [leaf(1), leaf(2), leaf(7), leaf(8)],
    });
  });

  it("joins an existing split of the same direction instead of nesting", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 10,
      dir: "row",
      children: [leaf(1), leaf(2)],
    };
    const out = attachSubtree(tree, 2, leaf(3), "right", 100);
    expect(out).toEqual({ ...tree, children: [leaf(1), leaf(2), leaf(3)] });
  });

  it("returns the tree unchanged when the target leaf is missing", () => {
    const tree = leaf(1);
    expect(attachSubtree(tree, 99, leaf(2), "right", 100)).toBe(tree);
  });
});

describe("withLeavesFrom (restore a layout, not its old contents)", () => {
  const leaf = (id: number, cwd?: string): PaneNode => ({
    kind: "leaf",
    id,
    cwd,
  });

  it("rebuilds the shape with the leaves that are live now", () => {
    const shape: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [leaf(2, "/old"), leaf(3, "/old")],
    };
    const live: PaneNode = {
      kind: "split",
      id: 9,
      dir: "col",
      children: [leaf(3, "/new"), leaf(2, "/new")],
    };
    const out = withLeavesFrom(shape, [live]);
    expect(out).toEqual({
      kind: "split",
      id: 1,
      dir: "row",
      children: [leaf(2, "/new"), leaf(3, "/new")],
    });
  });

  it("takes a leaf from whichever source holds it", () => {
    const shape: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [leaf(2, "/old"), leaf(3, "/old")],
    };
    const out = withLeavesFrom(shape, [leaf(2, "/a"), leaf(3, "/b")]);
    expect(leafIds(out)).toEqual([2, 3]);
    expect(findLeafCwd(out, 2)).toBe("/a");
    expect(findLeafCwd(out, 3)).toBe("/b");
  });

  it("keeps a leaf no source knows about", () => {
    const shape: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [leaf(2, "/old"), leaf(3, "/old")],
    };
    const out = withLeavesFrom(shape, [leaf(2, "/a")]);
    expect(findLeafCwd(out, 3)).toBe("/old");
  });
});

describe("sameLayout", () => {
  const leaf = (id: number, cwd?: string): PaneNode => ({
    kind: "leaf",
    id,
    cwd,
  });
  const split = (
    id: number,
    dir: "row" | "col",
    ...children: PaneNode[]
  ): PaneNode => ({ kind: "split", id, dir, children });

  it("ignores split ids and leaf contents", () => {
    expect(
      sameLayout(
        split(1, "row", leaf(2, "/a"), leaf(3)),
        split(99, "row", leaf(2, "/b"), leaf(3)),
      ),
    ).toBe(true);
  });

  it("separates a row from a column of the same panes", () => {
    expect(
      sameLayout(
        split(1, "row", leaf(2), leaf(3)),
        split(1, "col", leaf(2), leaf(3)),
      ),
    ).toBe(false);
  });

  it("separates a reorder and a different nesting", () => {
    expect(
      sameLayout(
        split(1, "row", leaf(2), leaf(3)),
        split(1, "row", leaf(3), leaf(2)),
      ),
    ).toBe(false);
    expect(
      sameLayout(
        split(1, "row", leaf(2), leaf(3), leaf(4)),
        split(1, "row", leaf(2), split(5, "col", leaf(3), leaf(4))),
      ),
    ).toBe(false);
  });

  it("separates a leaf from a split, and different leaves", () => {
    expect(sameLayout(leaf(2), split(1, "row", leaf(2), leaf(3)))).toBe(false);
    expect(sameLayout(leaf(2), leaf(3))).toBe(false);
    expect(sameLayout(leaf(2), leaf(2))).toBe(true);
  });
});

describe("swapLeaves", () => {
  const leaf = (id: number, cwd?: string): PaneNode => ({
    kind: "leaf",
    id,
    cwd,
  });
  const split = (
    id: number,
    dir: "row" | "col",
    ...children: PaneNode[]
  ): PaneNode => ({ kind: "split", id, dir, children });

  it("exchanges two siblings without touching the split", () => {
    const tree = split(1, "row", leaf(2, "/a"), leaf(3, "/b"));
    const out = swapLeaves(tree, 2, 3);
    expect(out).toEqual(split(1, "row", leaf(3, "/b"), leaf(2, "/a")));
  });

  it("carries each leaf's own contents along", () => {
    const tree = split(
      1,
      "row",
      { kind: "leaf", id: 2, cwd: "/a", tmuxSession: "one" },
      leaf(3, "/b"),
    );
    const out = swapLeaves(tree, 2, 3);
    expect(findLeafCwd(out, 2)).toBe("/a");
    expect(findLeafCwd(out, 3)).toBe("/b");
    expect(leafIds(out)).toEqual([3, 2]);
  });

  it("exchanges across different levels of the tree", () => {
    // row[ col[2,3], 4 ]: swapping 3 and 4 moves a pane out of the column and
    // another into it, and both splits keep their shape.
    const tree = split(1, "row", split(5, "col", leaf(2), leaf(3)), leaf(4));
    const out = swapLeaves(tree, 3, 4);
    expect(out).toEqual(
      split(1, "row", split(5, "col", leaf(2), leaf(4)), leaf(3)),
    );
  });

  it("leaves the tree alone for the same leaf or an unknown one", () => {
    const tree = split(1, "row", leaf(2), leaf(3));
    expect(swapLeaves(tree, 2, 2)).toBe(tree);
    expect(swapLeaves(tree, 2, 99)).toBe(tree);
    expect(swapLeaves(tree, 99, 2)).toBe(tree);
  });

  it("is its own inverse", () => {
    const tree = split(1, "row", split(5, "col", leaf(2), leaf(3)), leaf(4));
    expect(swapLeaves(swapLeaves(tree, 3, 4), 3, 4)).toEqual(tree);
  });
});
