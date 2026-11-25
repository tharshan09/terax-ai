// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, toast } = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(),
  toast: { error: vi.fn() },
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
vi.mock("sonner", () => ({ toast }));

import { useZenStore } from "@/modules/zen/lib/zenStore";
import { MarkdownPreviewPane } from "./MarkdownPreviewPane";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

function pane() {
  return render(
    <MarkdownPreviewPane
      path="/p/a.md"
      workspace={{ kind: "local" }}
      visible
      onSetView={() => {}}
    />,
  );
}

function reloadButton(root: HTMLElement): HTMLButtonElement {
  const b = root.querySelector<HTMLButtonElement>('button[title="Reload"]');
  if (!b) throw new Error("no Reload button");
  return b;
}

beforeEach(() => {
  invoke.mockReset();
  useZenStore.setState({ on: false });
});
afterEach(() => {
  cleanup();
  useZenStore.setState({ on: false });
});

describe("MarkdownPreviewPane header", () => {
  it("[AC-10] Reload reads again: v1, v2, then the error; loading ends with each answer", async () => {
    const reads = [
      deferred<unknown>(),
      deferred<unknown>(),
      deferred<unknown>(),
    ];
    let n = 0;
    invoke.mockImplementation((cmd: string) => {
      if (cmd !== "fs_read_file") return Promise.reject(`unexpected ${cmd}`);
      const read = reads[n];
      n += 1;
      return read ? read.promise : Promise.reject("too many reads");
    });
    const { container } = pane();
    await act(async () =>
      reads[0].resolve({ kind: "text", content: "# v1", size: 4 }),
    );
    await settle();
    expect(container.querySelector("h1")?.textContent).toBe("v1");
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("false");

    fireEvent.click(reloadButton(container));
    await settle();
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("true");
    await act(async () =>
      reads[1].resolve({ kind: "text", content: "# v2", size: 4 }),
    );
    await settle();
    expect(container.querySelector("h1")?.textContent).toBe("v2");
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("false");

    fireEvent.click(reloadButton(container));
    await settle();
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("true");
    await act(async () => reads[2].reject("disk gone"));
    await settle();
    expect(container.textContent).toContain("Failed to read file: disk gone");
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("false");
    expect(n).toBe(3);
  });

  it("[AC-10] the header sits above the scroll container and does not cover it", async () => {
    invoke.mockImplementation(() =>
      Promise.resolve({ kind: "text", content: "# v1", size: 4 }),
    );
    const { container } = pane();
    await settle();
    const header = container.querySelector<HTMLElement>(
      "[data-preview-header]",
    );
    if (!header) throw new Error("no header");
    const scroller = header.nextElementSibling as HTMLElement;
    const classes = (el: Element) =>
      (el.getAttribute("class") ?? "").split(/\s+/);
    expect(classes(scroller)).toEqual(
      expect.arrayContaining(["flex-1", "overflow-auto"]),
    );
    expect(scroller.querySelector("h1")?.textContent).toBe("v1");
    expect(
      classes(header).filter((c) =>
        ["absolute", "fixed", "z-10", "top-3", "right-3"].includes(c),
      ),
    ).toEqual([]);
    // Wave 1: no "Open in Browser" for Markdown.
    expect(
      container.querySelector('button[title="Open in Browser"]'),
    ).toBeNull();
  });

  it("[AC-18] the frame has border and corners outside zen, none in zen; the header stays", async () => {
    invoke.mockImplementation(() =>
      Promise.resolve({ kind: "text", content: "# v1", size: 4 }),
    );
    const { container } = pane();
    await settle();
    const root = container.firstElementChild as HTMLElement;
    const frameClasses = () =>
      (root.getAttribute("class") ?? "")
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
      root.querySelector('button[aria-label="Toggle zen mode"]'),
    ).not.toBeNull();
  });
});
