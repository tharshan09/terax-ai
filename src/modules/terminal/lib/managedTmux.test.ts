import { describe, expect, it } from "vitest";
import {
  collectManagedSessions,
  isManagedSession,
  newManagedSession,
  orphanedManagedSessions,
  removedManagedSessions,
} from "./managedTmux";
import type { PaneNode } from "./panes";

describe("isManagedSession", () => {
  it("recognizes only the managed prefix", () => {
    expect(isManagedSession("terax-rs-abc123")).toBe(true);
    expect(isManagedSession("main")).toBe(false);
    // A user's own tmux tab must never look managed.
    expect(isManagedSession("terax")).toBe(false);
    expect(isManagedSession(undefined)).toBe(false);
    expect(isManagedSession(null)).toBe(false);
  });
});

describe("newManagedSession", () => {
  it("prefixes the random token and stays a valid tmux name", () => {
    const name = newManagedSession(() => "deadbeef0001");
    expect(name).toBe("terax-rs-deadbeef0001");
    expect(isManagedSession(name)).toBe(true);
    expect(/^[A-Za-z0-9_-]+$/.test(name)).toBe(true);
    expect(name.startsWith("-")).toBe(false);
  });
});

describe("collectManagedSessions", () => {
  it("gathers managed sessions across a split tree, ignoring unmanaged", () => {
    const tree: PaneNode = {
      kind: "split",
      id: 1,
      dir: "row",
      children: [
        { kind: "leaf", id: 10, tmuxSession: "terax-rs-aaa" },
        { kind: "leaf", id: 11, tmuxSession: "main" },
        {
          kind: "split",
          id: 2,
          dir: "col",
          children: [
            { kind: "leaf", id: 12 },
            { kind: "leaf", id: 13, tmuxSession: "terax-rs-bbb" },
          ],
        },
      ],
    };
    expect(collectManagedSessions(tree)).toEqual([
      "terax-rs-aaa",
      "terax-rs-bbb",
    ]);
  });

  it("returns nothing for a plain unmanaged leaf", () => {
    expect(collectManagedSessions({ kind: "leaf", id: 1 })).toEqual([]);
    expect(
      collectManagedSessions({ kind: "leaf", id: 1, tmuxSession: "work" }),
    ).toEqual([]);
  });
});

describe("removedManagedSessions", () => {
  const split: PaneNode = {
    kind: "split",
    id: 1,
    dir: "row",
    children: [
      { kind: "leaf", id: 10, tmuxSession: "terax-rs-aaa" },
      { kind: "leaf", id: 11, tmuxSession: "terax-rs-bbb" },
    ],
  };

  it("returns only the managed sessions gone from the new tree", () => {
    // Closing pane 11 leaves pane 10's session alive; only bbb is killed.
    const after: PaneNode = {
      kind: "leaf",
      id: 10,
      tmuxSession: "terax-rs-aaa",
    };
    expect(removedManagedSessions(split, after)).toEqual(["terax-rs-bbb"]);
  });

  it("returns all managed sessions when the whole subtree is removed", () => {
    expect(removedManagedSessions(split, null)).toEqual([
      "terax-rs-aaa",
      "terax-rs-bbb",
    ]);
  });

  it("returns nothing when no managed session was removed", () => {
    const plain: PaneNode = { kind: "leaf", id: 1, tmuxSession: "main" };
    expect(removedManagedSessions(plain, null)).toEqual([]);
  });
});

describe("orphanedManagedSessions", () => {
  it("selects only unreferenced managed sessions, never user sessions", () => {
    const existing = [
      "terax-rs-live",
      "terax-rs-leak1",
      "terax-rs-leak2",
      "roadmap",
      "test",
    ];
    const referenced = new Set(["terax-rs-live"]);
    expect(orphanedManagedSessions(existing, referenced)).toEqual([
      "terax-rs-leak1",
      "terax-rs-leak2",
    ]);
  });

  it("reaps every managed session when nothing is referenced", () => {
    expect(orphanedManagedSessions(["terax-rs-a", "main"], new Set())).toEqual([
      "terax-rs-a",
    ]);
  });

  it("reaps nothing when everything is referenced or unmanaged", () => {
    const referenced = new Set(["terax-rs-a", "terax-rs-b"]);
    expect(
      orphanedManagedSessions(["terax-rs-a", "terax-rs-b", "s1"], referenced),
    ).toEqual([]);
  });
});
