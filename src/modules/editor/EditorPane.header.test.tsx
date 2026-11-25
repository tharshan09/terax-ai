// @vitest-environment jsdom
import type { WorkspaceEnv } from "@/modules/workspace";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The same Tauri stand-ins as EditorPane.preview-env.test.tsx; the document
// read is replaced through `fs_read_file`.
const { invoke, convertFileSrc } = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(),
  convertFileSrc: vi.fn(
    (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  ),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke, convertFileSrc }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: () => Promise.resolve(() => {}),
}));
vi.mock("@/modules/editor/lib/useEditorThemeExt", () => ({
  useEditorThemeExt: () => [],
}));

import type { EditorTab } from "@/modules/tabs";
import { LOCAL_WORKSPACE, useWorkspaceEnvStore } from "@/modules/workspace";
import { EditorPane } from "./EditorPane";
import { EditorStack } from "./EditorStack";

const SSH: WorkspaceEnv = { kind: "ssh", host: "devbox" };

beforeEach(() => {
  // jsdom has no object URLs; the remote image path needs one.
  Object.assign(URL, {
    createObjectURL: () => "blob:terax/1",
    revokeObjectURL: () => {},
  });
  useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
  invoke.mockReset();
  convertFileSrc.mockClear();
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "fs_read_file")
      return Promise.resolve({ kind: "binary", size: 8 });
    if (cmd === "fs_is_pdf") return Promise.resolve(true);
    if (cmd === "fs_read_remote_image")
      return Promise.resolve(new ArrayBuffer(8));
    return Promise.resolve(null);
  });
});
afterEach(() => {
  cleanup();
  useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
});

async function settle() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

function headerOf(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>("[data-preview-header]");
}

function expectSlimHeader(
  container: HTMLElement,
  fileName: string,
): HTMLElement {
  const header = headerOf(container);
  if (!header) throw new Error("no header");
  expect(header.textContent).toContain(fileName);
  expect(
    header.querySelector('button[title="Open in Browser"]'),
  ).not.toBeNull();
  expect(
    header.querySelector('button[aria-label="Toggle zen mode"]'),
  ).not.toBeNull();
  expect(header.querySelector('button[title="Reload"]')).toBeNull();
  expect(header.textContent).not.toContain("Rendered");
  expect(header.textContent).not.toContain("Raw");
  return header;
}

const follows = (a: Node, b: Node) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe("EditorPane preview header", () => {
  it("[AC-17] a.png locally: header above the image", async () => {
    const { container } = render(
      <EditorPane path="/p/a.png" workspace={LOCAL_WORKSPACE} />,
    );
    await settle();
    const header = expectSlimHeader(container, "a.png");
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(follows(header, img as Node)).toBe(true);
  });

  it("[AC-17] a.png over SSH: header above the remote image", async () => {
    const { container } = render(
      <EditorPane path="/srv/p/a.png" workspace={SSH} />,
    );
    await settle();
    const header = expectSlimHeader(container, "a.png");
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("blob:terax/1");
    expect(follows(header, img as Node)).toBe(true);
    const commands = invoke.mock.calls.map(([c]) => c);
    expect(commands).toContain("fs_read_remote_image");
    expect(commands).not.toContain("asset_allow");
  });

  it("[AC-17] doc.pdf locally (real PDF): header above the unsandboxed frame as today", async () => {
    const { container } = render(
      <EditorPane path="/p/doc.pdf" workspace={LOCAL_WORKSPACE} />,
    );
    await settle();
    const header = expectSlimHeader(container, "doc.pdf");
    const frame = container.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.hasAttribute("sandbox")).toBe(false);
    expect(frame?.getAttribute("src")).toBe(convertFileSrc("/p/doc.pdf"));
    expect(follows(header, frame as Node)).toBe(true);
  });

  it("[AC-17] doc.pdf over SSH: header above the card", async () => {
    const { container } = render(
      <EditorPane path="/srv/p/doc.pdf" workspace={SSH} />,
    );
    await settle();
    const header = expectSlimHeader(container, "doc.pdf");
    const card = [...container.querySelectorAll("div")].find(
      (d) =>
        d.textContent?.includes("preview not available over SSH") &&
        d.children.length === 0,
    );
    expect(card).toBeDefined();
    expect(follows(header, card as Node)).toBe(true);
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("[AC-17] clip.mp4 has no header", async () => {
    const { container } = render(
      <EditorPane path="/p/clip.mp4" workspace={LOCAL_WORKSPACE} />,
    );
    await settle();
    expect(container.querySelector("video")).not.toBeNull();
    expect(headerOf(container)).toBeNull();
  });

  it.each([
    ["binary", "/p/a.png", () => Promise.resolve({ kind: "binary", size: 8 })],
    [
      "too large",
      "/p/a.png",
      () => Promise.resolve({ kind: "toolarge", size: 99, limit: 9 }),
    ],
    ["a read error", "/p/a.png", () => Promise.reject("gone")],
    [
      "text",
      "/p/a.txt",
      () => Promise.resolve({ kind: "text", content: "hello", size: 5 }),
    ],
  ] as const)(
    "[API-6] onLoaded fires exactly once per read, for %s",
    async (_, path, read) => {
      invoke.mockImplementation((cmd: string) =>
        cmd === "fs_read_file" ? read() : Promise.resolve(null),
      );
      const onLoaded = vi.fn();
      render(
        <EditorPane
          path={path}
          workspace={LOCAL_WORKSPACE}
          onLoaded={onLoaded}
        />,
      );
      expect(onLoaded).not.toHaveBeenCalled();
      await settle();
      await settle();
      expect(onLoaded).toHaveBeenCalledOnce();
    },
  );

  it("[API-6] raw tab: a reload that fails to read still ends loading", async () => {
    let reads = 0;
    invoke.mockImplementation((cmd: string) => {
      if (cmd !== "fs_read_file") return Promise.resolve(null);
      reads += 1;
      return reads === 1
        ? Promise.resolve({ kind: "toolarge", size: 99, limit: 9 })
        : Promise.reject("gone");
    });
    const tab: EditorTab = {
      id: 1,
      kind: "editor",
      title: "a.html",
      path: "/p/a.html",
      dirty: false,
      preview: false,
      spaceId: "s",
      workspace: LOCAL_WORKSPACE,
    };
    const noop = () => {};
    const { container } = render(
      <EditorStack
        tabs={[tab]}
        activeId={1}
        onDirtyChange={noop}
        registerHandle={noop}
        onCloseTab={noop}
        onSetDocView={noop}
      />,
    );
    await settle();
    const reload = () =>
      container.querySelector('button[title="Reload"]') as HTMLButtonElement;
    expect(reload().getAttribute("aria-busy")).toBe("false");
    await act(async () => {
      reload().click();
    });
    await settle();
    expect(reads).toBe(2);
    expect(container.textContent).toContain("gone");
    expect(reload().getAttribute("aria-busy")).toBe("false");
  });
});
