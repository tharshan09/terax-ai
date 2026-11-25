// @vitest-environment jsdom
import type { EditorTab } from "@/modules/tabs";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, editors } = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(),
  // One entry per EditorPane mount: its path and the onLoaded it was given.
  editors: [] as Array<{ path: string; onLoaded?: () => void }>,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: () => Promise.resolve(() => {}),
}));
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    get = () => Promise.resolve(undefined);
    set = () => Promise.resolve();
    save = () => Promise.resolve();
    entries = () => Promise.resolve([]);
    onChange = () => Promise.resolve(() => {});
  },
}));
vi.mock("@tauri-apps/plugin-os", () => ({ platform: () => "linux" }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
// Stands in for the editor: counts its mounts, reads nothing on its own.
vi.mock("./EditorPane", async () => {
  const { createElement, useEffect } = await import("react");
  return {
    EditorPane: ({
      path,
      onLoaded,
    }: {
      path: string;
      onLoaded?: () => void;
    }) => {
      useEffect(() => {
        editors.push({ path, onLoaded });
      }, []);
      return createElement("div", { "data-editor": path });
    },
  };
});

import { useZenStore } from "@/modules/zen/lib/zenStore";
import { EditorStack } from "./EditorStack";

function editorTab(id: number, path: string, dirty = false): EditorTab {
  return {
    id,
    kind: "editor",
    title: path,
    path,
    dirty,
    preview: false,
    spaceId: "s",
  };
}

const noop = () => {};

function stack(
  tabs: EditorTab[],
  activeId: number,
  onSetDocView = noop as (id: number, m: "rendered" | "raw") => void,
) {
  return (
    <EditorStack
      tabs={tabs}
      activeId={activeId}
      onDirtyChange={noop}
      registerHandle={noop}
      onCloseTab={noop}
      onSetDocView={onSetDocView}
    />
  );
}

function layerOf(container: HTMLElement, path: string): HTMLElement {
  const editor = container.querySelector(`[data-editor="${path}"]`);
  const layer = editor?.closest<HTMLElement>(".absolute");
  if (!layer) throw new Error(`no layer for ${path}`);
  return layer;
}

function button(root: HTMLElement, selector: string): HTMLButtonElement {
  const b = root.querySelector<HTMLButtonElement>(selector);
  if (!b) throw new Error(`no ${selector}`);
  return b;
}

function renderedButton(root: HTMLElement): HTMLButtonElement {
  const b = [...root.querySelectorAll("button")].find(
    (x) => x.textContent === "Rendered",
  );
  if (!b) throw new Error("no Rendered button");
  return b;
}

const RAW = "/p/a.html";
const CODE = "/p/main.rs";

beforeEach(() => {
  editors.length = 0;
  invoke.mockReset();
  useZenStore.setState({ on: false });
});
afterEach(() => {
  cleanup();
  useZenStore.setState({ on: false });
});

describe("EditorStack raw header", () => {
  it("[AC-11] Reload rebuilds the editor once, loading until it has read the file; Rendered switches the view", async () => {
    const onSetDocView = vi.fn();
    const tabs = [editorTab(1, RAW), editorTab(2, CODE)];
    const { container } = render(stack(tabs, 1, onSetDocView));
    const raw = layerOf(container, RAW);
    expect(editors.filter((e) => e.path === RAW)).toHaveLength(1);
    const reload = () => button(raw, 'button[title="Reload"]');
    expect(reload().getAttribute("aria-busy")).toBe("false");

    fireEvent.click(reload());
    expect(editors.filter((e) => e.path === RAW)).toHaveLength(2);
    expect(reload().getAttribute("aria-busy")).toBe("true");
    act(() => editors.filter((e) => e.path === RAW)[1].onLoaded?.());
    expect(reload().getAttribute("aria-busy")).toBe("false");
    expect(editors.filter((e) => e.path === CODE)).toHaveLength(1);

    fireEvent.click(renderedButton(raw));
    expect(onSetDocView).toHaveBeenCalledExactlyOnceWith(1, "rendered");
  });

  it("[AC-11] unsaved: Reload and Rendered are locked, Rendered says 'Save to preview'", () => {
    const tabs = [editorTab(1, RAW, true), editorTab(2, CODE)];
    const onSetDocView = vi.fn();
    const { container } = render(stack(tabs, 1, onSetDocView));
    const raw = layerOf(container, RAW);
    const reload = button(raw, 'button[title="Reload"]');
    const rendered = renderedButton(raw);
    expect(reload.disabled).toBe(true);
    expect(rendered.disabled).toBe(true);
    expect(rendered.getAttribute("title")).toBe("Save to preview");
    fireEvent.click(reload);
    fireEvent.click(rendered);
    expect(editors.filter((e) => e.path === RAW)).toHaveLength(1);
    expect(onSetDocView).not.toHaveBeenCalled();
  });

  it("[AC-11] the main.rs tab has no header", () => {
    const { container } = render(
      stack([editorTab(1, RAW), editorTab(2, CODE)], 2),
    );
    expect(
      layerOf(container, CODE).querySelector("[data-preview-header]"),
    ).toBeNull();
    expect(
      layerOf(container, RAW).querySelector("[data-preview-header]"),
    ).not.toBeNull();
  });

  it("[AC-18] the raw frame has border and corners outside zen, none in zen; the header stays", () => {
    const { container } = render(stack([editorTab(1, RAW)], 1));
    const raw = layerOf(container, RAW);
    const frame = raw.firstElementChild as HTMLElement;
    const frameClasses = () =>
      (frame.getAttribute("class") ?? "")
        .split(/\s+/)
        .filter((c) =>
          ["rounded-md", "border", "border-border/60"].includes(c),
        );
    expect(frameClasses()).toEqual([
      "rounded-md",
      "border",
      "border-border/60",
    ]);
    act(() => useZenStore.setState({ on: true }));
    expect(frameClasses()).toEqual([]);
    expect(
      raw.querySelector('button[aria-label="Toggle zen mode"]'),
    ).not.toBeNull();
  });
});
