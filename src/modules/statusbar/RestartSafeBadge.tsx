import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/**
 * Shown in the status bar when the active terminal tab runs inside a Terax
 * managed (restart-safe) tmux session. Surfaces the state Terax hides tmux's
 * own status line for, so it does not waste a terminal row. The tooltip says
 * what the state MEANS for the user (survives quits, how to end it) — the
 * internal session name is plumbing and stays out of the UI everywhere.
 */
export function RestartSafeBadge() {
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
      <TooltipContent side="top" className="max-w-[260px] text-xs">
        <div className="font-medium">Restart-safe terminal</div>
        <div className="text-muted-foreground">
          Whatever runs here keeps running when Terax quits or updates — the tab
          reconnects on the next launch. Closing the tab ends the session for
          good.
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
