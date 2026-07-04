import type { Tab } from "@/modules/tabs";
import { describe, expect, it } from "vitest";
import {
  agentFromPaneCommand,
  collectSshAgentLeaves,
  groupLeavesByHost,
  type LeafAgentState,
  planDepartedLeaves,
  planHostAgentUpdates,
  type SshAgentLeaf,
  WORKING_HOLD_MS,
} from "./sshAgentPoll";

function terminalTab(overrides: Record<string, unknown>): Tab {
  return {
    id: 1,
    kind: "terminal",
    title: "t",
    spaceId: "s",
    paneTree: { kind: "leaf", id: 10 },
    activeLeafId: 10,
    ...overrides,
  } as unknown as Tab;
}

describe("collectSshAgentLeaves", () => {
  it("collects ssh leaves with a tmux session, walking splits", () => {
    const tabs: Tab[] = [
      terminalTab({
        id: 1,
        workspace: { kind: "ssh", host: "claude" },
        paneTree: {
          kind: "split",
          id: 99,
          dir: "row",
          children: [
            { kind: "leaf", id: 10, tmuxSession: "main" },
            { kind: "leaf", id: 11 },
            { kind: "leaf", id: 12, tmuxSession: "wt-obs-801" },
          ],
        },
      }),
    ];
    expect(collectSshAgentLeaves(tabs)).toEqual([
      { leafId: 10, tabId: 1, host: "claude", session: "main", origin: "ssh" },
      {
        leafId: 12,
        tabId: 1,
        host: "claude",
        session: "wt-obs-801",
        origin: "ssh",
      },
    ]);
  });

  it("ignores plain local tabs, non-terminal tabs, and ssh tabs without tmux", () => {
    const tabs: Tab[] = [
      terminalTab({ id: 1, paneTree: { kind: "leaf", id: 10 } }),
      terminalTab({
        id: 2,
        workspace: { kind: "ssh", host: "s1" },
        paneTree: { kind: "leaf", id: 20 },
      }),
      { id: 3, kind: "editor", title: "e", spaceId: "s" } as unknown as Tab,
    ];
    expect(collectSshAgentLeaves(tabs)).toEqual([]);
  });

  it("collects EVERY local tmux leaf (managed and user), never WSL", () => {
    const tabs: Tab[] = [
      // Managed restart-safe tab: joins the poller (OSC markers are swallowed
      // by tmux), even when cold.
      terminalTab({
        id: 1,
        cold: true,
        tmuxSession: "terax-rs-abc123",
        paneTree: { kind: "leaf", id: 10, tmuxSession: "terax-rs-abc123" },
      }),
      // A user's own local tmux tab (Cmd+Shift+M): same OSC blind spot, so it
      // polls too — a Claude living in it must show up in Mission Control.
      terminalTab({
        id: 2,
        tmuxSession: "roadmap",
        paneTree: { kind: "leaf", id: 20, tmuxSession: "roadmap" },
      }),
      // WSL tabs never join the poller.
      terminalTab({
        id: 3,
        workspace: { kind: "wsl", distro: "ubuntu" },
        paneTree: { kind: "leaf", id: 30, tmuxSession: "terax-rs-zz" },
      }),
    ];
    expect(collectSshAgentLeaves(tabs)).toEqual([
      {
        leafId: 10,
        tabId: 1,
        host: "local",
        session: "terax-rs-abc123",
        origin: "local-tmux",
      },
      {
        leafId: 20,
        tabId: 2,
        host: "local",
        session: "roadmap",
        origin: "local-tmux",
      },
    ]);
  });

  it("recognizes agents by pane command, version-named Claude included", () => {
    expect(agentFromPaneCommand("2.1.201")).toBe("claude");
    expect(agentFromPaneCommand("claude")).toBe("claude");
    expect(agentFromPaneCommand("codex")).toBe("codex");
    expect(agentFromPaneCommand("zsh")).toBeNull();
    expect(agentFromPaneCommand("vim")).toBeNull();
    expect(agentFromPaneCommand(null)).toBeNull();
    expect(agentFromPaneCommand(undefined)).toBeNull();
  });

  it("includes cold restored tabs: their remote session may be live", () => {
    const tabs: Tab[] = [
      terminalTab({
        id: 4,
        cold: true,
        workspace: { kind: "ssh", host: "s1" },
        paneTree: { kind: "leaf", id: 40, tmuxSession: "main" },
      }),
    ];
    expect(collectSshAgentLeaves(tabs)).toEqual([
      { leafId: 40, tabId: 4, host: "s1", session: "main", origin: "ssh" },
    ]);
  });
});

describe("groupLeavesByHost", () => {
  it("buckets leaves by origin+host preserving order", () => {
    const leaves: SshAgentLeaf[] = [
      { leafId: 1, tabId: 1, host: "a", session: "s1", origin: "ssh" },
      { leafId: 2, tabId: 2, host: "b", session: "s2", origin: "ssh" },
      { leafId: 3, tabId: 3, host: "a", session: "s3", origin: "ssh" },
      {
        leafId: 4,
        tabId: 4,
        host: "local",
        session: "terax-rs-x",
        origin: "local-tmux",
      },
    ];
    const grouped = groupLeavesByHost(leaves);
    expect([...grouped.keys()]).toEqual(["ssh:a", "ssh:b", "local-tmux:local"]);
    expect(grouped.get("ssh:a")?.map((l) => l.leafId)).toEqual([1, 3]);
    expect(grouped.get("ssh:b")?.map((l) => l.leafId)).toEqual([2]);
    expect(grouped.get("local-tmux:local")?.map((l) => l.leafId)).toEqual([4]);
  });

  it("keeps an SSH host literally named 'local' apart from the local group", () => {
    const leaves: SshAgentLeaf[] = [
      { leafId: 1, tabId: 1, host: "local", session: "s1", origin: "ssh" },
      {
        leafId: 2,
        tabId: 2,
        host: "local",
        session: "terax-rs-x",
        origin: "local-tmux",
      },
    ];
    expect([...groupLeavesByHost(leaves).keys()]).toEqual([
      "ssh:local",
      "local-tmux:local",
    ]);
  });
});

const NOW = 1_000_000_000_000;
const NOW_SEC = NOW / 1000;
const NONE: ReadonlySet<number> = new Set();
const NO_AGENTS: ReadonlyMap<number, string | null> = new Map();

const leaf = (leafId: number, tabId = 1): SshAgentLeaf => ({
  leafId,
  tabId,
  host: "claude",
  session: `s${leafId}`,
  origin: "ssh",
});

const tsMap = (entries: [number, number | null][]) => new Map(entries);

describe("planHostAgentUpdates", () => {
  it("does not mark working on a first observation (needs a change)", () => {
    const plan = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      NO_AGENTS,
      new Map(),
      NOW,
      NONE,
    );
    expect(plan.actions).toEqual([]);
    expect(plan.state.get(10)).toEqual({
      lastTs: NOW_SEC,
      workingUntilMs: 0,
      inStore: false,
    });
  });

  it("starts + marks working when ts changes between polls", () => {
    const first = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      NO_AGENTS,
      new Map(),
      NOW,
      NONE,
    );
    const second = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC + 0.3]]),
      NO_AGENTS,
      first.state,
      NOW + 3000,
      NONE,
    );
    expect(second.actions).toEqual([
      { kind: "start", leafId: 10, tabId: 1, origin: "ssh", agent: "claude" },
      { kind: "working", leafId: 10 },
    ]);
    expect(second.state.get(10)?.inStore).toBe(true);
  });

  it("plumbs a local-tmux leaf's origin into its start action", () => {
    const local: SshAgentLeaf = {
      leafId: 10,
      tabId: 1,
      host: "local",
      session: "terax-rs-abc",
      origin: "local-tmux",
    };
    const first = planHostAgentUpdates(
      [local],
      tsMap([[10, NOW_SEC]]),
      NO_AGENTS,
      new Map(),
      NOW,
      NONE,
    );
    const second = planHostAgentUpdates(
      [local],
      tsMap([[10, NOW_SEC + 0.3]]),
      NO_AGENTS,
      first.state,
      NOW + 3000,
      NONE,
    );
    expect(second.actions[0]).toEqual({
      kind: "start",
      leafId: 10,
      tabId: 1,
      origin: "local-tmux",
      agent: "claude",
    });
  });

  it("detects working under heavy host clock skew (no wall-clock compare)", () => {
    const skewed = NOW_SEC - 3600;
    const first = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, skewed]]),
      NO_AGENTS,
      new Map(),
      NOW,
      NONE,
    );
    const second = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, skewed + 0.2]]),
      NO_AGENTS,
      first.state,
      NOW + 3000,
      NONE,
    );
    expect(second.actions).toContainEqual({ kind: "working", leafId: 10 });
  });

  it("does NOT flash working for a just-finished agent on first sight", () => {
    // A session whose file was written 2s ago but never changes again: no
    // wall-clock heuristic, so no false spinner.
    const first = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC - 2]]),
      NO_AGENTS,
      new Map(),
      NOW,
      NONE,
    );
    const second = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC - 2]]),
      NO_AGENTS,
      first.state,
      NOW + 3000,
      NONE,
    );
    expect(first.actions).toEqual([]);
    expect(second.actions).toEqual([]);
  });

  it("holds working through a short gap, then finishes (no idle state)", () => {
    const s0 = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      NO_AGENTS,
      new Map(),
      NOW,
      NONE,
    );
    const s1 = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC + 1]]),
      NO_AGENTS,
      s0.state,
      NOW + 3000,
      NONE,
    );
    expect(s1.actions).toContainEqual({ kind: "working", leafId: 10 });
    // Within the hold window, unchanged ts still holds working.
    const held = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC + 1]]),
      NO_AGENTS,
      s1.state,
      NOW + 3000 + WORKING_HOLD_MS - 1,
      NONE,
    );
    expect(held.actions).toEqual([{ kind: "working", leafId: 10 }]);
    // Past the hold window with no change: finish, drop ownership, no idle.
    const done = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC + 1]]),
      NO_AGENTS,
      held.state,
      NOW + 3000 + WORKING_HOLD_MS + 1,
      NONE,
    );
    expect(done.actions).toEqual([{ kind: "finish", leafId: 10 }]);
    expect(done.state.get(10)?.inStore).toBe(false);
  });

  it("retains lastTs across a vanished file so a rewrite still counts", () => {
    const s0 = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      NO_AGENTS,
      new Map(),
      NOW,
      NONE,
    );
    const gone = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, null]]),
      NO_AGENTS,
      s0.state,
      NOW + 3000,
      NONE,
    );
    expect(gone.state.get(10)?.lastTs).toBe(NOW_SEC);
    const back = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC + 5]]),
      NO_AGENTS,
      gone.state,
      NOW + 6000,
      NONE,
    );
    expect(back.actions).toContainEqual({ kind: "working", leafId: 10 });
  });

  it("defers entirely to an OSC-owned leaf: no actions, no tracking", () => {
    const owned = new Set([10]);
    // Even with a would-be change, the OSC path owns it.
    const plan = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      NO_AGENTS,
      new Map([
        [10, { lastTs: NOW_SEC - 1, workingUntilMs: 0, inStore: true }],
      ]),
      NOW,
      owned,
    );
    expect(plan.actions).toEqual([]);
    expect(plan.state.has(10)).toBe(false);
  });
});

describe("planHostAgentUpdates: presence", () => {
  const AGENT = new Map<number, string | null>([[10, "claude"]]);
  const SHELL = new Map<number, string | null>([[10, null]]);

  it("lists a present-but-idle agent immediately (no warm-up)", () => {
    const plan = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, null]]),
      AGENT,
      new Map(),
      NOW,
      NONE,
    );
    expect(plan.actions).toEqual([
      { kind: "start", leafId: 10, tabId: 1, origin: "ssh", agent: "claude" },
      { kind: "idle", leafId: 10 },
    ]);
    expect(plan.state.get(10)?.inStore).toBe(true);
  });

  it("drops back to idle after the hold, NOT to finish, while present", () => {
    const s0 = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      AGENT,
      new Map(),
      NOW,
      NONE,
    );
    const s1 = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC + 1]]),
      AGENT,
      s0.state,
      NOW + 3000,
      NONE,
    );
    expect(s1.actions).toContainEqual({ kind: "working", leafId: 10 });
    const after = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC + 1]]),
      AGENT,
      s1.state,
      NOW + 3000 + WORKING_HOLD_MS + 1,
      NONE,
    );
    expect(after.actions).toEqual([{ kind: "idle", leafId: 10 }]);
    expect(after.state.get(10)?.inStore).toBe(true);
  });

  it("finishes as soon as the agent's process is gone (shell back)", () => {
    const s0 = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      AGENT,
      new Map(),
      NOW,
      NONE,
    );
    const gone = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      SHELL,
      s0.state,
      NOW + 3000,
      NONE,
    );
    expect(gone.actions).toEqual([{ kind: "finish", leafId: 10 }]);
    expect(gone.state.get(10)?.inStore).toBe(false);
  });

  it("keeps the spinner via moving ts even when presence detection misses", () => {
    // Unknown foreground command (e.g. a renamed CLI): the old ts-only path
    // still drives working, so the feature never regresses.
    const s0 = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      SHELL,
      new Map(),
      NOW,
      NONE,
    );
    const s1 = planHostAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC + 1]]),
      SHELL,
      s0.state,
      NOW + 3000,
      NONE,
    );
    expect(s1.actions).toContainEqual({ kind: "working", leafId: 10 });
  });
});

describe("planDepartedLeaves", () => {
  it("finishes owned sessions whose leaf left the tree, ignores unowned", () => {
    const prev = new Map<number, LeafAgentState>([
      [10, { lastTs: NOW_SEC, workingUntilMs: NOW + 1000, inStore: true }],
      [11, { lastTs: NOW_SEC, workingUntilMs: 0, inStore: false }],
    ]);
    // Leaf 10 and 11 both gone; only the owned one produces a finish.
    expect(planDepartedLeaves(new Set(), prev)).toEqual([
      { kind: "finish", leafId: 10 },
    ]);
    // Still present: nothing.
    expect(planDepartedLeaves(new Set([10, 11]), prev)).toEqual([]);
  });
});
