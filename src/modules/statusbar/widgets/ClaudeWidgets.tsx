import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ClaudeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { StatusbarWidgetCtx } from "./context";

function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

export function ClaudeModelWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const s = ctx.claudeStatus;
  const model = s?.model;
  if (!model) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
          <HugeiconsIcon icon={ClaudeIcon} size={12} strokeWidth={1.75} />
          <span className="max-w-36 truncate">{model}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {s?.modelId ? `${model} · ${s.modelId}` : model}
      </TooltipContent>
    </Tooltip>
  );
}

export function ClaudeContextWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const s = ctx.claudeStatus;
  const pct = s?.contextPct;
  if (pct == null) return null;
  const rounded = Math.round(pct);
  const high = rounded >= 80;
  const tokens =
    s?.usedTokens != null && s.maxTokens != null
      ? `${fmtTokens(s.usedTokens)} / ${fmtTokens(s.maxTokens)} tokens (${rounded}%)`
      : `${rounded}% of the context window used`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 tabular-nums",
            high
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground",
          )}
        >
          ctx {rounded}%
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tokens}</TooltipContent>
    </Tooltip>
  );
}

export function ClaudeCostWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const s = ctx.claudeStatus;
  const cost = s?.costUsd;
  if (cost == null) return null;
  const lines =
    s?.linesAdded != null || s?.linesRemoved != null
      ? ` · +${s?.linesAdded ?? 0}/-${s?.linesRemoved ?? 0} lines`
      : "";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0 items-center gap-1 tabular-nums text-muted-foreground">
          ${cost.toFixed(2)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{`Session cost (USD)${lines}`}</TooltipContent>
    </Tooltip>
  );
}
