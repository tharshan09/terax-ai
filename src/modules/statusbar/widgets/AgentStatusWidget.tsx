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

  const { status } = session;
  const name = session.agent
    ? session.agent.charAt(0).toUpperCase() + session.agent.slice(1)
    : "Agent";

  // "idle" = the agent has launched but not started working (e.g. sitting at
  // its trust/welcome prompt). Show its presence, but muted and without the
  // working animation so it never reads as active.
  const label =
    status === "waiting" ? "needs input" : status === "working" ? "working" : "idle";
  const title =
    status === "waiting"
      ? `${name} is waiting for input`
      : status === "working"
        ? `${name} is working`
        : `${name} is idle`;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
        status === "waiting"
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          : status === "working"
            ? "bg-primary/15 text-primary"
            : "bg-muted text-muted-foreground",
      )}
      title={title}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "waiting"
            ? "bg-amber-500"
            : status === "working"
              ? "animate-pulse bg-primary"
              : "bg-muted-foreground/50",
        )}
      />
      {name} {label}
    </span>
  );
}
