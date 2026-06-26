import { cn } from "@/lib/utils";
import { ClaudeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { StatusbarWidgetCtx } from "./context";

export function ClaudeModelWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const model = ctx.claudeStatus?.model;
  if (!model) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-muted-foreground"
      title={`Claude Code model: ${model}`}
    >
      <HugeiconsIcon icon={ClaudeIcon} size={12} strokeWidth={1.75} />
      <span className="max-w-36 truncate">{model}</span>
    </span>
  );
}

export function ClaudeContextWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const pct = ctx.claudeStatus?.contextPct;
  if (pct == null) return null;
  const rounded = Math.round(pct);
  const high = rounded >= 80;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 tabular-nums",
        high ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      )}
      title={`Claude Code context window used: ${rounded}%`}
    >
      ctx {rounded}%
    </span>
  );
}

export function ClaudeCostWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const cost = ctx.claudeStatus?.costUsd;
  if (cost == null) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground"
      title="Claude Code session cost (USD)"
    >
      ${cost.toFixed(2)}
    </span>
  );
}
