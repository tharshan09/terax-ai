import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "group relative flex w-px items-center justify-center bg-border ring-offset-background transition-colors hover:bg-primary/60",
        // Wider grab + cursor zone via the ::after pseudo. It's absolutely
        // positioned (out of flow), so the 1px box the library measures for
        // drag detection is unchanged — resizing stays intact.
        "after:absolute after:inset-y-0 after:left-1/2 after:w-2.5 after:-translate-x-1/2 after:cursor-col-resize",
        "focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-2.5 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 aria-[orientation=horizontal]:after:cursor-row-resize",
        "[&[aria-orientation=horizontal]>div]:rotate-90",
        className
      )}
      {...props}
    >
      {withHandle && (
        // Absolutely positioned so it does NOT stretch the 1px separator via
        // flex min-content — otherwise the box the library measures drifts off
        // the visible line and the grab zone ends up offset to the side.
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border transition-colors group-hover:bg-primary" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
