import { describe, expect, it } from "vitest";
import {
  type ResolveFileTabOpenOptions,
  resolveFileTabOpen,
} from "./resolveFileTabOpen";
import type { EditorTab, Tab, TerminalTab } from "./useTabs";

function editor(id: number, path: string, preview: boolean): EditorTab {
  return {
    id,
    kind: "editor",
    spaceId: "default",
    title: path,
    path,
    dirty: false,
    preview,
  };
}

// A non-editor tab to prove the slot logic ignores other kinds.
function term(id: number): TerminalTab {
  return {
    id,
    kind: "terminal",
    spaceId: "default",
    title: "term",
    paneTree: { kind: "leaf", id: 9000 + id },
    activeLeafId: 9000 + id,
  };
}

function counter(start = 100) {
  let n = start;
  let calls = 0;
  return {
    makeId: () => {
      calls += 1;
      return n++;
    },
    get calls() {
      return calls;
    },
  };
}

function opts(makeId: () => number): ResolveFileTabOpenOptions {
  return {
    makeId,
    spaceId: "s1",
    workspace: { kind: "ssh", host: "box" },
    title: "doc.ts",
  };
}

describe("resolveFileTabOpen — pin=true (persistent)", () => {
  it("appends a persistent editor tab for a new path", () => {
    const gen = counter();
    const curr: Tab[] = [term(1)];
    const { tabs, targetId } = resolveFileTabOpen(
      curr,
      "/a/doc.ts",
      true,
      opts(gen.makeId),
    );
    expect(gen.calls).toBe(1);
    expect(targetId).toBe(100);
    expect(tabs).toHaveLength(2);
    const added = tabs[1] as EditorTab;
    expect(added).toMatchObject({
      id: 100,
      kind: "editor",
      path: "/a/doc.ts",
      preview: false,
      dirty: false,
      spaceId: "s1",
      title: "doc.ts",
      workspace: { kind: "ssh", host: "box" },
    });
    expect(tabs[0]).toBe(curr[0]); // terminal untouched
  });

  it("reuses an existing persistent tab without changing state", () => {
    const gen = counter();
    const curr: Tab[] = [editor(7, "/a/doc.ts", false)];
    const { tabs, targetId } = resolveFileTabOpen(
      curr,
      "/a/doc.ts",
      true,
      opts(gen.makeId),
    );
    expect(targetId).toBe(7);
    expect(gen.calls).toBe(0);
    expect(tabs).toBe(curr); // same reference: no-op
  });

  it("promotes a matching preview tab in-place (preview -> false)", () => {
    const gen = counter();
    const curr: Tab[] = [term(1), editor(7, "/a/doc.ts", true)];
    const { tabs, targetId } = resolveFileTabOpen(
      curr,
      "/a/doc.ts",
      true,
      opts(gen.makeId),
    );
    expect(targetId).toBe(7);
    expect(gen.calls).toBe(0);
    expect((tabs[1] as EditorTab).preview).toBe(false);
    expect(tabs[1].id).toBe(7); // same tab id, promoted in place
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toBe(curr[0]);
  });
});

describe("resolveFileTabOpen — pin=false (preview)", () => {
  it("appends a preview tab when no slot exists", () => {
    const gen = counter();
    const curr: Tab[] = [term(1)];
    const { tabs, targetId } = resolveFileTabOpen(
      curr,
      "/a/doc.ts",
      false,
      opts(gen.makeId),
    );
    expect(targetId).toBe(100);
    expect(tabs).toHaveLength(2);
    expect(tabs[1] as EditorTab).toMatchObject({
      id: 100,
      preview: true,
      path: "/a/doc.ts",
    });
  });

  it("replaces the existing preview slot in place, keeping its position", () => {
    const gen = counter();
    const curr: Tab[] = [
      editor(7, "/a/old.ts", true),
      term(1),
    ];
    const { tabs, targetId } = resolveFileTabOpen(
      curr,
      "/a/new.ts",
      false,
      opts(gen.makeId),
    );
    expect(targetId).toBe(100);
    expect(tabs).toHaveLength(2);
    // slot stays at index 0, new id + path, still a preview
    expect(tabs[0] as EditorTab).toMatchObject({
      id: 100,
      path: "/a/new.ts",
      preview: true,
    });
    expect(tabs[1]).toBe(curr[1]); // terminal untouched
  });

  it("reuses the preview slot when it already shows the same path", () => {
    const gen = counter();
    const curr: Tab[] = [editor(7, "/a/doc.ts", true)];
    const { tabs, targetId } = resolveFileTabOpen(
      curr,
      "/a/doc.ts",
      false,
      opts(gen.makeId),
    );
    expect(targetId).toBe(7);
    expect(gen.calls).toBe(0);
    expect(tabs).toBe(curr); // no-op
  });

  it("activates an existing persistent tab and never touches the preview slot", () => {
    const gen = counter();
    const curr: Tab[] = [
      editor(7, "/a/doc.ts", false), // persistent for the target path
      editor(8, "/a/other.ts", true), // an unrelated preview slot
    ];
    const { tabs, targetId } = resolveFileTabOpen(
      curr,
      "/a/doc.ts",
      false,
      opts(gen.makeId),
    );
    // Invariant 3: persistent wins over creating/replacing a preview.
    expect(targetId).toBe(7);
    expect(gen.calls).toBe(0);
    expect(tabs).toBe(curr); // preview slot at index 1 left intact
  });
});
