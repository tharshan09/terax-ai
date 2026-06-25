import { describe, expect, it } from "vitest";
import { applyDocView } from "./applyDocView";
import type {
  EditorTab,
  HtmlTab,
  MarkdownTab,
  TerminalTab,
} from "./useTabs";

const SSH = { kind: "ssh", host: "box" } as const;

function md(id: number, path: string): MarkdownTab {
  return { id, kind: "markdown", spaceId: "s1", title: "doc", path, workspace: SSH };
}
function htmlTab(id: number, path: string): HtmlTab {
  return { id, kind: "html", spaceId: "s1", title: "doc", path, workspace: SSH };
}
function ed(
  id: number,
  path: string,
  extra: Partial<EditorTab> = {},
): EditorTab {
  return {
    id,
    kind: "editor",
    spaceId: "s1",
    title: "doc",
    path,
    dirty: false,
    preview: false,
    workspace: SSH,
    ...extra,
  };
}
function term(id: number): TerminalTab {
  return {
    id,
    kind: "terminal",
    spaceId: "s1",
    title: "term",
    paneTree: { kind: "leaf", id: 9000 + id },
    activeLeafId: 9000 + id,
  };
}

describe("applyDocView — rendered -> raw", () => {
  it("turns a markdown tab into a raw editor, preserving identity", () => {
    const out = applyDocView(md(3, "/a/readme.md"), 3, "raw") as EditorTab;
    expect(out).toMatchObject({
      id: 3,
      kind: "editor",
      spaceId: "s1",
      path: "/a/readme.md",
      dirty: false,
      preview: false,
      workspace: SSH,
      overrideLanguage: null,
    });
  });

  it("turns an html tab into a raw editor", () => {
    const out = applyDocView(htmlTab(4, "/a/page.html"), 4, "raw") as EditorTab;
    expect(out).toMatchObject({
      id: 4,
      kind: "editor",
      path: "/a/page.html",
      workspace: SSH,
    });
  });
});

describe("applyDocView — raw -> rendered", () => {
  it("turns a markdown-path editor back into a markdown tab", () => {
    const out = applyDocView(ed(5, "/a/readme.md"), 5, "rendered") as MarkdownTab;
    expect(out).toMatchObject({
      id: 5,
      kind: "markdown",
      spaceId: "s1",
      path: "/a/readme.md",
      workspace: SSH,
    });
  });

  it("turns an html-path editor back into an html tab", () => {
    const out = applyDocView(ed(6, "/a/page.htm"), 6, "rendered") as HtmlTab;
    expect(out.kind).toBe("html");
    expect(out.path).toBe("/a/page.htm");
  });

  it("refuses to render a dirty editor (dirty-guard, no data loss)", () => {
    const dirty = ed(7, "/a/readme.md", { dirty: true });
    expect(applyDocView(dirty, 7, "rendered")).toBe(dirty); // unchanged ref
  });
});

describe("applyDocView — no-ops", () => {
  it("leaves a non-matching id untouched", () => {
    const tab = md(8, "/a/readme.md");
    expect(applyDocView(tab, 999, "raw")).toBe(tab);
  });

  it("leaves a non-doc editor (.ts) untouched", () => {
    const tab = ed(9, "/a/main.ts");
    expect(applyDocView(tab, 9, "rendered")).toBe(tab);
    expect(applyDocView(tab, 9, "raw")).toBe(tab);
  });

  it("leaves a terminal tab untouched", () => {
    const tab = term(10);
    expect(applyDocView(tab, 10, "raw")).toBe(tab);
  });

  it("is idempotent when already in the requested view", () => {
    const rendered = md(11, "/a/readme.md");
    expect(applyDocView(rendered, 11, "rendered")).toBe(rendered);
    const raw = ed(12, "/a/readme.md");
    expect(applyDocView(raw, 12, "raw")).toBe(raw);
  });
});
