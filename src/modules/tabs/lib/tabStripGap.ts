/** Marks the scroll container that holds the tab buttons. Both drags hit-test
 *  against it: a tab drag to place the insertion line, a pane drag to decide
 *  that the drop means "break this pane out into a tab here". */
export const TAB_STRIP_ATTR = "data-tab-strip";

/** Marks the inert filler beside the strip as part of the same drop zone. The
 *  strip is `shrink`, so with a few tabs open most of the bar is that filler:
 *  it reads as the tab bar and users aim there, but it is a sibling of the
 *  scroller, not inside it. */
export const TAB_STRIP_ZONE_ATTR = "data-tab-drop-zone";

/** The tab strip a pointer is over, whether directly or via the filler beside
 *  it. Null when the pointer is nowhere near the tab bar, and when there is no
 *  strip at all (zen mode hides the header). */
export function tabStripAt(el: Element | null | undefined): Element | null {
  const strip = el?.closest(`[${TAB_STRIP_ATTR}]`);
  if (strip) return strip;
  if (!el?.closest(`[${TAB_STRIP_ZONE_ATTR}]`)) return null;
  return document.querySelector(`[${TAB_STRIP_ATTR}]`);
}

/**
 * The insertion gap under `clientX`: 0 before the first tab, `n` after the
 * last. Shared by the tab reorder drag and the pane drag so the indicator the
 * user sees and the position they get are computed the same way.
 */
export function gapIndexAt(strip: Element, clientX: number): number {
  const els = strip.querySelectorAll<HTMLElement>("[data-tab-id]");
  for (let i = 0; i < els.length; i++) {
    const r = els[i].getBoundingClientRect();
    if (clientX < r.left + r.width / 2) return i;
  }
  return els.length;
}
