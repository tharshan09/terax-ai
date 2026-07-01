import { create } from "zustand";
import type { DropEdge } from "./panes";

// Drop-target state for pane drag & drop, mirrored into the pane overlays so a
// drag re-renders only the pane whose highlight changes (not the whole tree).
type PaneDndState = {
  sourceLeafId: number | null;
  targetLeafId: number | null;
  edge: DropEdge | null;
  setDrag: (sourceLeafId: number | null) => void;
  setTarget: (targetLeafId: number | null, edge: DropEdge | null) => void;
};

export const usePaneDndStore = create<PaneDndState>((set) => ({
  sourceLeafId: null,
  targetLeafId: null,
  edge: null,
  setDrag: (sourceLeafId) =>
    set({ sourceLeafId, targetLeafId: null, edge: null }),
  setTarget: (targetLeafId, edge) =>
    set((s) =>
      s.targetLeafId === targetLeafId && s.edge === edge
        ? s
        : { targetLeafId, edge },
    ),
}));
