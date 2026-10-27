// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOD_PROP } from "@/lib/platform";
import {
  type ShortcutHandlers,
  useGlobalShortcuts,
} from "./lib/useGlobalShortcuts";
import { SHORTCUTS, type ShortcutId } from "./shortcuts";

const MOD: KeyboardEventInit =
  MOD_PROP === "meta" ? { metaKey: true } : { ctrlKey: true };

const EDITOR_TAB_ONLY: ReadonlySet<ShortcutId> = new Set([
  "editor.undo",
  "editor.redo",
  "editor.save",
]);

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

function editorContent(): Element {
  const cm = document.createElement("div");
  cm.className = "cm-editor";
  const content = document.createElement("div");
  content.setAttribute("contenteditable", "true");
  cm.append(content);
  document.body.append(cm);
  return content;
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
      isDisabled: (id) => EDITOR_TAB_ONLY.has(id) && activeTabKind !== "editor",
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
      claimDefault: true,
    });
  });
});

describe("editor.save dispatch", () => {
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

  it("[AC-6] blocks the default of a held Mod+S without saving again", () => {
    const handlers = mount("editor");
    const e = press({ ...MOD, key: "s", repeat: true }, editorContent());
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it("[AC-6] blocks the default of Mod+S in a field without saving", () => {
    const handlers = mount("editor");
    const input = document.createElement("input");
    document.body.append(input);
    const e = press({ ...MOD, key: "s" }, input);
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });

  it("[AC-7] lets Mod+S fall through a terminal tab without the WebView default", () => {
    const handlers = mount("terminal");
    window.addEventListener("keydown", laterListener);
    const e = press({ ...MOD, key: "s" });
    expect(handlers["editor.save"]).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
    expect(laterListener).toHaveBeenCalledTimes(1);
  });

  it("blocks the default of Mod+S without a handler", () => {
    mount("editor", {});
    const e = press({ ...MOD, key: "s" });
    expect(e.defaultPrevented).toBe(true);
  });
});
