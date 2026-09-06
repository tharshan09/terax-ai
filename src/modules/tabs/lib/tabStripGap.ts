/** Marks the scroll container that holds the tab buttons. Both drags hit-test
 *  against it: a tab drag to place the insertion line, a pane drag to decide
 *  that the drop means "break this pane out into a tab here". */
export const TAB_STRIP_ATTR = "data-tab-strip";

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
