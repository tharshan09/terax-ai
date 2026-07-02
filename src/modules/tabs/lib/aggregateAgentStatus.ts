import type { AgentStatus } from "@/modules/agents/lib/types";

/**
 * Collapse the agent status of every pane in a tab into a single badge state.
 * "working" wins over "waiting" so a busy pane always shows the spinner even
 * when a sibling pane is waiting for input. An "idle" pane (an agent that has
 * launched but not started working yet) never contributes, so a freshly opened
 * agent at its trust/welcome prompt shows no tab indicator.
 */
export function aggregateAgentStatus(
  statuses: (AgentStatus | undefined)[],
): "working" | "waiting" | null {
  let waiting = false;
  for (const status of statuses) {
    if (status === "working") return "working";
    if (status === "waiting") waiting = true;
  }
  return waiting ? "waiting" : null;
}
