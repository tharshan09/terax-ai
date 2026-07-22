import { describe, expect, it } from "vitest";
import { visibilityHint } from "./visibilityHint";

describe("visibilityHint", () => {
  it("is visible when the leaf shows and the window is not hidden", () => {
    expect(visibilityHint(true, false)).toBe(true);
  });

  it("is hidden when the leaf's own tab/pane is not the active one", () => {
    expect(visibilityHint(false, false)).toBe(false);
  });

  it("is hidden when the whole window is hidden, even for the active leaf", () => {
    // The active tab is still off screen while the window is minimized/occluded.
    expect(visibilityHint(true, true)).toBe(false);
  });

  it("stays hidden when both the leaf and the window are hidden", () => {
    expect(visibilityHint(false, true)).toBe(false);
  });
});
