// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOD_PROP } from "@/lib/platform";
import { shortcutVerdict, useGlobalShortcuts } from "./lib/useGlobalShortcuts";
import { isEditorTabShortcut, SHORTCUTS } from "./shortcuts";

const MOD: KeyboardEventInit =
  MOD_PROP === "meta" ? { metaKey: true } : { ctrlKey: true };

function press(
  init: KeyboardEventInit,
  target: EventTarget = window,
): KeyboardEvent {
  const e = new KeyboardEvent("keydown", {
    ...init,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(e);
  return e;
}

function attach<T extends Element>(el: T, parent: Element = document.body): T {
  parent.append(el);
  return el;
}

function editorContent(): Element {
  const cm = attach(document.createElement("div"));
  cm.className = "cm-editor";
  const content = attach(document.createElement("div"), cm);
  content.setAttribute("contenteditable", "true");
  return content;
}

function mountShortcuts(activeTabKind: "editor" | "terminal") {
  const handlers = { "editor.save": vi.fn(), "space.overview": vi.fn() };
  renderHook(() =>
    useGlobalShortcuts(handlers, {
      isDisabled: (id) => isEditorTabShortcut(id) && activeTabKind !== "editor",
    }),
  );
  return handlers;
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

describe("SHORTCUTS registry", () => {
  it("[AC-7] registers Mod+S as Save file in the Editor group", () => {
    const save = SHORTCUTS.find((s) => s.id === "editor.save");
    expect(save).toMatchObject({
      label: "Save file",
      group: "Editor",
      defaultBindings: [{ [MOD_PROP]: true, key: "s" }],
    });
    expect(isEditorTabShortcut("editor.save")).toBe(true);
  });

  it("[AC-7] resolves Mod+S to editor.save in an editor tab", () => {
    const handlers = mountShortcuts("editor");
    const e = press({ ...MOD, key: "s" });
    expect(handlers["editor.save"]).toHaveBeenCalledTimes(1);
    expect(handlers["space.overview"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it("[AC-7] keeps Mod+Shift+S on space.overview", () => {
    const handlers = mountShortcuts("editor");
    press({ ...MOD, shiftKey: true, key: "S" });
    expect(handlers["space.overview"]).toHaveBeenCalledTimes(1);
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
  });

  it("[AC-7] lets Mod+S fall through in a terminal tab", () => {
    const handlers = mountShortcuts("terminal");
    const e = press({ ...MOD, key: "s" });
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("[AC-6] swallows a held Mod+S without saving again", () => {
    const handlers = mountShortcuts("editor");
    const e = press({ ...MOD, key: "s", repeat: true }, editorContent());
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it("[AC-6] blocks Save Page but does not save from a field outside the editor", () => {
    const handlers = mountShortcuts("editor");
    const e = press(
      { ...MOD, key: "s" },
      attach(document.createElement("input")),
    );
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });
});

describe("shortcutVerdict", () => {
  const save = { id: "editor.save" } as const;

  it("saves from the editor content and from a non-editable target", () => {
    expect(
      shortcutVerdict(save, { repeat: false, target: editorContent() }),
    ).toBe("run");
    expect(
      shortcutVerdict(save, { repeat: false, target: document.body }),
    ).toBe("run");
  });

  it("swallows a repeated Mod+S even inside the editor", () => {
    expect(
      shortcutVerdict(save, { repeat: true, target: editorContent() }),
    ).toBe("swallow");
  });

  it("swallows Mod+S in every editable outside the editor", () => {
    const rich = attach(document.createElement("div"));
    rich.setAttribute("contenteditable", "true");
    for (const target of [
      attach(document.createElement("input")),
      attach(document.createElement("textarea")),
      rich,
    ]) {
      expect(shortcutVerdict(save, { repeat: false, target })).toBe("swallow");
    }
  });

  it("leaves undo to a focused field and skips non-repeating shortcuts on repeat", () => {
    const field = attach(document.createElement("input"));
    expect(
      shortcutVerdict({ id: "editor.undo" }, { repeat: false, target: field }),
    ).toBe("native");
    expect(
      shortcutVerdict(
        { id: "editor.undo" },
        { repeat: false, target: editorContent() },
      ),
    ).toBe("run");
    expect(
      shortcutVerdict(
        { id: "tab.new" },
        { repeat: true, target: document.body },
      ),
    ).toBe("skip");
    expect(
      shortcutVerdict(
        { id: "tab.next", allowRepeat: true },
        { repeat: true, target: document.body },
      ),
    ).toBe("run");
  });
});
