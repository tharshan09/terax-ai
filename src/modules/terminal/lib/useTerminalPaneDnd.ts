import { getResizeZoomFactor } from "@/lib/zoomResizeFix";
import {
  gapIndexAt,
  stripHasTab,
  tabStripAt,
} from "@/modules/tabs/lib/tabStripGap";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PaneDropSpot,
  type PaneDropTarget,
  type SwapAxis,
  usePaneDndStore,
} from "./paneDndStore";
import type { DropEdge } from "./panes";

// Only turn a press into a drag past this many px, so a click on the handle
// doesn't accidentally move a pane.
const THRESHOLD = 6;

// The middle third in both axes means "trade places"; nearer an edge means
// "insert there". A third is wide enough that the boundary does not flicker
// under a shaking hand, so no hysteresis is needed.
//
// Exported because the overlay draws this exact box: a frame larger than the
// region that actually swaps would teach the wrong target, and releasing just
// inside it would insert instead, rebuilding the split and discarding the very
// sizes the swap exists to keep.
export const CENTER_INSET = 1 / 3;
const CENTER_LO = CENTER_INSET;
const CENTER_HI = 1 - CENTER_INSET;

// Where in `el` the pointer sits: which edge it is nearest, or the centre. This
// decides between inserting the dragged pane beside this one and swapping the
// two. The leaf wrapper carries `data-pane-leaf` (not `data-panel`), so its
// rect is NOT zoom-patched; scale it into the zoomed pointer space first.
export function spotAt(el: HTMLElement, x: number, y: number): PaneDropSpot {
  const r = el.getBoundingClientRect();
  const z = getResizeZoomFactor();
  const px = (x - r.left * z) / (r.width * z || 1);
  const py = (y - r.top * z) / (r.height * z || 1);
  if (
    px >= CENTER_LO &&
    px <= CENTER_HI &&
    py >= CENTER_LO &&
    py <= CENTER_HI
  ) {
    return "center";
  }
  const dist = { left: px, right: 1 - px, top: py, bottom: 1 - py };
  return (Object.keys(dist) as DropEdge[]).reduce((a, b) =>
    dist[b] < dist[a] ? b : a,
  );
}

/** Which tab's layer `el` sits in, or null outside any. A pane can only move
 *  next to a pane in the SAME tab, and an inactive layer is normally
 *  unreachable anyway — but the tab and space shortcuts keep working while the
 *  button is held, so another tab's panes can become hit-testable mid-drag.
 *  Offering that drop would highlight an edge and then do nothing. */
export function paneLayerOf(el: Element | null | undefined): string | null {
  return el?.closest<HTMLElement>("[data-tab-layer]")?.dataset.tabLayer ?? null;
}

/** How far apart the two panes must lean on one axis before that axis is called
 *  the one they trade along. Below it the pair is diagonal. */
const AXIS_DOMINANCE = 2;

/**
 * Whether two panes sit side by side or stacked, or undefined when they sit
 * diagonally and neither arrow would be true. Taken from the boxes rather than
 * from the tree, because what the glyph has to match is what the user sees. The
 * rects are not zoom-patched, but they are only ever compared with each other,
 * so the factor cancels.
 */
export function swapAxisBetween(
  a: HTMLElement,
  b: HTMLElement,
): SwapAxis | undefined {
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  const dx = Math.abs(ra.left + ra.right - (rb.left + rb.right));
  const dy = Math.abs(ra.top + ra.bottom - (rb.top + rb.bottom));
  if (dx > dy * AXIS_DOMINANCE) return "horizontal";
  if (dy > dx * AXIS_DOMINANCE) return "vertical";
  return undefined;
}

/** The pair's axis, or undefined when the source pane is not on screen to be
 *  measured, or when the two sit diagonally. The overlay draws no glyph at all
 *  then, rather than picking a direction and promising a trade that goes
 *  another way. */
function axisFrom(a: HTMLElement | null, b: HTMLElement): SwapAxis | undefined {
  return a ? swapAxisBetween(a, b) : undefined;
}

type Handlers = {
  /** Drop landed near another pane's edge: move the leaf beside it, there. */
  onMove: (sourceLeafId: number, targetLeafId: number, edge: DropEdge) => void;
  /** Drop landed in the middle of another pane: the two trade places, which
   *  keeps the sizes an insert would rebuild. */
  onSwap: (sourceLeafId: number, targetLeafId: number) => void;
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
export function useTerminalPaneDnd({ onMove, onSwap, onBreakOut }: Handlers) {
  const [dragging, setDragging] = useState(false);
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const cleanupRef = useRef<(() => void) | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onSwapRef = useRef(onSwap);
  onSwapRef.current = onSwap;
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
      const sourceLayer = paneLayerOf(e.currentTarget);
      // Looked up on every move, not captured once: a sibling's shell can exit
      // mid-drag, collapsing a split, and the source pane then gets a new DOM
      // node. Measuring the detached one returns a zero rect, which would
      // quietly settle the swap glyph on "horizontal" whatever the layout.
      const sourceLeafNow = () =>
        document.querySelector<HTMLElement>(
          `[data-pane-leaf="${sourceLeafId}"]`,
        );
      const sx = e.clientX;
      const sy = e.clientY;
      let active = false;
      let target: PaneDropTarget | null = null;
      const store = usePaneDndStore.getState();

      // `activate` is what separates the two callers: a pointermove may turn a
      // press into a drag, the release may only confirm one that is already
      // running. Without that, a press and release far enough apart with no
      // move delivered in between (coalesced events, a region that swallows
      // them) would start and commit a drag in one go, with no ghost and no
      // indicator ever shown.
      const move = (ev: PointerEvent, activate = true) => {
        if (ev.pointerId !== pointerId) return;
        if (!active) {
          if (!activate) return;
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < THRESHOLD) return;
          active = true;
          setDragging(true);
          store.setDrag(sourceLeafId, sourceLayer);
        }
        placeGhost(ev.clientX, ev.clientY);
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        const leafEl = under?.closest<HTMLElement>("[data-pane-leaf]");
        const id = leafEl ? Number(leafEl.dataset.paneLeaf) : Number.NaN;
        if (
          leafEl &&
          Number.isFinite(id) &&
          id !== sourceLeafId &&
          paneLayerOf(leafEl) === sourceLayer
        ) {
          const spot = spotAt(leafEl, ev.clientX, ev.clientY);
          target = {
            kind: "pane",
            leafId: id,
            spot,
            ...(spot === "center" && {
              axis: axisFrom(sourceLeafNow(), leafEl),
            }),
          };
        } else {
          const strip = tabStripAt(under);
          // The strip lists one space. If the pane's own tab is not in it, the
          // space changed under the drag and this strip says nothing about
          // where the pane would go, so it must not light up for a drop that
          // would only be refused.
          target =
            strip && sourceLayer !== null && stripHasTab(strip, sourceLayer)
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
        if (target.kind !== "pane") {
          onBreakOutRef.current(sourceLeafId, target.gapIndex);
        } else if (target.spot === "center") {
          onSwapRef.current(sourceLeafId, target.leafId);
        } else {
          onMoveRef.current(sourceLeafId, target.leafId, target.spot);
        }
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        // Re-read what is under the pointer before committing. The target is
        // otherwise only computed on movement, and the world does not hold
        // still while a button is held: a space shortcut or a closing tab can
        // make the remembered target point somewhere it no longer belongs.
        move(ev, false);
        end(true);
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
