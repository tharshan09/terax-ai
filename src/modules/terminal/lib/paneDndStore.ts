import { create } from "zustand";
import type { DropEdge } from "./panes";

/** Where in a pane the pointer sits: near one of its edges, meaning the dragged
 *  pane is inserted there, or in its middle, meaning the two trade places. */
export type PaneDropSpot = DropEdge | "center";

/** Where a dragged pane would land: on another pane (edge or middle), or as a
 *  new tab at an insertion gap in the tab strip. */
export type PaneDropTarget =
  | { kind: "pane"; leafId: number; spot: PaneDropSpot }
  | { kind: "newTab"; gapIndex: number };

// Drop-target state for pane drag & drop, mirrored into the pane overlays and
// the tab strip so a drag re-renders only the surface whose highlight changes
// (not the whole tree). Subscribers select a primitive out of `target`, so an
// unchanged highlight never re-renders even while the pointer keeps moving.
type PaneDndState = {
  sourceLeafId: number | null;
  /** The tab the dragged pane belongs to, so a surface can tell at render time
   *  whether the drag concerns it at all. The tab strip needs that: it only
   *  lists one space, and the space can change while the button is held. */
  sourceTabId: string | null;
  target: PaneDropTarget | null;
  setDrag: (sourceLeafId: number | null, sourceTabId?: string | null) => void;
  setTarget: (target: PaneDropTarget | null) => void;
};

function sameTarget(
  a: PaneDropTarget | null,
  b: PaneDropTarget | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.kind === "pane" && b.kind === "pane")
    return a.leafId === b.leafId && a.spot === b.spot;
  if (a.kind === "newTab" && b.kind === "newTab")
    return a.gapIndex === b.gapIndex;
  return false;
}

export const usePaneDndStore = create<PaneDndState>((set) => ({
  sourceLeafId: null,
  sourceTabId: null,
  target: null,
  setDrag: (sourceLeafId, sourceTabId = null) =>
    set({ sourceLeafId, sourceTabId, target: null }),
  setTarget: (target) =>
    set((s) => (sameTarget(s.target, target) ? s : { target })),
}));
