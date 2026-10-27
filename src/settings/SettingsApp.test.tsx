// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    listen: () => Promise.resolve(() => {}),
  }),
}));
vi.mock("./sections/AboutSection", () => ({ AboutSection: () => null }));
vi.mock("./sections/AgentsSection", () => ({ AgentsSection: () => null }));
vi.mock("./sections/GeneralSection", () => ({ GeneralSection: () => null }));
vi.mock("./sections/ModelsSection", () => ({ ModelsSection: () => null }));
vi.mock("./sections/ShortcutsSection", () => ({
  ShortcutsSection: () => null,
}));
vi.mock("./sections/ThemesSection", () => ({ ThemesSection: () => null }));

import { MOD_PROP } from "@/lib/platform";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { SettingsApp } from "./SettingsApp";

function pressModS(): KeyboardEvent {
  const e = new KeyboardEvent("keydown", {
    key: "s",
    metaKey: MOD_PROP === "meta",
    ctrlKey: MOD_PROP === "ctrl",
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(e);
  return e;
}

describe("SettingsApp", () => {
  afterEach(cleanup);

  it("keeps Mod+S from opening the WebView's Save Page dialog", () => {
    usePreferencesStore.setState({ init: () => Promise.resolve() });
    render(<SettingsApp />);
    expect(pressModS().defaultPrevented).toBe(true);
  });
});
