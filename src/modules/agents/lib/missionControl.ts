import type { Tab } from "@/modules/tabs";
import { findLeafNode, hasLeaf } from "@/modules/terminal";
import type { AgentSession, AgentStatus, LocalAgentState } from "./types";

/**
 * One row in the agent mission-control overview: a live agent enriched from its
 * tab (title, host, cwd, tmux session) so the user can see, at a glance, which
 * of many concurrent agents needs attention and where it lives. The Terax
 * in-app agent is a single `local` row; every terminal coding-agent is a
 * `terminal` row keyed by leaf.
 */
export type AgentRow = {
  key: string;
  kind: "local" | "terminal";
  /** Present for terminal rows; the jump target. */
  tabId: number | null;
  leafId: number | null;
  agent: string;
  status: AgentStatus;
  title: string;
  host: string | null;
  cwd: string | null;
  session: string | null;
  startedAt: number;
  attentionSince: number | null;
};

// Sort order: agents needing input first, then working, then idle, so the row
// the user most likely wants sits at the top. Within a bucket, the most
// recently active is first (attention time for waiting, start time otherwise).
const STATUS_RANK: Record<AgentStatus, number> = {
  waiting: 0,
  working: 1,
  idle: 2,
};

function terminalTabForLeaf(tabs: Tab[], leafId: number): Tab | null {
  for (const t of tabs) {
    if (t.kind === "terminal" && hasLeaf(t.paneTree, leafId)) return t;
  }
  return null;
}

function rowFromSession(session: AgentSession, tabs: Tab[]): AgentRow {
  const tab = terminalTabForLeaf(tabs, session.leafId);
  const leaf =
    tab && tab.kind === "terminal"
      ? findLeafNode(tab.paneTree, session.leafId)
      : null;
  const host =
    tab?.kind === "terminal" && tab.workspace?.kind === "ssh"
      ? tab.workspace.host
      : null;
  const title =
    (tab?.kind === "terminal" && (tab.customTitle || tab.title)) || "Agent";
  const cwd =
    (tab?.kind === "terminal" ? (leaf?.cwd ?? tab.cwd) : undefined) ?? null;
  const session_ =
    (tab?.kind === "terminal"
      ? (leaf?.tmuxSession ?? tab.tmuxSession)
      : null) ?? null;

  return {
    key: `t${session.leafId}`,
    kind: "terminal",
    tabId: session.tabId,
    leafId: session.leafId,
    agent: session.agent,
    status: session.status,
    title,
    host,
    cwd,
    session: session_,
    startedAt: session.startedAt,
    attentionSince: session.attentionSince,
  };
}

function rowFromLocal(local: LocalAgentState): AgentRow | null {
  if (!local) return null;
  return {
    key: "local",
    kind: "local",
    tabId: null,
    leafId: null,
    agent: local.agent,
    status: local.status,
    title: "Terax agent",
    host: null,
    cwd: null,
    session: null,
    // The local agent carries no timestamps in the store; 0 sorts it last
    // within its bucket and suppresses the (meaningless) elapsed readout.
    startedAt: 0,
    attentionSince: null,
  };
}

/** Build the sorted overview rows from the agent store. */
export function buildAgentRows(
  sessions: Record<number, AgentSession>,
  localAgent: LocalAgentState,
  tabs: Tab[],
): AgentRow[] {
  const rows = Object.values(sessions).map((s) => rowFromSession(s, tabs));
  const local = rowFromLocal(localAgent);
  if (local) rows.push(local);

  return rows.sort((a, b) => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    const aAt = a.attentionSince ?? a.startedAt;
    const bAt = b.attentionSince ?? b.startedAt;
    return bAt - aAt;
  });
}

/** Case-insensitive substring filter over the fields the user can see. Empty
 *  query returns every row unchanged (already sorted). */
export function filterAgentRows(rows: AgentRow[], query: string): AgentRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.agent, r.title, r.host, r.cwd, r.session, r.status]
      .filter((v): v is string => !!v)
      .some((v) => v.toLowerCase().includes(q)),
  );
}

/** The leaf/tab of the next waiting terminal agent AFTER `fromLeafId`, wrapping
 *  around, so the attention hotkey cycles through every waiting agent instead
 *  of pinning the most recent one. Null when none is waiting. */
export function cycleWaitingTarget(
  sessions: Record<number, AgentSession>,
  fromLeafId: number | null,
): { tabId: number; leafId: number } | null {
  const waiting = Object.values(sessions)
    .filter((s) => s.status === "waiting")
    .sort((a, b) => (b.attentionSince ?? 0) - (a.attentionSince ?? 0));
  if (waiting.length === 0) return null;
  const idx = waiting.findIndex((s) => s.leafId === fromLeafId);
  const next = waiting[(idx + 1) % waiting.length];
  return { tabId: next.tabId, leafId: next.leafId };
}
