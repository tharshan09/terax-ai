import { create } from "zustand";
import type { DropEdge } from "./panes";

/** Where a dragged pane would land: beside another pane on one of its edges,
 *  or as a new tab at an insertion gap in the tab strip. */
export type PaneDropTarget =
  | { kind: "pane"; leafId: number; edge: DropEdge }
  | { kind: "newTab"; gapIndex: number };

// Drop-target state for pane drag & drop, mirrored into the pane overlays and
// the tab strip so a drag re-renders only the surface whose highlight changes
// (not the whole tree). Subscribers select a primitive out of `target`, so an
// unchanged highlight never re-renders even while the pointer keeps moving.
type PaneDndState = {
  sourceLeafId: number | null;
  target: PaneDropTarget | null;
  setDrag: (sourceLeafId: number | null) => void;
  setTarget: (target: PaneDropTarget | null) => void;
};

function sameTarget(
  a: PaneDropTarget | null,
  b: PaneDropTarget | null,
): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a.kind === "pane" && b.kind === "pane")
    return a.leafId === b.leafId && a.edge === b.edge;
  if (a.kind === "newTab" && b.kind === "newTab")
    return a.gapIndex === b.gapIndex;
  return false;
}

export const usePaneDndStore = create<PaneDndState>((set) => ({
  sourceLeafId: null,
  target: null,
  setDrag: (sourceLeafId) => set({ sourceLeafId, target: null }),
  setTarget: (target) =>
    set((s) => (sameTarget(s.target, target) ? s : { target })),
}));
