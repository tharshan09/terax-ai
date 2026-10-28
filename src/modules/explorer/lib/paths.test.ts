import { describe, expect, it } from "vitest";
import { dirname, targetDirFor } from "@/modules/explorer/lib/paths";

describe("targetDirFor", () => {
  const dirs = new Set(["/ws/docs", "/ws/b"]);
  const isDir = (p: string) => dirs.has(p);

  it("lands in a selected folder, beside a selected file, else at the root", () => {
    expect(targetDirFor("/ws/docs", isDir, "/ws")).toBe("/ws/docs");
    expect(targetDirFor("/ws/docs/x.md", isDir, "/ws")).toBe("/ws/docs");
    expect(targetDirFor(null, isDir, "/ws")).toBe("/ws");
  });

  it("uses the right-clicked row, not the selection, for the row menu", () => {
    const selected = "/ws/a.md";
    expect(targetDirFor(selected, isDir, "/ws")).toBe("/ws");
    expect(targetDirFor("/ws/b", () => true, "/ws")).toBe("/ws/b");
  });

  it("gives drop and move the same folder for a row, the root without one", () => {
    expect(targetDirFor("/ws/docs/x.md", isDir, null)).toBe("/ws/docs");
    expect(targetDirFor(undefined, isDir, "/ws")).toBe("/ws");
    expect(targetDirFor("", isDir, null)).toBeNull();
  });

  it.each([
    ["/a.txt", "/"],
    ["/ws/a\\b.txt", "/ws"],
    ["C:/repo/a.txt", "C:/repo"],
  ])("uses the tree parent rule beside a file %s", (path, parent) => {
    expect(targetDirFor(path, () => false, "/ws")).toBe(parent);
  });
});

describe("dirname", () => {
  it.each([
    ["/ws/docs/a.txt", "/ws/docs"],
    ["/ws/a.txt", "/ws"],
    ["~/a.txt", "~"],
    ["/a.txt", "/"],
    ["/", "/"],
    ["a.txt", "/"],
    ["/ws/a\\b.txt", "/ws"],
    ["C:/repo/a.txt", "C:/repo"],
    ["C:/a.txt", "C:"],
  ])("%s -> %s", (path, parent) => {
    expect(dirname(path)).toBe(parent);
  });
});
