import { cn } from "@/lib/utils";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import type { StatusbarWidgetCtx } from "./context";

/**
 * Status of a coding agent (Claude Code) running in the ACTIVE terminal tab.
 * Distinct from the AI-panel agent pill on the right of the bar; this one
 * tracks the in-terminal agent via the OSC-driven agent store, keyed by leaf.
 */
export function AgentStatusWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const session = useAgentStore((s) =>
    ctx.activeLeafId != null ? s.sessions[ctx.activeLeafId] : undefined,
  );
  if (!session) return null;

  const waiting = session.status === "waiting";
  const name = session.agent
    ? session.agent.charAt(0).toUpperCase() + session.agent.slice(1)
    : "Agent";

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
        waiting
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          : "bg-primary/15 text-primary",
      )}
      title={waiting ? `${name} is waiting for input` : `${name} is working`}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          waiting ? "bg-amber-500" : "animate-pulse bg-primary",
        )}
      />
      {name} {waiting ? "needs input" : "working"}
    </span>
  );
}
