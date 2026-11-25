import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { WorkspaceEnv } from "@/modules/workspace";
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { browserOpenable } from "./lib/browserOpenable";
import { openInBrowser } from "./lib/openInBrowser";

const LABEL = "Open in Browser";

/**
 * Header button that opens the file in the default browser. Renders nothing
 * when `browserOpenable` says no. The hint is a plain `title` (no Radix
 * Tooltip), so it renders without a TooltipProvider.
 */
export function OpenInBrowserButton({
  path,
  workspace,
  className,
}: {
  path: string;
  workspace?: WorkspaceEnv;
  className?: string;
}) {
  if (!browserOpenable(path, workspace)) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={LABEL}
      title={LABEL}
      onClick={() => void openInBrowser(path, workspace)}
      className={cn(
        "size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={1.75} />
    </Button>
  );
}
