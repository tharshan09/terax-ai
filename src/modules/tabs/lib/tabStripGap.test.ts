// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  gapIndexAt,
  stripHasTab,
  TAB_STRIP_ATTR,
  TAB_STRIP_ZONE_ATTR,
  TAB_STRIP_ZONE_OFF_ATTR,
  tabStripAt,
} from "./tabStripGap";

// jsdom gives every element a zero rect, so the tabs get their geometry stubbed.
function strip(widths: number[]): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute(TAB_STRIP_ATTR, "");
  let left = 0;
  for (const w of widths) {
    const tab = document.createElement("div");
    tab.dataset.tabId = String(left);
    const r = { left, right: left + w, width: w } as DOMRect;
    tab.getBoundingClientRect = () => r;
    el.append(tab);
    left += w;
  }
  document.body.append(el);
  return el;
}

describe("gapIndexAt", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("picks the gap by the half-width rule", () => {
    const el = strip([100, 100, 100]);
    expect(gapIndexAt(el, 10)).toBe(0);
    expect(gapIndexAt(el, 60)).toBe(1);
    expect(gapIndexAt(el, 160)).toBe(2);
    expect(gapIndexAt(el, 290)).toBe(3);
  });

  it("reports the last gap for a pointer past every tab", () => {
    expect(gapIndexAt(strip([100]), 9999)).toBe(1);
  });

  it("reports gap 0 for an empty strip", () => {
    expect(gapIndexAt(strip([]), 42)).toBe(0);
  });
});

describe("tabStripAt", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds the strip a tab sits in", () => {
    const el = strip([100]);
    expect(tabStripAt(el.firstElementChild)).toBe(el);
  });

  it("resolves the filler beside the strip to the strip itself", () => {
    const el = strip([100]);
    const filler = document.createElement("div");
    filler.setAttribute(TAB_STRIP_ZONE_ATTR, "");
    document.body.append(filler);
    expect(tabStripAt(filler)).toBe(el);
  });

  it("is null on a control cut out of the zone", () => {
    strip([100]);
    const zone = document.createElement("div");
    zone.setAttribute(TAB_STRIP_ZONE_ATTR, "");
    const switcher = document.createElement("div");
    switcher.setAttribute(TAB_STRIP_ZONE_OFF_ATTR, "");
    const inner = document.createElement("button");
    switcher.append(inner);
    zone.append(switcher);
    document.body.append(zone);
    // Aimed at the space switcher, which means "move this somewhere else":
    // it must not resolve to the strip and quietly make a tab here.
    expect(tabStripAt(inner)).toBeNull();
    expect(tabStripAt(switcher)).toBeNull();
    expect(tabStripAt(zone)).not.toBeNull();
  });

  it("is null away from the tab bar, and with no strip at all", () => {
    const el = strip([100]);
    const other = document.createElement("div");
    document.body.append(other);
    expect(tabStripAt(other)).toBeNull();
    expect(tabStripAt(null)).toBeNull();
    el.remove();
    const filler = document.createElement("div");
    filler.setAttribute(TAB_STRIP_ZONE_ATTR, "");
    document.body.append(filler);
    expect(tabStripAt(filler)).toBeNull();
  });
});

describe("stripHasTab", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("recognises a tab the strip lists", () => {
    // strip() names its tabs by their left offset.
    const el = strip([100, 100]);
    expect(stripHasTab(el, "0")).toBe(true);
    expect(stripHasTab(el, "100")).toBe(true);
  });

  it("does not recognise a tab from another space's strip", () => {
    expect(stripHasTab(strip([100]), "999")).toBe(false);
    expect(stripHasTab(strip([]), "0")).toBe(false);
  });
});
