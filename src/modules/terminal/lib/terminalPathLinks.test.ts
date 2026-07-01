import { describe, expect, it } from "vitest";
import { findPathLinks, resolveTerminalPath } from "./terminalPathLinks";

describe("findPathLinks", () => {
  it("detects a relative multi-segment path with an extension", () => {
    const line = "wrote docs/booking-versender/overviews/foo.html done";
    const links = findPathLinks(line);
    expect(links).toHaveLength(1);
    expect(links[0].path).toBe("docs/booking-versender/overviews/foo.html");
    expect(line.slice(links[0].start, links[0].end)).toBe(
      "docs/booking-versender/overviews/foo.html",
    );
  });

  it("detects absolute and explicitly-relative paths", () => {
    expect(findPathLinks("/Users/z/f.html")[0].path).toBe("/Users/z/f.html");
    expect(findPathLinks("./src/x.ts")[0].path).toBe("./src/x.ts");
    expect(findPathLinks("../y/z.md")[0].path).toBe("../y/z.md");
  });

  it("ignores URLs (WebLinksAddon owns those)", () => {
    expect(findPathLinks("see https://example.com/a.html")).toHaveLength(0);
    expect(findPathLinks("file:///Users/z/a.html")).toHaveLength(0);
  });

  it("ignores bare filenames without a directory (too ambiguous)", () => {
    expect(findPathLinks("edit config.js and array.map()")).toHaveLength(0);
  });

  it("trims trailing sentence punctuation but keeps the path", () => {
    const links = findPathLinks("open docs/x.html.");
    expect(links[0].path).toBe("docs/x.html");
    expect(links[0].end).toBe("open docs/x.html".length);
  });

  it("strips a :line:col suffix from the path but underlines it", () => {
    const line = "at src/app/App.tsx:42:10 failed";
    const links = findPathLinks(line);
    expect(links[0].path).toBe("src/app/App.tsx");
    expect(line.slice(links[0].start, links[0].end)).toBe(
      "src/app/App.tsx:42:10",
    );
  });

  it("bounds a path on surrounding parentheses", () => {
    expect(findPathLinks("(docs/x.html)")[0].path).toBe("docs/x.html");
  });
});

describe("resolveTerminalPath", () => {
  it("returns absolute paths unchanged", () => {
    expect(resolveTerminalPath("/a/b.html", "/cwd")).toBe("/a/b.html");
  });

  it("joins relative paths onto the cwd", () => {
    expect(resolveTerminalPath("docs/x.html", "/home/u/proj")).toBe(
      "/home/u/proj/docs/x.html",
    );
    expect(resolveTerminalPath("./x.ts", "/home/u/proj")).toBe(
      "/home/u/proj/x.ts",
    );
  });

  it("tolerates a trailing slash on the cwd", () => {
    expect(resolveTerminalPath("x.html", "/home/u/proj/")).toBe(
      "/home/u/proj/x.html",
    );
  });

  it("returns null for ~ (home expansion is a follow-up) and cwd-less relatives", () => {
    expect(resolveTerminalPath("~/x.html", "/cwd")).toBeNull();
    expect(resolveTerminalPath("docs/x.html", null)).toBeNull();
  });
});
