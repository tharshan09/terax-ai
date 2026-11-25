import { zenChrome } from "./zenChrome";
import { useZenStore } from "./zenStore";

/** Border and corners every pane carries outside zen. */
export const PANE_FRAME_CLASS = "rounded-md border border-border/60";

/**
 * Frame classes for a pane: the usual border and corners outside zen, none in
 * zen. The pane frame does not depend on the tab kind, so the rule is read
 * from `zenChrome` without one.
 */
export function usePaneFrameClass(): string {
  const on = useZenStore((s) => s.on);
  return zenChrome(on, undefined).paneFrame ? PANE_FRAME_CLASS : "";
}
