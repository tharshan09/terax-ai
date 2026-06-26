import { describe, expect, it } from "vitest";
import { type PaneNode, setLeafTmuxSession } from "./panes";

type Split = Extract<PaneNode, { kind: "split" }>;

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
