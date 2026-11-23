import type { GapTarget } from "./tabGroups";

/** Marks the scroll container that holds the tab buttons. Both drags hit-test
 *  against it: a tab drag to place the insertion line, a pane drag to decide
 *  that the drop means "break this pane out into a tab here". */
export const TAB_STRIP_ATTR = "data-tab-strip";

/** Marks the inert filler beside the strip as part of the same drop zone. The
 *  strip is `shrink`, so with a few tabs open most of the bar is that filler:
 *  it reads as the tab bar and users aim there, but it is a sibling of the
 *  scroller, not inside it. */
export const TAB_STRIP_ZONE_ATTR = "data-tab-drop-zone";

/** Cuts a subtree back out of the drop zone. The zone sits on the whole header
 *  row, which also holds the space switcher, and that is exactly where one aims
 *  to move something to ANOTHER space: a pane dropped there must not quietly
 *  become a tab at the front of this one. */
export const TAB_STRIP_ZONE_OFF_ATTR = "data-no-pane-drop";

/** The tab strip a pointer is over, whether directly or via the row around it.
 *  Null when the pointer is on a cut-out control, nowhere near the tab bar, or
 *  when there is no strip at all (zen mode hides the header). */
export function tabStripAt(el: Element | null | undefined): Element | null {
  if (!el || el.closest(`[${TAB_STRIP_ZONE_OFF_ATTR}]`)) return null;
  const strip = el.closest(`[${TAB_STRIP_ATTR}]`);
  if (strip) return strip;
  if (!el.closest(`[${TAB_STRIP_ZONE_ATTR}]`)) return null;
  return document.querySelector(`[${TAB_STRIP_ATTR}]`);
}

/** Whether the strip currently lists `tabId`. The strip only renders the active
 *  space's tabs, so this answers "does what is on screen still describe where
 *  this tab's pane would go" — the space shortcuts keep working during a drag,
 *  and a strip belonging to another space must not light up for a drop that
 *  would only be refused. */
export function stripHasTab(strip: Element, tabId: string): boolean {
  for (const el of strip.querySelectorAll<HTMLElement>("[data-tab-id]")) {
    if (el.dataset.tabId === tabId) return true;
  }
  return false;
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

/** On a group header element; the value is the group id. */
export const GROUP_HEADER_ATTR = "data-group-header";

/** On a group header element while the group is collapsed. */
export const GROUP_COLLAPSED_ATTR = "data-group-collapsed";

/** On the tab element of a group member; the value is the group id. */
export const TAB_GROUP_ATTR = "data-tab-group";

/** The insertion gap under `clientX` together with its group context. */
export function gapTargetAt(
  strip: Element,
  clientX: number,
  _opts?: { headerDrop?: boolean },
): GapTarget {
  return {
    index: gapIndexAt(strip, clientX),
    groupId: null,
    onCollapsedHeader: false,
  };
}
