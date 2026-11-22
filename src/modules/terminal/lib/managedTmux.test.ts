import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeManagedSession,
  collectManagedSessions,
  currentManagedPrefix,
  isManagedSession,
  isReservedSessionName,
  managedTmuxPrefix,
  newManagedSession,
  newSessionNameError,
  orphanedManagedSessions,
  reapOrphanedManagedSessions,
  removedManagedSessions,
} from "./managedTmux";
import cases from "./managedTmuxPrefix.cases.json";
import type { PaneNode } from "./panes";
import { killTmuxSession, listTmuxSessions, type TmuxSession } from "./tmux";

vi.mock("./tmux", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./tmux")>();
  return {
    ...actual,
    listTmuxSessions: vi.fn(),
    killTmuxSession: vi.fn(() => Promise.resolve()),
  };
});

const PREFIX_GLOBAL = "__TERAX_MANAGED_TMUX_PREFIX__";
const PRODUCTION = "terax-rs-";
const DEV = "terax-dev-rs-";

function runAs(prefix: string | undefined): void {
  if (prefix === undefined) Reflect.deleteProperty(globalThis, PREFIX_GLOBAL);
  else Reflect.set(globalThis, PREFIX_GLOBAL, prefix);
}

afterEach(() => {
  runAs(PRODUCTION);
  vi.clearAllMocks();
});

function session(name: string): TmuxSession {
  return {
    name,
    windows: 1,
    attached: false,
    lastAttached: null,
    attachable: true,
  };
}

describe("managedTmuxPrefix", () => {
  it("writes every case exactly as the Rust side does", () => {
    // The Rust test reads the same file (variant.rs).
    expect(cases.some((c) => c.suffix === null)).toBe(true);
    for (const c of cases) {
      expect(managedTmuxPrefix(c.suffix)).toBe(c.prefix);
    }
  });

  it("keeps the installed app on terax-rs- and gives dev its own", () => {
    expect(managedTmuxPrefix(null)).toBe(PRODUCTION);
    expect(managedTmuxPrefix("dev")).toBe(DEV);
  });

  it("never nests a variant prefix and the production prefix", () => {
    for (const suffix of ["dev", "rs", "RS", "rs-x", "-rs", "r", "", "-"]) {
      const prefix = managedTmuxPrefix(suffix);
      expect(prefix.startsWith(PRODUCTION)).toBe(false);
      expect(PRODUCTION.startsWith(prefix)).toBe(false);
    }
  });
});

describe("currentManagedPrefix", () => {
  it("reads the prefix the Rust side injected", () => {
    runAs(DEV);
    expect(currentManagedPrefix()).toBe(DEV);
  });

  it("is null when nothing or something malformed was injected", () => {
    runAs(undefined);
    expect(currentManagedPrefix()).toBeNull();
    for (const bad of ["", "terax-", "x-rs-", "terax-rs", "terax-a b-rs-"]) {
      runAs(bad);
      expect(currentManagedPrefix()).toBeNull();
    }
  });
});

describe("a side-by-side build", () => {
  it("treats only its own prefix as managed", () => {
    runAs(DEV);
    expect(isManagedSession("terax-dev-rs-abc")).toBe(true);
    expect(isManagedSession("terax-rs-abc")).toBe(false);
    expect(newManagedSession(() => "abc")).toBe("terax-dev-rs-abc");
  });

  it("reserves both its own and the installed app's prefix", () => {
    runAs(DEV);
    expect(isReservedSessionName("terax-dev-rs-x")).toBe(true);
    expect(isReservedSessionName("terax-rs-x")).toBe(true);
    expect(newSessionNameError("terax-rs-mine")).toMatch(/reserved/i);
    expect(isReservedSessionName("deploy")).toBe(false);
  });

  it("is not reserved against by the installed app", () => {
    expect(isReservedSessionName("terax-dev-rs-x")).toBe(false);
  });
});

describe("the boot reaper", () => {
  const onServer = ["terax-rs-prod1", "terax-dev-rs-dev1", "main"];

  it("of the variant leaves the installed app's sessions alone", async () => {
    runAs(DEV);
    vi.mocked(listTmuxSessions).mockResolvedValue(onServer.map(session));
    await reapOrphanedManagedSessions(new Set());
    const killed = vi.mocked(killTmuxSession).mock.calls.map((c) => c[1]);
    expect(killed).toEqual(["terax-dev-rs-dev1"]);
  });

  it("of the installed app leaves the variant's sessions alone", async () => {
    vi.mocked(listTmuxSessions).mockResolvedValue(onServer.map(session));
    await reapOrphanedManagedSessions(new Set());
    const killed = vi.mocked(killTmuxSession).mock.calls.map((c) => c[1]);
    expect(killed).toEqual(["terax-rs-prod1"]);
  });

  it("does nothing when the prefix is unknown", async () => {
    runAs(undefined);
    vi.mocked(listTmuxSessions).mockResolvedValue(onServer.map(session));
    await reapOrphanedManagedSessions(new Set());
    expect(listTmuxSessions).not.toHaveBeenCalled();
    expect(killTmuxSession).not.toHaveBeenCalled();
  });
});

describe("without a known prefix", () => {
  it("claims no session, mints none and leaves nothing to kill", () => {
    runAs(undefined);
    expect(isManagedSession("terax-rs-abc")).toBe(false);
    expect(newManagedSession(() => "abc")).toBeNull();
    const tree: PaneNode = { kind: "leaf", id: 1, tmuxSession: "terax-rs-a" };
    expect(collectManagedSessions(tree)).toEqual([]);
    expect(removedManagedSessions(tree, null)).toEqual([]);
    expect(orphanedManagedSessions(["terax-rs-a"], new Set())).toEqual([]);
    // Still refused: the installed app would reap it.
    expect(isReservedSessionName("terax-rs-x")).toBe(true);
  });
});

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
    const name = newManagedSession(() => "deadbeef0001") ?? "";
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

describe("activeManagedSession", () => {
  const split: PaneNode = {
    kind: "split",
    id: 1,
    dir: "row",
    children: [
      { kind: "leaf", id: 10, tmuxSession: "terax-rs-aaa" },
      { kind: "leaf", id: 11, tmuxSession: "main" },
      { kind: "leaf", id: 12 },
    ],
  };

  it("returns the managed session of the active leaf", () => {
    expect(activeManagedSession(split, 10)).toBe("terax-rs-aaa");
  });

  it("returns null when the active leaf is a user session or plain shell", () => {
    expect(activeManagedSession(split, 11)).toBeNull();
    expect(activeManagedSession(split, 12)).toBeNull();
    expect(activeManagedSession(split, 999)).toBeNull();
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

describe("newSessionNameError", () => {
  it("accepts a plain name", () => {
    expect(newSessionNameError("deploy")).toBeNull();
    expect(newSessionNameError("s1")).toBeNull();
    expect(newSessionNameError("build_2-x")).toBeNull();
  });

  it("accepts input that sanitizes into a usable name", () => {
    // The field takes what people type; spaces and dots become hyphens rather
    // than an error the user has to decode.
    expect(newSessionNameError("my app")).toBeNull();
    expect(newSessionNameError("api.v2")).toBeNull();
  });

  it("refuses input that survives as nothing", () => {
    expect(newSessionNameError("")).not.toBeNull();
    expect(newSessionNameError("   ")).not.toBeNull();
    expect(newSessionNameError("///")).not.toBeNull();
  });

  it("refuses the prefix reserved for Terax-managed sessions", () => {
    // A user session named into it would be killed with its tab by the
    // managed-session cleanup.
    const err = newSessionNameError("terax-rs-mine");
    expect(err).not.toBeNull();
    expect(err).toMatch(/reserved/i);
  });
});
