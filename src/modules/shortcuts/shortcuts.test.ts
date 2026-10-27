// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOD_PROP } from "@/lib/platform";
import {
  type ShortcutHandlers,
  useGlobalShortcuts,
} from "./lib/useGlobalShortcuts";
import {
  SHORTCUTS,
  type ShortcutId,
  isEditorShortcutDisabled,
} from "./shortcuts";

const MOD: KeyboardEventInit =
  MOD_PROP === "meta" ? { metaKey: true } : { ctrlKey: true };

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    ...init,
    bubbles: true,
    cancelable: true,
  });
}

function press(
  init: KeyboardEventInit,
  target: EventTarget = window,
): KeyboardEvent {
  const e = keydown(init);
  target.dispatchEvent(e);
  return e;
}

function editorContent(): Element {
  const cm = document.createElement("div");
  cm.className = "cm-editor";
  const content = document.createElement("div");
  content.setAttribute("contenteditable", "true");
  cm.append(content);
  document.body.append(cm);
  return content;
}

function field(): Element {
  const input = document.createElement("input");
  document.body.append(input);
  return input;
}

function mount(
  activeTabKind: "editor" | "terminal",
  handlers: ShortcutHandlers = {
    "editor.save": vi.fn(),
    "space.overview": vi.fn(),
  },
) {
  renderHook(() =>
    useGlobalShortcuts(handlers, {
      isDisabled: (id) => isEditorShortcutDisabled(id, activeTabKind),
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
  it("[AC-7] binds Mod+S to editor.save in the Editor group", () => {
    expect(SHORTCUTS.find((s) => s.id === "editor.save")).toMatchObject({
      label: "Save file",
      group: "Editor",
      defaultBindings: [{ [MOD_PROP]: true, key: "s" }],
    });
  });

  it("disables the editor shortcuts outside an editor tab only", () => {
    const editorIds: ShortcutId[] = [
      "editor.undo",
      "editor.redo",
      "editor.save",
    ];
    for (const id of editorIds) {
      expect(isEditorShortcutDisabled(id, "terminal")).toBe(true);
      expect(isEditorShortcutDisabled(id, undefined)).toBe(true);
      expect(isEditorShortcutDisabled(id, "editor")).toBe(false);
    }
    expect(isEditorShortcutDisabled("space.overview", "terminal")).toBe(false);
  });
});

describe("editor.save in the capture phase", () => {
  it("[AC-6] saves on Mod+S in an editor tab", () => {
    const handlers = mount("editor");
    const e = press({ ...MOD, key: "s" }, editorContent());
    expect(handlers["editor.save"]).toHaveBeenCalledTimes(1);
    expect(handlers["space.overview"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it("[AC-7] keeps Mod+Shift+S on space.overview", () => {
    const handlers = mount("editor");
    press({ ...MOD, shiftKey: true, key: "S" });
    expect(handlers["space.overview"]).toHaveBeenCalledTimes(1);
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
  });

  it("skips a held Mod+S without preventing its default", () => {
    const handlers = mount("editor");
    const e = press({ ...MOD, key: "s", repeat: true }, editorContent());
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("[AC-6] saves on Mod+S with the focus in a field outside the editor", () => {
    const handlers = mount("editor");
    const e = press({ ...MOD, key: "s" }, field());
    expect(handlers["editor.save"]).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it("[AC-7] lets Mod+S in a terminal tab fall through unclaimed", () => {
    const handlers = mount("terminal");
    window.addEventListener("keydown", laterListener);
    const e = press({ ...MOD, key: "s" });
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
    expect(laterListener).toHaveBeenCalledTimes(1);
  });

  it("leaves Mod+S alone without a handler", () => {
    mount("editor", {});
    const e = press({ ...MOD, key: "s" });
    expect(e.defaultPrevented).toBe(false);
  });
});

describe("editor shortcuts from a field", () => {
  it("leaves Mod+Z in a field to the field's own history", () => {
    const handlers = mount("editor", { "editor.undo": vi.fn() });
    const e = press({ ...MOD, key: "z" }, field());
    expect(handlers["editor.undo"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it("runs Mod+Z inside the editor", () => {
    const handlers = mount("editor", { "editor.undo": vi.fn() });
    const e = press({ ...MOD, key: "z" }, editorContent());
    expect(handlers["editor.undo"]).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });
});
