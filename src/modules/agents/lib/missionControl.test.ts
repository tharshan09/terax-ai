import type { Tab } from "@/modules/tabs";
import { describe, expect, it } from "vitest";
import {
  type AgentRow,
  buildAgentRows,
  cycleWaitingTarget,
  filterAgentRows,
} from "./missionControl";
import type { AgentSession, LocalAgentState } from "./types";

function session(
  over: Partial<AgentSession> & { leafId: number },
): AgentSession {
  return {
    tabId: over.leafId,
    agent: "claude",
    status: "working",
    startedAt: 1000,
    lastActivityAt: 1000,
    attentionSince: null,
    ...over,
  };
}

function sessionMap(list: AgentSession[]): Record<number, AgentSession> {
  return Object.fromEntries(list.map((s) => [s.leafId, s]));
}

function sshTab(
  id: number,
  leafId: number,
  over: Record<string, unknown>,
): Tab {
  return {
    id,
    kind: "terminal",
    title: `tab${id}`,
    spaceId: "s",
    activeLeafId: leafId,
    paneTree: { kind: "leaf", id: leafId, cwd: "/home/u/proj", ...over },
    workspace: { kind: "ssh", host: "claude" },
    ...over,
  } as unknown as Tab;
}

describe("buildAgentRows", () => {
  it("enriches a terminal session with host, cwd, session, and title", () => {
    const tabs = [
      sshTab(7, 70, { tmuxSession: "wt-obs-801", customTitle: "obs work" }),
    ];
    const rows = buildAgentRows(
      sessionMap([session({ leafId: 70, tabId: 7 })]),
      null,
      tabs,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "terminal",
      tabId: 7,
      leafId: 70,
      host: "claude",
      cwd: "/home/u/proj",
      session: "wt-obs-801",
      title: "obs work",
    });
  });

  it("orders waiting before working before idle, newest first in a bucket", () => {
    const rows = buildAgentRows(
      sessionMap([
        session({ leafId: 1, status: "idle", startedAt: 100 }),
        session({ leafId: 2, status: "working", startedAt: 200 }),
        session({ leafId: 3, status: "working", startedAt: 400 }),
        session({ leafId: 4, status: "waiting", attentionSince: 300 }),
      ]),
      null,
      [],
    );
    expect(rows.map((r) => r.leafId)).toEqual([4, 3, 2, 1]);
  });

  it("includes the Terax local agent as a single row", () => {
    const local: LocalAgentState = { agent: "terax", status: "waiting" };
    const rows = buildAgentRows({}, local, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "local",
      key: "local",
      title: "Terax agent",
      status: "waiting",
      leafId: null,
    });
  });

  it("falls back gracefully when the tab is gone (closed mid-run)", () => {
    const rows = buildAgentRows(
      sessionMap([session({ leafId: 9, tabId: 9 })]),
      null,
      [],
    );
    expect(rows[0]).toMatchObject({
      title: "Agent",
      host: null,
      cwd: null,
      session: null,
    });
  });
});

describe("filterAgentRows", () => {
  const rows: AgentRow[] = [
    {
      key: "t1",
      kind: "terminal",
      tabId: 1,
      leafId: 1,
      agent: "claude",
      status: "working",
      title: "backend",
      host: "claude",
      cwd: "/srv/api",
      session: "main",
      startedAt: 0,
      attentionSince: null,
    },
    {
      key: "t2",
      kind: "terminal",
      tabId: 2,
      leafId: 2,
      agent: "codex",
      status: "waiting",
      title: "frontend",
      host: "s1",
      cwd: "/srv/web",
      session: "wt-web",
      startedAt: 0,
      attentionSince: null,
    },
  ];

  it("matches on any visible field, case-insensitive", () => {
    expect(filterAgentRows(rows, "CODEX").map((r) => r.leafId)).toEqual([2]);
    expect(filterAgentRows(rows, "api").map((r) => r.leafId)).toEqual([1]);
    expect(filterAgentRows(rows, "wt-web").map((r) => r.leafId)).toEqual([2]);
    expect(filterAgentRows(rows, "waiting").map((r) => r.leafId)).toEqual([2]);
  });

  it("returns everything for an empty query", () => {
    expect(filterAgentRows(rows, "  ")).toHaveLength(2);
  });
});

describe("cycleWaitingTarget", () => {
  const sessions = sessionMap([
    session({ leafId: 10, tabId: 1, status: "waiting", attentionSince: 300 }),
    session({ leafId: 20, tabId: 2, status: "waiting", attentionSince: 200 }),
    session({ leafId: 30, tabId: 3, status: "working" }),
  ]);

  it("returns the most recent waiting agent when starting fresh", () => {
    expect(cycleWaitingTarget(sessions, null)).toEqual({
      tabId: 1,
      leafId: 10,
    });
  });

  it("advances to the next waiting agent and wraps around", () => {
    expect(cycleWaitingTarget(sessions, 10)).toEqual({ tabId: 2, leafId: 20 });
    expect(cycleWaitingTarget(sessions, 20)).toEqual({ tabId: 1, leafId: 10 });
  });

  it("returns null when nothing is waiting", () => {
    expect(
      cycleWaitingTarget(sessionMap([session({ leafId: 1 })]), null),
    ).toBeNull();
  });
});
