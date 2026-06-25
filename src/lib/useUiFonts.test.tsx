// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useUiFonts } from "./useUiFonts";

function Harness() {
  useUiFonts();
  return null;
}

const root = () => document.documentElement;
const sans = () => root().style.getPropertyValue("--ui-font-sans");
const mono = () => root().style.getPropertyValue("--font-mono");

afterEach(() => {
  cleanup();
  root().style.removeProperty("--ui-font-sans");
  root().style.removeProperty("--font-mono");
});

describe("useUiFonts", () => {
  it("does not touch the font vars before hydration", () => {
    usePreferencesStore.setState({
      hydrated: false,
      uiFontFamily: "Georgia",
      uiMonoFontFamily: "Menlo",
    });
    render(<Harness />);
    expect(sans()).toBe("");
    expect(mono()).toBe("");
  });

  it("applies the prefs as CSS-variable overrides once hydrated", () => {
    usePreferencesStore.setState({
      hydrated: true,
      uiFontFamily: "Georgia",
      uiMonoFontFamily: "Menlo",
    });
    render(<Harness />);
    expect(sans()).toBe("Georgia");
    expect(mono()).toBe("Menlo");
  });

  it("removes the override when a pref is blank, so defaults apply", () => {
    root().style.setProperty("--ui-font-sans", "Georgia");
    usePreferencesStore.setState({
      hydrated: true,
      uiFontFamily: "",
      uiMonoFontFamily: "",
    });
    render(<Harness />);
    expect(sans()).toBe("");
    expect(mono()).toBe("");
  });
});
