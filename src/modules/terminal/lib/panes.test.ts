import { describe, expect, it } from "vitest";
import {
  attachSubtree,
  leafAnchor,
  leafIds,
  moveLeaf,
  type PaneNode,
  removeLeaf,
  setLeafTmuxSession,
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

describe("leafAnchor (where a pane sat, so a move out can be undone)", () => {
  const leaf = (id: number): PaneNode => ({ kind: "leaf", id });

  it("anchors on the pane to its left in a row split", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [leaf(2), leaf(3)],
    };
    expect(leafAnchor(tree, 3)).toEqual({ anchorId: 2, edge: "right" });
  });

  it("anchors on the pane to its right when it is the first child", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [leaf(2), leaf(3)],
    };
    expect(leafAnchor(tree, 2)).toEqual({ anchorId: 3, edge: "left" });
  });

  it("uses the split direction, so a column split reports top/bottom", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "col",
      children: [leaf(2), leaf(3)],
    };
    expect(leafAnchor(tree, 3)).toEqual({ anchorId: 2, edge: "bottom" });
    expect(leafAnchor(tree, 2)).toEqual({ anchorId: 3, edge: "top" });
  });

  it("anchors on the neighboring subtree's edge-most leaf", () => {
    // row[ col[2,3], 4 ] — pane 4 sits to the right of the column, whose
    // bottom leaf (3) is the one it actually touches.
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [
        { kind: "split", id: 5, dir: "col", children: [leaf(2), leaf(3)] },
        leaf(4),
      ],
    };
    expect(leafAnchor(tree, 4)).toEqual({ anchorId: 3, edge: "right" });
  });

  it("finds a leaf nested below the root", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [
        leaf(2),
        { kind: "split", id: 5, dir: "col", children: [leaf(3), leaf(4)] },
      ],
    };
    expect(leafAnchor(tree, 4)).toEqual({ anchorId: 3, edge: "bottom" });
  });

  it("has no anchor for a lone pane or an unknown id", () => {
    expect(leafAnchor(leaf(1), 1)).toBeNull();
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [leaf(2), leaf(3)],
    };
    expect(leafAnchor(tree, 99)).toBeNull();
  });

  it("puts the pane back where it was when fed to attachSubtree", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [leaf(2), leaf(3), leaf(4)],
    };
    const a = leafAnchor(tree, 3);
    if (!a) throw new Error("expected an anchor");
    const without = removeLeaf(tree, 3);
    if (!without) throw new Error("expected a remaining tree");
    const back = attachSubtree(without, a.anchorId, leaf(3), a.edge, 99);
    expect(leafIds(back)).toEqual([2, 3, 4]);
  });
});
