// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/zoomResizeFix", () => ({ getResizeZoomFactor: () => 1 }));

import { spotAt } from "./useTerminalPaneDnd";

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

  it("keeps the corners on the diagonal rule", () => {
    const el = pane();
    // Just inside the top-left corner: top and left are tied at the diagonal,
    // and the reducer keeps the first of the two.
    expect(["top", "left"]).toContain(spotAt(el, 20, 20));
    expect(spotAt(el, 20, 60)).toBe("left");
    expect(spotAt(el, 60, 20)).toBe("top");
  });
});
