// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/zoomResizeFix", () => ({ getResizeZoomFactor: () => 1 }));

import { CENTER_INSET, spotAt, swapAxisBetween } from "./useTerminalPaneDnd";

/** A pane at (0,0) 300x300, so a third is exactly 100px. */
function pane(): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 300, height: 300 }) as DOMRect;
  document.body.append(el);
  return el;
}

describe("spotAt", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("calls the middle third in both axes a swap", () => {
    const el = pane();
    expect(spotAt(el, 150, 150)).toBe("center");
    expect(spotAt(el, 105, 105)).toBe("center");
    expect(spotAt(el, 195, 195)).toBe("center");
  });

  it("names the nearest edge outside the middle", () => {
    const el = pane();
    expect(spotAt(el, 10, 150)).toBe("left");
    expect(spotAt(el, 290, 150)).toBe("right");
    expect(spotAt(el, 150, 10)).toBe("top");
    expect(spotAt(el, 150, 290)).toBe("bottom");
  });

  it("needs the middle in BOTH axes, not one", () => {
    const el = pane();
    // Horizontally centred but high up: still an edge, not a swap.
    expect(spotAt(el, 150, 40)).toBe("top");
    expect(spotAt(el, 40, 150)).toBe("left");
  });

  it("swaps exactly inside the box the overlay draws", () => {
    // The overlay insets its frame by CENTER_INSET, so the frame IS the region
    // that swaps. A frame bigger than the region would teach the wrong target
    // and a release just inside it would insert instead.
    const el = pane();
    const edge = 300 * CENTER_INSET;
    expect(spotAt(el, 150, edge + 1)).toBe("center");
    expect(spotAt(el, 150, edge - 1)).toBe("top");
    expect(spotAt(el, edge + 1, 150)).toBe("center");
    expect(spotAt(el, edge - 1, 150)).toBe("left");
  });

  it("keeps the corners on the diagonal rule", () => {
    const el = pane();
    // Just inside the top-left corner: top and left are tied at the diagonal,
    // and the reducer keeps the first of the two.
    expect(["top", "left"]).toContain(spotAt(el, 20, 20));
    expect(spotAt(el, 20, 60)).toBe("left");
    expect(spotAt(el, 60, 20)).toBe("top");
  });
});

describe("swapAxisBetween", () => {
  const box = (left: number, top: number, w = 100, h = 100): HTMLElement => {
    const el = document.createElement("div");
    el.getBoundingClientRect = () =>
      ({
        left,
        top,
        right: left + w,
        bottom: top + h,
        width: w,
        height: h,
      }) as DOMRect;
    return el;
  };

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("calls two panes beside each other horizontal", () => {
    expect(swapAxisBetween(box(0, 0), box(200, 0))).toBe("horizontal");
    expect(swapAxisBetween(box(200, 0), box(0, 0))).toBe("horizontal");
  });

  it("calls two panes above each other vertical", () => {
    expect(swapAxisBetween(box(0, 0), box(0, 200))).toBe("vertical");
    expect(swapAxisBetween(box(0, 200), box(0, 0))).toBe("vertical");
  });

  it("takes the dominant axis when a pair is only slightly staggered", () => {
    // Mostly side by side, slightly staggered.
    expect(swapAxisBetween(box(0, 0), box(300, 40))).toBe("horizontal");
    // Mostly stacked, slightly staggered.
    expect(swapAxisBetween(box(0, 0), box(40, 300))).toBe("vertical");
  });

  it("names no axis for a diagonal pair", () => {
    // Two panes of a 2x2 grid on opposite corners trade diagonally, and
    // neither arrow describes that; the overlay then draws no glyph.
    expect(swapAxisBetween(box(0, 0), box(300, 300))).toBeUndefined();
    expect(swapAxisBetween(box(300, 0), box(0, 300))).toBeUndefined();
  });
});
