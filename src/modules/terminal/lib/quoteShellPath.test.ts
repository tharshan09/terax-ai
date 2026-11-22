import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform", () => ({ IS_WINDOWS: false }));

import { formatDroppedPaths, quoteShellPath } from "./quoteShellPath";

describe("quoteShellPath", () => {
  it("passes a clean path through unquoted so apps can resolve it", () => {
    expect(quoteShellPath("/Users/me/img.png")).toBe("/Users/me/img.png");
  });

  it("quotes a path containing spaces", () => {
    expect(quoteShellPath("/Users/me/My Photos/a.png")).toBe(
      "'/Users/me/My Photos/a.png'",
    );
  });

  it("escapes single quotes inside the path", () => {
    expect(quoteShellPath("/tmp/it's a file")).toBe(`'/tmp/it'\\''s a file'`);
  });

  it("leaves a clean Windows drive path unquoted", () => {
    expect(quoteShellPath("C:\\Users\\me\\img.png")).toBe(
      "C:\\Users\\me\\img.png",
    );
  });

  it("quotes a path with shell metacharacters", () => {
    expect(quoteShellPath("/tmp/$(whoami).png")).toBe("'/tmp/$(whoami).png'");
  });

  it("joins multiple paths with a trailing space", () => {
    expect(formatDroppedPaths(["/a/b.png", "/c/d.png"])).toBe(
      "/a/b.png /c/d.png ",
    );
  });
});

describe("quoteShellPath posix style", () => {
  it("passes a clean server path through unquoted", () => {
    expect(quoteShellPath("/home/u/.terax/uploads/a.png", "posix")).toBe(
      "/home/u/.terax/uploads/a.png",
    );
  });

  it("single-quotes spaces, quotes and backslashes", () => {
    expect(quoteShellPath("/home/u/my shot.png", "posix")).toBe(
      "'/home/u/my shot.png'",
    );
    expect(quoteShellPath("/home/u/it's.png", "posix")).toBe(
      `'/home/u/it'\\''s.png'`,
    );
    expect(quoteShellPath("/home/u/a\\b.png", "posix")).toBe(
      "'/home/u/a\\b.png'",
    );
  });

  it("joins server paths in posix style with a trailing space", () => {
    expect(formatDroppedPaths(["/a/b c.png", "/d.png"], "posix")).toBe(
      "'/a/b c.png' /d.png ",
    );
  });
});
