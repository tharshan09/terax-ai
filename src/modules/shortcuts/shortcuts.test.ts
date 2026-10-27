// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOD_PROP } from "@/lib/platform";
import { useGlobalShortcuts } from "./lib/useGlobalShortcuts";
import { isEditorTabShortcut, SHORTCUTS } from "./shortcuts";

const MOD: KeyboardEventInit =
  MOD_PROP === "meta" ? { metaKey: true } : { ctrlKey: true };

function press(init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent("keydown", {
    ...init,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(e);
  return e;
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

describe("SHORTCUTS registry", () => {
  afterEach(cleanup);

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
});
