import { Button } from "@/components/ui/button";
import { DocViewToggle } from "@/components/ui/DocViewToggle";
import { IS_MAC } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useZenStore } from "@/modules/zen/lib/zenStore";
import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import type { PreviewHeaderModel } from "./lib/previewHeader";

type Props = {
  model: PreviewHeaderModel;
  onSetView?: (mode: "rendered" | "raw") => void;
  onReload?: () => void;
  /** A reload is running: the button shows `aria-busy`. */
  reloading?: boolean;
  /** Slot for the "Open in Browser" button, shown when the model says so. */
  openInBrowser?: ReactNode;
  /** Slot for the zen toggle, shown when the model says so. */
  zen?: ReactNode;
};

/**
 * The bar above a preview: file name, then Reload, Rendered/Raw, "Open in
 * Browser" and the zen toggle as far as the model shows them. It sits in the
 * flow above the content (no overlay). In zen on macOS it leaves room on the
 * left for the window buttons (`pl-20`). Every hint is a plain `title`, so it
 * renders without a TooltipProvider.
 */
export function PreviewHeader({
  model,
  onSetView,
  onReload,
  reloading = false,
  openInBrowser,
  zen,
}: Props) {
  const zenOn = useZenStore((s) => s.on);
  return (
    <div
      data-preview-header=""
      className={cn(
        "flex h-9 shrink-0 items-center gap-1 border-b border-border/60 bg-card/40 pr-1.5",
        zenOn && IS_MAC ? "pl-20" : "pl-3",
      )}
    >
      <span
        className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground"
        title={model.fileName}
      >
        {model.fileName}
      </span>
      {model.reload && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Reload"
          title="Reload"
          aria-busy={reloading}
          disabled={model.reload.disabled}
          onClick={onReload}
          className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowReloadHorizontalIcon}
            size={14}
            strokeWidth={1.75}
            className={cn(reloading && "animate-spin")}
          />
        </Button>
      )}
      {model.view && onSetView && (
        <DocViewToggle
          mode={model.view.mode}
          onChange={onSetView}
          renderedDisabled={model.view.renderedDisabled}
          renderedHint="Save to preview"
        />
      )}
      {model.openInBrowser && openInBrowser}
      {model.zen && zen}
    </div>
  );
}
