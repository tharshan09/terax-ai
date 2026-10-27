// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOD_PROP } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  type ShortcutHandlers,
  useGlobalShortcuts,
} from "./lib/useGlobalShortcuts";
import { usePageSaveGuard } from "./lib/usePageSaveGuard";
import {
  type KeyBinding,
  SHORTCUTS,
  type ShortcutId,
  isEditorShortcutDisabled,
} from "./shortcuts";

const MOD: KeyboardEventInit =
  MOD_PROP === "meta" ? { metaKey: true } : { ctrlKey: true };
const OTHER_MOD: KeyboardEventInit =
  MOD_PROP === "meta" ? { ctrlKey: true } : { metaKey: true };

const initialShortcuts = usePreferencesStore.getState().shortcuts;

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
  { guard }: { guard?: "before" | "after" } = {},
) {
  if (guard === "before") renderHook(() => usePageSaveGuard());
  renderHook(() =>
    useGlobalShortcuts(handlers, {
      isDisabled: (id) => isEditorShortcutDisabled(id, activeTabKind),
    }),
  );
  if (guard === "after") renderHook(() => usePageSaveGuard());
  return handlers;
}

function rebindSave(binding: KeyBinding) {
  usePreferencesStore.setState({
    shortcuts: { ...initialShortcuts, "editor.save": [binding] },
  });
}

const laterListener = vi.fn();

afterEach(() => {
  cleanup();
  window.removeEventListener("keydown", laterListener);
  laterListener.mockReset();
  usePreferencesStore.setState({ shortcuts: initialShortcuts });
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

  it("skips Mod+S from a field without preventing its default", () => {
    const handlers = mount("editor");
    const e = press({ ...MOD, key: "s" }, field());
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
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

describe("page save guard in the capture phase", () => {
  it("blocks the WebView default of an unclaimed Mod+S", () => {
    renderHook(() => usePageSaveGuard());
    expect(press({ ...MOD, key: "s" }).defaultPrevented).toBe(true);
  });

  it("blocks Mod+S from a field that stops its propagation", () => {
    const handlers = mount("editor", undefined, { guard: "after" });
    const input = field();
    const onField = vi.fn((e: Event) => e.stopPropagation());
    input.addEventListener("keydown", onField);
    const e = press({ ...MOD, key: "s" }, input);
    expect(e.defaultPrevented).toBe(true);
    expect(onField).toHaveBeenCalledTimes(1);
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
  });

  it.each(["before", "after"] as const)(
    "[AC-6] saves Mod+S in the editor exactly once with the guard registered %s",
    (guard) => {
      const handlers = mount("editor", undefined, { guard });
      const e = press({ ...MOD, key: "s" }, editorContent());
      expect(handlers["editor.save"]).toHaveBeenCalledTimes(1);
      expect(e.defaultPrevented).toBe(true);
    },
  );

  it("ignores S with other modifiers", () => {
    renderHook(() => usePageSaveGuard());
    for (const init of [
      { ...MOD, shiftKey: true, key: "S" },
      { ...MOD, altKey: true, key: "s" },
      { ...OTHER_MOD, key: "s" },
      { key: "s" },
    ]) {
      expect(press(init).defaultPrevented).toBe(false);
    }
  });

  it("[AC-7] blocks the default of Mod+S that a terminal tab let through", () => {
    const handlers = mount("terminal", undefined, { guard: "after" });
    window.addEventListener("keydown", laterListener);
    const e = press({ ...MOD, key: "s" });
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(laterListener).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it("[AC-6] blocks the default of Mod+S in a field without saving", () => {
    const handlers = mount("editor", undefined, { guard: "after" });
    const e = press({ ...MOD, key: "s" }, field());
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it("[AC-6] saves a held Mod+S in the editor once", () => {
    const handlers = mount("editor", undefined, { guard: "after" });
    const content = editorContent();
    press({ ...MOD, key: "s" }, content);
    const held = press({ ...MOD, key: "s", repeat: true }, content);
    expect(handlers["editor.save"]).toHaveBeenCalledTimes(1);
    expect(held.defaultPrevented).toBe(true);
  });

  it("still blocks Mod+S when editor.save is bound elsewhere", () => {
    rebindSave({ [MOD_PROP]: true, key: "l" });
    const handlers = mount("editor", undefined, { guard: "after" });
    const content = editorContent();
    const e = press({ ...MOD, key: "s" }, content);
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
    press({ ...MOD, key: "l" }, content);
    expect(handlers["editor.save"]).toHaveBeenCalledTimes(1);
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
