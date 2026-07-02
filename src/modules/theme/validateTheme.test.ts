import { describe, expect, it } from "vitest";
import { isSafeCssColorValue, validateTheme } from "./validateTheme";

describe("isSafeCssColorValue", () => {
  it("accepts hex, named keywords, lengths, and color functions", () => {
    for (const v of [
      "#fff",
      "#ffffff",
      "#ffffffaa",
      "red",
      "transparent",
      "currentColor",
      "inherit",
      "0",
      "0.5rem",
      "12px",
      "50%",
      "rgb(255, 0, 0)",
      "rgba(100,74,64,0.16)",
      "hsl(210 50% 40%)",
      "oklch(0.7 0.1 200)",
      "oklch(0.7 0.1 200 / 0.5)",
      "color-mix(in oklch, red 40%, blue)",
    ]) {
      expect(isSafeCssColorValue(v), v).toBe(true);
    }
  });

  it("rejects url() and other fetching or escaping shapes", () => {
    for (const v of [
      "url(http://evil/x)",
      "url('http://evil/x')",
      "image(http://evil/x)",
      "expression(alert(1))",
      "red; background: url(http://evil)",
      "#fff}body{background:url(http://evil)",
      "var(--x)",
      "rgb(0,0,0) url(x)",
      "-webkit-image-set(url(x) 1x)",
      "",
      "   ",
    ]) {
      expect(isSafeCssColorValue(v), v).toBe(false);
    }
  });
});

describe("validateTheme color-value hardening", () => {
  const base = (bg: string) => ({
    id: "tt",
    name: "T",
    variants: { dark: { colors: { background: bg } } },
  });

  it("accepts a theme whose colors are all safe values", () => {
    const res = validateTheme(base("#101010"));
    expect(res.ok).toBe(true);
  });

  it("rejects a theme with a url() color value", () => {
    const res = validateTheme(base("url(http://evil/beacon)"));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("valid color value");
  });

  it("rejects an unsafe value in the terminal ansi palette", () => {
    const res = validateTheme({
      id: "t",
      name: "T",
      variants: {
        dark: {
          colors: { background: "#000" },
          terminal: {
            ansi: Array.from({ length: 16 }, (_, i) =>
              i === 3 ? "url(http://evil)" : "#000000",
            ),
          },
        },
      },
    });
    expect(res.ok).toBe(false);
  });
});
