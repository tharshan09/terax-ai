import { getResizeZoomFactor } from "@/lib/zoomResizeFix";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DropEdge } from "./panes";
import { usePaneDndStore } from "./paneDndStore";

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

/** Pointer-based pane drag & drop (HTML5 DnD is intercepted by Tauri). A drag
 *  handle calls `startDrag(leafId, e)`; on drop the leaf moves next to the pane
 *  under the cursor, on the nearest edge. The ghost follows the cursor via
 *  direct DOM writes so moving only re-renders the highlighted pane. */
export function useTerminalPaneDnd(
  onMove: (sourceLeafId: number, targetLeafId: number, edge: DropEdge) => void,
) {
  const [dragging, setDragging] = useState(false);
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const cleanupRef = useRef<(() => void) | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

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
      const sx = e.clientX;
      const sy = e.clientY;
      let active = false;
      let target: { id: number; edge: DropEdge } | null = null;
      const store = usePaneDndStore.getState();

      const move = (ev: PointerEvent) => {
        if (!active) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return;
          active = true;
          setDragging(true);
          store.setDrag(sourceLeafId);
        }
        placeGhost(ev.clientX, ev.clientY);
        const leafEl = document
          .elementFromPoint(ev.clientX, ev.clientY)
          ?.closest<HTMLElement>("[data-pane-leaf]");
        const id = leafEl ? Number(leafEl.dataset.paneLeaf) : Number.NaN;
        if (!leafEl || !Number.isFinite(id) || id === sourceLeafId) {
          target = null;
          store.setTarget(null, null);
          return;
        }
        const edge = edgeAt(leafEl, ev.clientX, ev.clientY);
        target = { id, edge };
        store.setTarget(id, edge);
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
        if (active && commit && target) {
          onMoveRef.current(sourceLeafId, target.id, target.edge);
        }
      };
      const up = () => end(true);
      const cancel = () => end(false);
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      cleanupRef.current = detach;
    },
    [],
  );

  useEffect(() => () => cleanupRef.current?.(), []);

  return { ghostRef, dragging, startDrag };
}
