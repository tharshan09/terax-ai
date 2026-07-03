import type { Tab } from "@/modules/tabs";
import { describe, expect, it } from "vitest";
import {
  collectSshAgentLeaves,
  FORGET_AFTER_MS,
  planSshAgentUpdates,
  type SshAgentLeaf,
  WORKING_FRESH_SECONDS,
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
      { leafId: 10, tabId: 1, host: "claude", session: "main" },
      { leafId: 12, tabId: 1, host: "claude", session: "wt-obs-801" },
    ]);
  });

  it("ignores local tabs, non-terminal tabs, and ssh tabs without tmux", () => {
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
      { leafId: 40, tabId: 4, host: "s1", session: "main" },
    ]);
  });
});

const NOW = 1_000_000_000_000;
const NOW_SEC = NOW / 1000;

const leaf = (leafId: number, tabId = 1): SshAgentLeaf => ({
  leafId,
  tabId,
  host: "claude",
  session: `s${leafId}`,
});

const tsMap = (entries: [number, number | null][]) => new Map(entries);

describe("planSshAgentUpdates", () => {
  it("starts and marks working on a first wall-clock-fresh observation", () => {
    const plan = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC - 1]]),
      new Map(),
      NOW,
    );
    expect(plan.actions).toEqual([
      { kind: "start", leafId: 10, tabId: 1 },
      { kind: "status", leafId: 10, status: "working" },
    ]);
    expect(plan.state.get(10)?.inStore).toBe(true);
  });

  it("does not start on a first stale observation", () => {
    const plan = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC - WORKING_FRESH_SECONDS - 1]]),
      new Map(),
      NOW,
    );
    expect(plan.actions).toEqual([]);
    expect(plan.state.get(10)?.inStore).toBe(false);
  });

  it("detects working via a changed ts even under heavy clock skew", () => {
    const skewedTs = NOW_SEC - 3600;
    const first = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, skewedTs]]),
      new Map(),
      NOW,
    );
    expect(first.actions).toEqual([]);
    const second = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, skewedTs + 0.3]]),
      first.state,
      NOW + 3000,
    );
    expect(second.actions).toEqual([
      { kind: "start", leafId: 10, tabId: 1 },
      { kind: "status", leafId: 10, status: "working" },
    ]);
  });

  it("holds working through a short evidence gap, then drops to idle", () => {
    const start = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      new Map(),
      NOW,
    );
    const heldAt = NOW + WORKING_HOLD_MS - 1;
    const held = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      start.state,
      heldAt,
    );
    expect(held.actions).toEqual([
      { kind: "status", leafId: 10, status: "working" },
    ]);
    const idleAt = NOW + WORKING_HOLD_MS + 1;
    const idle = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      held.state,
      idleAt,
    );
    expect(idle.actions).toEqual([
      { kind: "status", leafId: 10, status: "idle" },
    ]);
  });

  it("registers a vanished-then-rewritten stats file as a change", () => {
    const start = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      new Map(),
      NOW,
    );
    const gone = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, null]]),
      start.state,
      NOW + 3000,
    );
    expect(gone.state.get(10)?.lastTs).toBe(NOW_SEC);
    const back = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC + 100]]),
      gone.state,
      NOW + 6000,
    );
    expect(back.actions).toContainEqual({
      kind: "status",
      leafId: 10,
      status: "working",
    });
  });

  it("forgets a long-stale session instead of keeping it idle forever", () => {
    const start = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      new Map(),
      NOW,
    );
    const later = NOW + FORGET_AFTER_MS + 1;
    const plan = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      start.state,
      later,
    );
    expect(plan.actions).toEqual([{ kind: "finish", leafId: 10 }]);
    expect(plan.state.has(10)).toBe(false);
    // A forgotten leaf with an unchanged stale file never restarts.
    const after = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      plan.state,
      later + 3000,
    );
    expect(after.actions).toEqual([]);
  });

  it("finishes owned sessions whose leaf left the tab tree", () => {
    const start = planSshAgentUpdates(
      [leaf(10), leaf(11, 2)],
      tsMap([
        [10, NOW_SEC],
        [11, NOW_SEC - FORGET_AFTER_MS],
      ]),
      new Map(),
      NOW,
    );
    expect(start.state.get(11)?.inStore).toBe(false);
    const plan = planSshAgentUpdates([], new Map(), start.state, NOW + 3000);
    // Only the store-owned leaf produces a finish; the plain observation is
    // silently dropped.
    expect(plan.actions).toEqual([{ kind: "finish", leafId: 10 }]);
    expect(plan.state.size).toBe(0);
  });

  it("treats an absent status while owned as idle within the forget window", () => {
    const start = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, NOW_SEC]]),
      new Map(),
      NOW,
    );
    const plan = planSshAgentUpdates(
      [leaf(10)],
      tsMap([[10, null]]),
      start.state,
      NOW + WORKING_HOLD_MS + 1,
    );
    expect(plan.actions).toEqual([
      { kind: "status", leafId: 10, status: "idle" },
    ]);
  });
});
