import { getResizeZoomFactor } from "@/lib/zoomResizeFix";
import { gapIndexAt, tabStripAt } from "@/modules/tabs/lib/tabStripGap";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type PaneDropTarget, usePaneDndStore } from "./paneDndStore";
import type { DropEdge } from "./panes";

// Only turn a press into a drag past this many px, so a click on the handle
// doesn't accidentally move a pane.
const THRESHOLD = 6;

// Which edge of `el` the pointer is nearest — decides where the moved pane
// lands (left/right split, or top/bottom). The leaf wrapper carries
// `data-pane-leaf` (not `data-panel`), so its rect is NOT zoom-patched; scale it
// into the zoomed pointer space before measuring.
function edgeAt(el: HTMLElement, x: number, y: number): DropEdge {
  const r = el.getBoundingClientRect();
  const z = getResizeZoomFactor();
  const px = (x - r.left * z) / (r.width * z || 1);
  const py = (y - r.top * z) / (r.height * z || 1);
  const dist = { left: px, right: 1 - px, top: py, bottom: 1 - py };
  return (Object.keys(dist) as DropEdge[]).reduce((a, b) =>
    dist[b] < dist[a] ? b : a,
  );
}

type Handlers = {
  /** Drop landed on another pane: move the leaf beside it, on `edge`. */
  onMove: (sourceLeafId: number, targetLeafId: number, edge: DropEdge) => void;
  /** Drop landed on the tab strip: the leaf becomes a tab of its own at
   *  `gapIndex` (the same insertion gaps a tab reorder uses). */
  onBreakOut: (sourceLeafId: number, gapIndex: number) => void;
};

/** Pointer-based pane drag & drop (HTML5 DnD is intercepted by Tauri). A drag
 *  handle calls `startDrag(leafId, e)`; on drop the leaf moves next to the pane
 *  under the cursor on the nearest edge, or breaks out into its own tab when the
 *  drop is on the tab strip. The ghost follows the cursor via direct DOM writes
 *  so moving only re-renders the highlighted surface.
 *
 *  An inactive tab's layer is `pointer-events: none`, so its panes are never
 *  under the cursor: dropping onto a pane in ANOTHER tab is not reachable from
 *  here, which is why the strip is the way across. */
export function useTerminalPaneDnd({ onMove, onBreakOut }: Handlers) {
  const [dragging, setDragging] = useState(false);
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const cleanupRef = useRef<(() => void) | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onBreakOutRef = useRef(onBreakOut);
  onBreakOutRef.current = onBreakOut;

  const placeGhost = (x: number, y: number) => {
    lastPosRef.current = { x, y };
    const g = ghostElRef.current;
    if (g) {
      g.style.left = `${x + 12}px`;
      g.style.top = `${y + 8}px`;
    }
  };

  const ghostRef = useCallback((el: HTMLDivElement | null) => {
    ghostElRef.current = el;
    if (el) placeGhost(lastPosRef.current.x, lastPosRef.current.y);
  }, []);

  const startDrag = useCallback(
    (sourceLeafId: number, e: ReactPointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      // A second pointer (touch, pen) can grab another handle while a drag is
      // live. The listeners are on the window, so the first pointerup would end
      // both and commit twice; abort the older drag rather than run two.
      cleanupRef.current?.();
      const pointerId = e.pointerId;
      const sx = e.clientX;
      const sy = e.clientY;
      let active = false;
      let target: PaneDropTarget | null = null;
      const store = usePaneDndStore.getState();

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (!active) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return;
          active = true;
          setDragging(true);
          store.setDrag(sourceLeafId);
        }
        placeGhost(ev.clientX, ev.clientY);
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const leafEl = under?.closest<HTMLElement>("[data-pane-leaf]");
        const id = leafEl ? Number(leafEl.dataset.paneLeaf) : Number.NaN;
        if (leafEl && Number.isFinite(id) && id !== sourceLeafId) {
          target = {
            kind: "pane",
            leafId: id,
            edge: edgeAt(leafEl, ev.clientX, ev.clientY),
          };
        } else {
          const strip = tabStripAt(under);
          target = strip
            ? { kind: "newTab", gapIndex: gapIndexAt(strip, ev.clientX) }
            : null;
        }
        store.setTarget(target);
      };
      const detach = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        cleanupRef.current = null;
      };
      const end = (commit: boolean) => {
        detach();
        store.setDrag(null);
        setDragging(false);
        if (!active || !commit || !target) return;
        if (target.kind === "pane") {
          onMoveRef.current(sourceLeafId, target.leafId, target.edge);
        } else {
          onBreakOutRef.current(sourceLeafId, target.gapIndex);
        }
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) end(true);
      };
      const cancel = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) end(false);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      // An abort, not just a detach: whoever cuts this drag short (a second
      // pointer, an unmount) also has to clear the ghost and the shared drop
      // target, or the tab strip keeps painting an insertion line for a drag
      // that can no longer commit.
      cleanupRef.current = () => end(false);
    },
    [],
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  return { ghostRef, dragging, startDrag };
}
