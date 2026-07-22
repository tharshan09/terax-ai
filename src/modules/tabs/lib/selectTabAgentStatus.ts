import type { AgentSession } from "@/modules/agents/lib/types";

/**
 * Collapse the agent status of every pane in a tab into a single badge state,
 * reading each leaf's status straight from the sessions record.
 *
 * Rule: "working" wins over "waiting" so a busy pane always shows the spinner
 * even when a sibling pane is waiting for input. An "idle" pane (an agent that
 * has launched but not started working yet) never contributes, so a freshly
 * opened agent at its trust/welcome prompt shows no tab indicator.
 *
 * Zero-allocation on purpose: it takes a pre-computed leaf-id list (so the pane
 * tree is never re-walked) and reads statuses inline instead of building an
 * intermediate `.map()` array. This is the hot path — it runs for every mounted
 * tab on every agent-store change, so it must neither allocate nor traverse. The
 * primitive result lets zustand's Object.is bailout still suppress the re-render
 * when the aggregate is unchanged.
 */
export function selectTabAgentStatus(
  sessions: Record<number, AgentSession>,
  leafIds: readonly number[],
): "working" | "waiting" | null {
  let waiting = false;
  for (const id of leafIds) {
    const status = sessions[id]?.status;
    if (status === "working") return "working";
    if (status === "waiting") waiting = true;
  }
  return waiting ? "waiting" : null;
}
