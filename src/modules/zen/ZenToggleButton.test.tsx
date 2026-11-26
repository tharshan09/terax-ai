// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Rendering must not reach Tauri: any call through these fails the test.
const { tauriCall } = vi.hoisted(() => ({
  tauriCall: vi.fn(() => {
    throw new Error("ZenToggleButton must not call Tauri");
  }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: tauriCall }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: tauriCall,
  emit: tauriCall,
}));
// The settings store builds a LazyStore at import; any use of it fails.
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    get = tauriCall;
    set = tauriCall;
    save = tauriCall;
    entries = tauriCall;
    onChange = tauriCall;
  },
}));
// A fixed platform, so the shortcut tokens are the non-mac ones.
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "linux" }));

import { usePreferencesStore } from "@/modules/settings/preferences";
import { useZenStore } from "./lib/zenStore";
import { ZenToggleButton } from "./ZenToggleButton";

const defaultShortcuts = usePreferencesStore.getState().shortcuts;

afterEach(() => {
  cleanup();
  useZenStore.setState({ on: false });
  usePreferencesStore.setState({ shortcuts: defaultShortcuts });
});

const button = () => screen.getByRole("button", { name: "Toggle zen mode" });

describe("ZenToggleButton", () => {
  it("[AC-6] renders without a TooltipProvider and toggles zen off, on, off", () => {
    // No TooltipProvider around it, like EditorPane.preview-env.test.tsx.
    render(<ZenToggleButton />);
    expect(button().getAttribute("aria-label")).toBe("Toggle zen mode");
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(useZenStore.getState().on).toBe(false);

    fireEvent.click(button());
    expect(useZenStore.getState().on).toBe(true);
    expect(button().getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(button());
    expect(useZenStore.getState().on).toBe(false);
    expect(button().getAttribute("aria-pressed")).toBe("false");
    expect(tauriCall).not.toHaveBeenCalled();
  });

  it("[AC-6] shows the default view.zenMode shortcut in the title", () => {
    // Default binding Mod+Shift+' (shortcuts.ts), Mod = Ctrl off macOS.
    render(<ZenToggleButton />);
    expect(button().getAttribute("title")).toBe(
      "Toggle zen mode · Ctrl Shift '",
    );
  });

  it("[AC-6] follows a rebinding in the settings", () => {
    render(<ZenToggleButton />);
    act(() =>
      usePreferencesStore.setState({
        shortcuts: {
          ...defaultShortcuts,
          "view.zenMode": [{ alt: true, key: "z" }],
        },
      }),
    );
    expect(button().getAttribute("title")).toBe("Toggle zen mode · Alt Z");
    expect(button().getAttribute("aria-label")).toBe("Toggle zen mode");
  });

  it("[AC-6] shows the bare label when the shortcut has no binding", () => {
    usePreferencesStore.setState({
      shortcuts: { ...defaultShortcuts, "view.zenMode": [] },
    });
    render(<ZenToggleButton />);
    expect(button().getAttribute("title")).toBe("Toggle zen mode");
  });

  it("[AC-6] follows zen changed elsewhere (shortcut, Esc)", () => {
    render(<ZenToggleButton className="ml-1" />);
    expect(button().className).toContain("ml-1");
    act(() => useZenStore.getState().enterZen());
    expect(button().getAttribute("aria-pressed")).toBe("true");
    act(() => useZenStore.getState().exitZen());
    expect(button().getAttribute("aria-pressed")).toBe("false");
  });
});
