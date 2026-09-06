// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  gapIndexAt,
  TAB_STRIP_ATTR,
  TAB_STRIP_ZONE_ATTR,
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
