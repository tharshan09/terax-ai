import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/**
 * Shown in the status bar when the active terminal tab runs inside a Terax
 * managed (restart-safe) tmux session. Surfaces the state Terax hides tmux's own
 * status line for, so it does not waste a terminal row. `session` is the managed
 * session name (shown only in the tooltip; the pill stays clean).
 */
export function RestartSafeBadge({ session }: { session: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-accent/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <HugeiconsIcon
            icon={ArrowReloadHorizontalIcon}
            size={11}
            strokeWidth={2}
          />
          restart-safe
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <div className="font-medium">Restart-safe session</div>
        <div className="text-muted-foreground">
          Survives an app restart · {session}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
