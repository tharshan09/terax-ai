// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { platform } = vi.hoisted(() => ({ platform: { mac: true } }));
vi.mock("@/lib/platform", () => ({
  get IS_MAC() {
    return platform.mac;
  },
}));

import { useZenStore } from "@/modules/zen/lib/zenStore";
import { previewHeaderModel } from "./lib/previewHeader";
import { PreviewHeader } from "./PreviewHeader";

const OVERLAY = ["absolute", "fixed", "top-3", "right-3", "z-10"];
const MODEL = previewHeaderModel({
  surface: "html",
  path: "/p/a.html",
  workspace: { kind: "local" },
});

function header(
  props: Partial<Parameters<typeof PreviewHeader>[0]> = {},
): HTMLElement {
  const { container } = render(
    <div data-testid="pane">
      <PreviewHeader
        model={MODEL}
        onSetView={() => {}}
        onReload={() => {}}
        openInBrowser={<button type="button">open-slot</button>}
        zen={<button type="button">zen-slot</button>}
        {...props}
      />
      <div data-testid="content" />
    </div>,
  );
  const el = container.querySelector<HTMLElement>("[data-preview-header]");
  if (!el) throw new Error("header not rendered");
  return el;
}

function classesOf(el: Element): string[] {
  return (el.getAttribute("class") ?? "").split(/\s+/);
}

beforeEach(() => {
  platform.mac = true;
  useZenStore.setState({ on: false });
});
afterEach(() => {
  cleanup();
  useZenStore.setState({ on: false });
});

describe("PreviewHeader", () => {
  it("[AC-8] sits in the flow above the content, no overlay classes", () => {
    const el = header();
    const toggle = screen.getByText("Raw").parentElement as HTMLElement;
    for (const node of [el, toggle]) {
      expect(classesOf(node).filter((c) => OVERLAY.includes(c))).toEqual([]);
    }
    const pane = screen.getByTestId("pane");
    expect(pane.firstElementChild).toBe(el);
    expect(el.nextElementSibling).toBe(screen.getByTestId("content"));
    expect(el.textContent).toContain("a.html");
    expect(screen.getByText("open-slot")).toBeTruthy();
    expect(screen.getByText("zen-slot")).toBeTruthy();
  });

  it("[AC-8] Raw calls onSetView('raw')", () => {
    const onSetView = vi.fn();
    header({ onSetView });
    fireEvent.click(screen.getByText("Raw"));
    expect(onSetView).toHaveBeenCalledExactlyOnceWith("raw");
  });

  it("[AC-8] with renderedDisabled, Rendered is disabled with 'Save to preview'", () => {
    header({
      model: { ...MODEL, view: { mode: "rendered", renderedDisabled: true } },
    });
    const rendered = screen.getByText("Rendered") as HTMLButtonElement;
    expect(rendered.disabled).toBe(true);
    expect(rendered.getAttribute("title")).toBe("Save to preview");
  });

  it("[AC-8] zen on macOS leaves room for the window buttons (zen), not otherwise (default)", () => {
    act(() => useZenStore.setState({ on: true }));
    expect(classesOf(header())).toContain("pl-20");
    cleanup();

    act(() => useZenStore.setState({ on: false }));
    expect(classesOf(header())).not.toContain("pl-20");
    cleanup();

    platform.mac = false;
    act(() => useZenStore.setState({ on: true }));
    expect(classesOf(header())).not.toContain("pl-20");
  });

  it("[AC-8] Reload shows aria-busy while reloading and calls onReload", () => {
    const onReload = vi.fn();
    header({ onReload, reloading: true });
    const reload = screen.getByTitle("Reload");
    expect(reload.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(reload);
    expect(onReload).toHaveBeenCalledOnce();
  });

  it("[AC-8] shows only what the model shows", () => {
    header({
      model: previewHeaderModel({
        surface: "image",
        path: "/p/a.png",
        workspace: { kind: "wsl", distro: "Ubuntu" },
      }),
    });
    expect(screen.queryByTitle("Reload")).toBeNull();
    expect(screen.queryByText("Rendered")).toBeNull();
    expect(screen.queryByText("open-slot")).toBeNull();
    expect(screen.getByText("zen-slot")).toBeTruthy();
  });
});
