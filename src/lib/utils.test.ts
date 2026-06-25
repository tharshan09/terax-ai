import { describe, expect, it } from "vitest";
import { isHtmlPath, isMarkdownPath } from "./utils";

describe("isHtmlPath", () => {
  it("matches .html and .htm case-insensitively", () => {
    for (const p of ["index.html", "page.HTM", "/a/b/c.Html", "x.htm"]) {
      expect(isHtmlPath(p)).toBe(true);
    }
  });

  it("does not match look-alikes or non-html paths", () => {
    for (const p of [
      "index.htmlx",
      "a.xhtml",
      "README.md",
      "script.js",
      "htm",
      "file.html.bak",
    ]) {
      expect(isHtmlPath(p)).toBe(false);
    }
  });

  it("is disjoint from isMarkdownPath", () => {
    expect(isHtmlPath("a.md")).toBe(false);
    expect(isMarkdownPath("a.html")).toBe(false);
  });
});
