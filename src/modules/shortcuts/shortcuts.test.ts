// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOD_PROP } from "@/lib/platform";
import { shortcutVerdict, useGlobalShortcuts } from "./lib/useGlobalShortcuts";
import { SHORTCUTS, type Shortcut, type ShortcutId } from "./shortcuts";

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

function registered(id: ShortcutId): Shortcut {
  const shortcut = SHORTCUTS.find((s) => s.id === id);
  if (!shortcut) throw new Error(`${id} is not registered`);
  return shortcut;
}

function mountShortcuts(activeTabKind: "editor" | "terminal") {
  const handlers = { "editor.save": vi.fn(), "space.overview": vi.fn() };
  renderHook(() =>
    useGlobalShortcuts(handlers, {
      isDisabled: (s) => s.scope === "editorTab" && activeTabKind !== "editor",
    }),
  );
  return handlers;
}

const laterListener = vi.fn();

afterEach(() => {
  cleanup();
  window.removeEventListener("keydown", laterListener);
  laterListener.mockReset();
  document.body.replaceChildren();
});

describe("SHORTCUTS registry", () => {
  it("[AC-7] registers Mod+S as Save file in the Editor group", () => {
    expect(registered("editor.save")).toMatchObject({
      label: "Save file",
      group: "Editor",
      defaultBindings: [{ [MOD_PROP]: true, key: "s" }],
      scope: "editorTab",
      onRepeat: "swallow",
      inField: "swallow",
      whenDisabled: "preventDefault",
    });
    for (const id of ["editor.undo", "editor.redo"] as const) {
      expect(registered(id)).toMatchObject({
        scope: "editorTab",
        inField: "native",
      });
    }
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

  it("[AC-7] lets Mod+S fall through in a terminal tab without the WebView default", () => {
    const handlers = mountShortcuts("terminal");
    window.addEventListener("keydown", laterListener);
    for (const repeat of [false, true]) {
      const e = press({ ...MOD, key: "s", repeat });
      expect(e.defaultPrevented).toBe(true);
    }
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(laterListener).toHaveBeenCalledTimes(2);
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
  const save = registered("editor.save");
  const undo = registered("editor.undo");
  const disabled = () => true;

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

  it("only prevents the default of a disabled Mod+S, held or not", () => {
    for (const repeat of [false, true]) {
      expect(
        shortcutVerdict(save, { repeat, target: document.body }, disabled),
      ).toBe("block");
    }
    expect(
      shortcutVerdict(undo, { repeat: false, target: document.body }, disabled),
    ).toBe("native");
  });

  it("leaves undo to a focused field and skips non-repeating shortcuts on repeat", () => {
    const field = attach(document.createElement("input"));
    expect(shortcutVerdict(undo, { repeat: false, target: field })).toBe(
      "native",
    );
    expect(
      shortcutVerdict(undo, { repeat: false, target: editorContent() }),
    ).toBe("run");
    expect(
      shortcutVerdict(registered("tab.new"), {
        repeat: true,
        target: document.body,
      }),
    ).toBe("skip");
    expect(
      shortcutVerdict(registered("tab.next"), {
        repeat: true,
        target: document.body,
      }),
    ).toBe("run");
  });

  it("reads the behaviour from the entry's fields alone", () => {
    const field = attach(document.createElement("input"));
    expect(shortcutVerdict({}, { repeat: false, target: field })).toBe("run");
    expect(
      shortcutVerdict({ inField: "native" }, { repeat: false, target: field }),
    ).toBe("native");
    expect(
      shortcutVerdict(
        { onRepeat: "swallow" },
        {
          repeat: true,
          target: document.body,
        },
      ),
    ).toBe("swallow");
    expect(
      shortcutVerdict(
        { whenDisabled: "preventDefault" },
        { repeat: false, target: document.body },
        disabled,
      ),
    ).toBe("block");
  });
});
