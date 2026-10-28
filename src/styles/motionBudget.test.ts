import { readFileSync } from "node:fs";
import { WINDOW_HIDDEN_ATTR } from "@/lib/windowVisibility";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

const HIDDEN = `html[${WINDOW_HIDDEN_ATTR}]`;

function infiniteAnimations(source: string): string[] {
  return [
    ...source.matchAll(
      /(--animate-[\w-]+|animation)\s*:\s*([^;]*infinite[^;]*);/g,
    ),
  ].map((m) => `${m[1]}: ${m[2].trim()}`);
}

function pausedSelectors(source: string): string[] {
  return [
    ...source.matchAll(
      /([^{}]+)\{[^}]*animation-play-state:\s*paused\s*!important[^}]*\}/g,
    ),
  ]
    .flatMap((m) => m[1].split(","))
    .map((selector) => selector.trim())
    .sort();
}

function reducedMotionBlock(source: string): string {
  const start = source.indexOf("@media (prefers-reduced-motion");
  return start < 0 ? "" : source.slice(start);
}

describe("global motion budget", () => {
  it("[AC-1, AC-2] only repeats animations forever with stepped timing", () => {
    const infinite = infiniteAnimations(css);
    expect(infinite.length).toBeGreaterThan(0);
    for (const declaration of infinite) {
      expect(declaration, "infinite animation must use steps()").toMatch(
        /steps\(/,
      );
    }
  });

  // Tailwind's smooth spin/pulse defaults live in node_modules, so a missing
  // override would go unnoticed without naming them here.
  it("[AC-1] covers the spinner and pulse utilities and the shimmer", () => {
    const names = infiniteAnimations(css).join("\n");
    expect(names).toContain("--animate-spin");
    expect(names).toContain("--animate-pulse");
    expect(names).toContain("terax-shimmer");
  });

  it("[AC-1] pauses every animation only while the window is hidden", () => {
    expect(pausedSelectors(css)).toEqual([
      `${HIDDEN} *`,
      `${HIDDEN} *::after`,
      `${HIDDEN} *::before`,
    ]);
  });

  it("[AC-3] keeps the icon fade-in finite and on the motion tokens", () => {
    const rule = css.match(/\.terax-icon-in\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toMatch(/animation:\s*terax-icon-in\s+var\(--dur-fast\)/);
    expect(rule).not.toMatch(/infinite/);
    expect(reducedMotionBlock(css)).toMatch(/--dur-fast:\s*0\.01ms/);
  });

  it("removes the shimmer under prefers-reduced-motion", () => {
    expect(reducedMotionBlock(css)).toMatch(
      /\.terax-shimmer\s*\{[^}]*animation:\s*none/,
    );
  });
});
