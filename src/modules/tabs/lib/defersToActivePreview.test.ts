// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { defersToActivePreview } from "./tabSwipe";

describe("defersToActivePreview", () => {
  it("[AC-10] keeps the tab over the active HTML preview when nothing is hovered", () => {
    expect(defersToActivePreview("html", null)).toBe(true);
  });

  it("[AC-10] leaves a hovered element to isInsideHorizontalScroller", () => {
    expect(defersToActivePreview("html", document.createElement("div"))).toBe(
      false,
    );
  });

  it.each([
    "markdown",
    "terminal",
    "editor",
    "preview",
    "ai-diff",
    "git-diff",
    "git-history",
    "git-commit-file",
  ] as const)("[AC-10] swipes as before in a %s tab", (kind) => {
    expect(defersToActivePreview(kind, null)).toBe(false);
  });

  it("[AC-10] swipes as before without an active tab", () => {
    expect(defersToActivePreview(undefined, null)).toBe(false);
  });
});
