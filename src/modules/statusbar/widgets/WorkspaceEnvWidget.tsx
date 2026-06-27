import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IS_WINDOWS } from "@/lib/platform";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import { CloudIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { WorkspaceEnvSelector } from "../WorkspaceEnvSelector";
import type { StatusbarWidgetCtx } from "./context";

/**
 * Cross-platform workspace indicator. SSH is shown on every platform (the env
 * store is populated regardless of OS); the Windows WSL/Local switcher stays
 * Windows-only. On a plain local mac/Linux session there is nothing useful to
 * show, so the widget renders nothing.
 */
export function WorkspaceEnvWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const env = useWorkspaceEnvStore((s) => s.env);

  if (env.kind === "ssh") {
    const label = env.label ?? env.host;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground">
            <HugeiconsIcon icon={CloudIcon} size={13} strokeWidth={1.75} />
            <span className="max-w-28 truncate">SSH: {label}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Connected to {env.host}</TooltipContent>
      </Tooltip>
    );
  }

  if (IS_WINDOWS) {
    return <WorkspaceEnvSelector onSelect={ctx.onWorkspaceChange} />;
  }

  return null;
}
