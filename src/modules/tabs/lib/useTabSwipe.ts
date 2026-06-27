import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useRef } from "react";
import { isInsideHorizontalScroller } from "./tabSwipe";

/**
 * Switches tabs on a macOS two-finger horizontal trackpad swipe. The gesture is
 * detected natively in AppKit (Rust: install_tab_swipe_monitor) - reading the
 * NSEvent phase/momentum that WebKit never exposes to JS makes "one flick = one
 * switch" deterministic, which a JS wheel handler can't achieve. The native side
 * emits `terax:tab-swipe` with a direction (-1 prev / 1 next); we only decide
 * here whether the element under the cursor should scroll horizontally instead.
 *
 * `boundaryRef` bounds the scroller walk-up (the app root). On non-macOS the
 * native event never fires, so this is a no-op.
 */
export function useTabSwipe<T extends HTMLElement = HTMLElement>(
  boundaryRef: React.RefObject<T | null>,
  onSwipe: (dir: -1 | 1) => void,
) {
  const onSwipeRef = useRef(onSwipe);
  // Keep the latest callback without re-subscribing; a layout effect keeps the
  // hook clean under the React Compiler.
  useLayoutEffect(() => {
    onSwipeRef.current = onSwipe;
  });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    void listen<number>("terax:tab-swipe", (event) => {
      const dir: -1 | 1 = event.payload < 0 ? -1 : 1;
      // Defer to a horizontally-scrollable element (or an opt-out) under the
      // cursor, so a swipe meant to scroll it doesn't also switch tabs.
      const hovered = document.querySelectorAll(":hover");
      const target = hovered.length ? hovered[hovered.length - 1] : null;
      if (isInsideHorizontalScroller(target, boundaryRef.current, dir)) return;
      onSwipeRef.current(dir);
    }).then((un) => {
      if (disposed) un();
      else unlisten = un;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [boundaryRef]);
}
