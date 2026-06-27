// The two-finger swipe gesture itself is detected natively in AppKit (Rust:
// install_tab_swipe_monitor in src-tauri/src/lib.rs) - WebKit never exposes
// NSEvent phase/momentum to JS, so a reliable detector can only live there. The
// native side emits `terax:tab-swipe`; useTabSwipe listens for it. The only JS
// piece still needed is this DOM check: before switching, defer to a
// horizontally-scrollable element under the cursor (a code editor with long
// lines, a wide table, the overflowing tab strip) so a swipe meant to scroll
// that element doesn't also switch tabs.

/** Walk up from `target` looking for an ancestor that is itself horizontally
 *  scrollable AND can still scroll in the swipe direction. Such an element
 *  should consume the swipe as a scroll, so the tab gesture must defer to it. An
 *  element tagged `data-no-tab-swipe` opts out unconditionally.
 *
 *  Scrollbars are suppressed app-wide (globals.css), so scrollers are detected by
 *  computed overflow-x + actual overflow (scrollWidth > clientWidth), never by a
 *  visible bar. `dir` is the sign of the swipe (1 = toward the next tab, which we
 *  treat as scrollLeft increasing). The walk stops at `boundary` (exclusive).
 *
 *  The edge math assumes an LTR, non-negative scrollLeft range (the app is
 *  LTR-only). RTL content would use WebKit's negative scrollLeft model and need
 *  the extreme checks generalized (e.g. via Math.abs(scrollLeft)). */
export function isInsideHorizontalScroller(
  target: EventTarget | null,
  boundary: Element | null,
  dir: -1 | 1,
): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== boundary) {
    if (el.hasAttribute("data-no-tab-swipe")) return true;
    const ox = getComputedStyle(el).overflowX;
    if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth) {
      const maxScroll = el.scrollWidth - el.clientWidth;
      // 1px slack absorbs sub-pixel rounding at the scroll extremes.
      const canScroll =
        dir > 0 ? el.scrollLeft < maxScroll - 1 : el.scrollLeft > 1;
      if (canScroll) return true;
    }
    el = el.parentElement;
  }
  return false;
}
