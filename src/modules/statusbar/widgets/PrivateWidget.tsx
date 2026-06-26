import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IncognitoIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { StatusbarWidgetCtx } from "./context";

export function PrivateWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  if (!ctx.privateActive) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0 cursor-default items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-400">
          <HugeiconsIcon icon={IncognitoIcon} size={11} strokeWidth={2} />
          <span>Private: hidden from AI</span>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-64 text-[11px] leading-relaxed"
      >
        AI can't see this terminal's output. Use it for secrets, SSH, or
        anything you don't want sent to the model.
      </TooltipContent>
    </Tooltip>
  );
}
