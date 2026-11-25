import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowExpand01Icon,
  ArrowShrink01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useShortcutLabel } from "@/modules/shortcuts/lib/useShortcutLabel";
import { useZenStore } from "./lib/zenStore";

const LABEL = "Toggle zen mode";

/**
 * Turns zen on and off; `aria-pressed` tells whether zen is on. The hint is a
 * plain `title` (no Radix Tooltip), so the button renders without a
 * TooltipProvider, and rendering it calls nothing in Tauri. The title carries
 * the current `view.zenMode` shortcut from the settings, in the pattern of
 * the space switcher (`Spaces · {shortcut}`); without a binding it is the bare
 * label.
 */
export function ZenToggleButton({ className }: { className?: string }) {
  const on = useZenStore((s) => s.on);
  const toggleZen = useZenStore((s) => s.toggleZen);
  const shortcut = useShortcutLabel("view.zenMode");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={LABEL}
      aria-pressed={on}
      title={shortcut ? `${LABEL} · ${shortcut}` : LABEL}
      onClick={toggleZen}
      className={cn(
        "size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <HugeiconsIcon
        icon={on ? ArrowShrink01Icon : ArrowExpand01Icon}
        size={14}
        strokeWidth={1.75}
      />
    </Button>
  );
}
