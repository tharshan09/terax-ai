// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  GROUP_COLLAPSED_ATTR,
  GROUP_HEADER_ATTR,
  gapIndexAt,
  gapTargetAt,
  TAB_GROUP_ATTR,
  TAB_STRIP_ATTR,
} from "./tabStripGap";

type Spec =
  | { tab: number; group?: string }
  | { header: string; collapsed?: boolean };

// jsdom gives every element a zero rect, so each element is 100 px wide from x = 0.
function strip(specs: Spec[]): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute(TAB_STRIP_ATTR, "");
  specs.forEach((spec, i) => {
    const child = document.createElement("div");
    if ("tab" in spec) {
      child.dataset.tabId = String(spec.tab);
      if (spec.group) child.setAttribute(TAB_GROUP_ATTR, spec.group);
    } else {
      child.setAttribute(GROUP_HEADER_ATTR, spec.header);
      if (spec.collapsed) child.setAttribute(GROUP_COLLAPSED_ATTR, "");
    }
    const r = { left: i * 100, right: i * 100 + 100, width: 100 } as DOMRect;
    child.getBoundingClientRect = () => r;
    el.append(child);
  });
  document.body.append(el);
  return el;
}

describe("gapTargetAt", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("matches gapIndexAt on a strip without groups", () => {
    const el = strip([{ tab: 1 }, { tab: 2 }, { tab: 3 }]);
    expect(gapTargetAt(el, 160)).toEqual({
      index: 2,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(gapTargetAt(el, 9999)).toEqual({
      index: 3,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(gapTargetAt(el, 160).index).toBe(gapIndexAt(el, 160));
  });

  it("names the group for gaps after its header and between members", () => {
    const el = strip([
      { tab: 1 },
      { header: "G1" },
      { tab: 2, group: "G1" },
      { tab: 3, group: "G1" },
      { tab: 4 },
    ]);
    const at = (x: number) => gapTargetAt(el, x);
    expect(at(40)).toEqual({
      index: 0,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(at(110)).toEqual({
      index: 1,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(at(160)).toEqual({
      index: 2,
      groupId: "G1",
      onCollapsedHeader: false,
    });
    expect(at(260)).toEqual({
      index: 3,
      groupId: "G1",
      onCollapsedHeader: false,
    });
    expect(at(360)).toEqual({
      index: 4,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(at(9999)).toEqual({
      index: 5,
      groupId: null,
      onCollapsedHeader: false,
    });
  });

  it("targets the inner half of a collapsed header only with headerDrop", () => {
    const el = strip([
      { tab: 1 },
      { header: "G1", collapsed: true },
      { tab: 4 },
    ]);
    expect(gapTargetAt(el, 150, { headerDrop: true })).toMatchObject({
      groupId: "G1",
      onCollapsedHeader: true,
    });
    expect(gapTargetAt(el, 110, { headerDrop: true })).toEqual({
      index: 1,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(gapTargetAt(el, 190, { headerDrop: true })).toEqual({
      index: 2,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(gapTargetAt(el, 150)).toEqual({
      index: 2,
      groupId: null,
      onCollapsedHeader: false,
    });
  });

  it("does not count headers in gapIndexAt", () => {
    const el = strip([{ tab: 1 }, { header: "G1" }, { tab: 2, group: "G1" }]);
    expect(gapIndexAt(el, 9999)).toBe(2);
  });
});
