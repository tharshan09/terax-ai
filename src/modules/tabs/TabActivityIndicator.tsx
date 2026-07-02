import { useAgentStore } from "@/modules/agents/store/agentStore";
import { leafIds, type PaneNode } from "@/modules/terminal/lib/panes";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { aggregateAgentStatus } from "./lib/aggregateAgentStatus";

type Props = {
  paneTree: PaneNode;
};

export function TabActivityIndicator({ paneTree }: Props) {
  // Primitive selector: zustand's default equality bails re-renders unless the
  // aggregated status actually changes, so pane session churn stays cheap.
  const status = useAgentStore((s) =>
    aggregateAgentStatus(leafIds(paneTree).map((id) => s.sessions[id]?.status)),
  );

  if (status === null) return null;

  if (status === "working") {
    return (
      <HugeiconsIcon
        icon={Loading03Icon}
        aria-label="Agent working"
        className="size-3 shrink-0 animate-spin text-primary"
      />
    );
  }

  // Mirrors the editor dirty-dot but colored to draw attention.
  return (
    <span
      aria-label="Agent waiting for input"
      className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
    />
  );
}
