import { describe, expect, it } from "vitest";
import { leafIds, moveLeaf, type PaneNode, setLeafTmuxSession } from "./panes";

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
