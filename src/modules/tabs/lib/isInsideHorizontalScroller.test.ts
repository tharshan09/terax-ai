// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isInsideHorizontalScroller } from "./tabSwipe";

// jsdom computes no layout, so scrollWidth/clientWidth/scrollLeft are always 0.
// We stub them per-element to model real scroll geometry.
function el(opts: {
  overflowX?: string;
  scrollWidth?: number;
  clientWidth?: number;
  scrollLeft?: number;
  noTabSwipe?: boolean;
}): HTMLElement {
  const node = document.createElement("div");
  if (opts.overflowX) node.style.overflowX = opts.overflowX;
  if (opts.noTabSwipe) node.setAttribute("data-no-tab-swipe", "");
  Object.defineProperty(node, "scrollWidth", { value: opts.scrollWidth ?? 0 });
  Object.defineProperty(node, "clientWidth", { value: opts.clientWidth ?? 0 });
  let sl = opts.scrollLeft ?? 0;
  Object.defineProperty(node, "scrollLeft", {
    get: () => sl,
    set: (v) => {
      sl = v;
    },
  });
  return node;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isInsideHorizontalScroller", () => {
  it("returns false for a non-scrollable target", () => {
    const root = el({});
    const child = el({});
    root.appendChild(child);
    document.body.appendChild(root);
    expect(isInsideHorizontalScroller(child, root, 1)).toBe(false);
  });

  it("blocks when an ancestor is a horizontal scroller with room to scroll left (dir 1)", () => {
    const root = el({});
    const scroller = el({
      overflowX: "auto",
      scrollWidth: 300,
      clientWidth: 100,
      scrollLeft: 50,
    });
    const child = el({});
    scroller.appendChild(child);
    root.appendChild(scroller);
    document.body.appendChild(root);
    expect(isInsideHorizontalScroller(child, root, 1)).toBe(true);
  });

  it("does NOT block at the right scroll edge (dir 1, scrollLeft at max)", () => {
    const root = el({});
    const scroller = el({
      overflowX: "scroll",
      scrollWidth: 300,
      clientWidth: 100,
      scrollLeft: 200, // maxScroll = 200 -> no room to grow
    });
    root.appendChild(scroller);
    document.body.appendChild(root);
    expect(isInsideHorizontalScroller(scroller, root, 1)).toBe(false);
  });

  it("blocks when scrolling back (dir -1) and there is room on the left", () => {
    const root = el({});
    const scroller = el({
      overflowX: "auto",
      scrollWidth: 300,
      clientWidth: 100,
      scrollLeft: 50,
    });
    root.appendChild(scroller);
    document.body.appendChild(root);
    expect(isInsideHorizontalScroller(scroller, root, -1)).toBe(true);
  });

  it("does NOT block at the left scroll edge (dir -1, scrollLeft 0)", () => {
    const root = el({});
    const scroller = el({
      overflowX: "auto",
      scrollWidth: 300,
      clientWidth: 100,
      scrollLeft: 0,
    });
    root.appendChild(scroller);
    document.body.appendChild(root);
    expect(isInsideHorizontalScroller(scroller, root, -1)).toBe(false);
  });

  it("ignores overflow-x that isn't auto/scroll even with overflow present", () => {
    const root = el({});
    const hidden = el({
      overflowX: "hidden",
      scrollWidth: 300,
      clientWidth: 100,
      scrollLeft: 50,
    });
    root.appendChild(hidden);
    document.body.appendChild(root);
    expect(isInsideHorizontalScroller(hidden, root, 1)).toBe(false);
  });

  it("blocks unconditionally on a data-no-tab-swipe ancestor", () => {
    const root = el({});
    const optedOut = el({ noTabSwipe: true });
    const child = el({});
    optedOut.appendChild(child);
    root.appendChild(optedOut);
    document.body.appendChild(root);
    expect(isInsideHorizontalScroller(child, root, 1)).toBe(true);
  });

  it("stops at the boundary (a scroller above the boundary is not considered)", () => {
    const outerScroller = el({
      overflowX: "auto",
      scrollWidth: 300,
      clientWidth: 100,
      scrollLeft: 50,
    });
    const boundary = el({});
    const child = el({});
    boundary.appendChild(child);
    outerScroller.appendChild(boundary);
    document.body.appendChild(outerScroller);
    expect(isInsideHorizontalScroller(child, boundary, 1)).toBe(false);
  });

  it("returns false for a null target", () => {
    expect(isInsideHorizontalScroller(null, null, 1)).toBe(false);
  });
});
