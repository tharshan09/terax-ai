// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Radix measures its popper; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

type DropEvent = {
  payload: {
    type: "drop";
    paths: string[];
    position: { x: number; y: number };
  };
};

const { invoke, LOCAL, webview } = vi.hoisted(() => ({
  invoke: vi.fn(),
  LOCAL: { kind: "local" } as const,
  webview: { drop: null as ((event: DropEvent) => void) | null },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: (handler: (event: DropEvent) => void) => {
      webview.drop = handler;
      return Promise.resolve(() => {});
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { message: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/platform", () => ({ IS_MAC: true }));
vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => LOCAL,
  useWorkspaceEnvStore: (select: (s: { env: typeof LOCAL }) => unknown) =>
    select({ env: LOCAL }),
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (select: (s: object) => unknown) =>
    select({ showHidden: false, explorerGitDecorations: false }),
}));
vi.mock("@/modules/shortcuts", () => ({ useGlobalShortcuts: () => {} }));
vi.mock("./ExplorerSearch", () => ({ ExplorerSearch: () => null }));
vi.mock("./lib/useGitStatus", () => {
  const lookup = () => null;
  return { useGitStatus: () => ({ lookup }) };
});
vi.mock("./lib/watch", () => ({
  watchAdd: vi.fn(),
  watchRemove: vi.fn(),
  listenFsChanged: () => Promise.resolve(() => {}),
}));

import { FileExplorer } from "./FileExplorer";

type Handlers = Record<string, (args: unknown) => Promise<unknown>>;

function serve(handlers: Handlers = {}) {
  invoke.mockImplementation((cmd: string, args: unknown) => {
    const handler = handlers[cmd];
    if (handler) return handler(args);
    return Promise.resolve(cmd === "fs_read_dir" ? [] : undefined);
  });
}

// The virtualizer renders no row while its scroll box measures 0 px high.
function rowsInView(): () => void {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
  return () => {
    if (original)
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
  };
}

function explorer(rootPath: string) {
  return <FileExplorer rootPath={rootPath} onOpenFile={() => {}} />;
}

async function settle() {
  await act(() => new Promise<void>((done) => setTimeout(done, 0)));
}

function treeArea(): HTMLElement {
  const area = document.querySelector<HTMLElement>("[data-explorer-drop]");
  if (!area) throw new Error("explorer tree not rendered");
  return area;
}

function commands(from = 0): string[] {
  return invoke.mock.calls.slice(from).map(([cmd]) => cmd as string);
}

function reads(from = 0): unknown[] {
  return invoke.mock.calls
    .slice(from)
    .filter(([cmd]) => cmd === "fs_read_dir")
    .map(([, args]) => (args as { path: string }).path);
}

beforeEach(() => {
  vi.resetAllMocks();
  webview.drop = null;
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => treeArea(),
  });
});
afterEach(cleanup);

describe("FileExplorer paste and drop scope", () => {
  it("pastes from the root menu into the root it was opened on", async () => {
    serve({
      fs_clipboard_paths: () =>
        Promise.resolve({ paths: ["/x/f.txt"], unresolved: 0 }),
      fs_copy: () => Promise.resolve({ created: ["/a/f.txt"], failed: [] }),
    });
    render(explorer("/a"));
    await settle();
    fireEvent.contextMenu(treeArea());
    fireEvent.click(await screen.findByText("Paste"));
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("fs_copy", {
        sources: ["/x/f.txt"],
        destDir: "/a",
        workspace: LOCAL,
        renameOnConflict: true,
      }),
    );
    await settle();
  });

  it("pastes from a row menu into that folder, or beside that file", async () => {
    const restore = rowsInView();
    try {
      const entry = (name: string, kind: "dir" | "file") => ({
        name,
        kind,
        size: 0,
        mtime: 0,
        gitignored: false,
      });
      serve({
        fs_read_dir: (args) =>
          Promise.resolve(
            (args as { path: string }).path === "/a"
              ? [entry("d", "dir"), entry("f.txt", "file")]
              : [],
          ),
        fs_clipboard_paths: () =>
          Promise.resolve({ paths: ["/x/n.txt"], unresolved: 0 }),
        fs_copy: () => Promise.resolve({ created: [], failed: [] }),
      });
      const copiedInto = () =>
        invoke.mock.calls
          .filter(([cmd]) => cmd === "fs_copy")
          .map(([, args]) => (args as { destDir: string }).destDir);
      render(explorer("/a"));
      for (const row of ["f.txt", "d"]) {
        const before = copiedInto().length;
        fireEvent.contextMenu(await screen.findByText(row));
        fireEvent.click(await screen.findByText("Paste"));
        await vi.waitFor(() => expect(copiedInto()).toHaveLength(before + 1));
        await settle();
      }
      expect(copiedInto()).toEqual(["/a", "/a/d"]);
    } finally {
      restore();
    }
  });

  it("neither copies nor changes the tree when the menu was opened on another root", async () => {
    serve({
      fs_clipboard_paths: () =>
        Promise.resolve({ paths: ["/x/f.txt"], unresolved: 0 }),
      fs_copy: () => Promise.resolve({ created: ["/a/f.txt"], failed: [] }),
    });
    const view = render(explorer("/a"));
    await settle();
    fireEvent.contextMenu(treeArea());
    await screen.findByText("Paste");

    view.rerender(explorer("/b"));
    await settle();
    expect(reads()).toEqual(["/a", "/b"]);
    const before = invoke.mock.calls.length;

    fireEvent.click(screen.getByText("Paste"));
    await settle();
    await settle();
    expect(commands(before)).toEqual([]);
    expect(screen.getByTitle("/b")).toBeTruthy();
  });

  it("re-reads a drop's folder only while the tree it landed on still shows", async () => {
    const copies: ((result: unknown) => void)[] = [];
    serve({
      fs_copy: () =>
        new Promise((resolve) => {
          copies.push(resolve);
        }),
    });
    const drop = (paths: string[]) =>
      act(() =>
        webview.drop?.({
          payload: { type: "drop", paths, position: { x: 10, y: 10 } },
        }),
      );
    const view = render(explorer("/a"));
    await settle();

    drop(["/x/one.txt"]);
    expect(invoke).toHaveBeenLastCalledWith("fs_copy", {
      sources: ["/x/one.txt"],
      destDir: "/a",
      workspace: LOCAL,
      renameOnConflict: true,
    });
    let before = invoke.mock.calls.length;
    await act(async () => copies[0]({ created: [], failed: [] }));
    await settle();
    expect(reads(before)).toEqual(["/a"]);

    drop(["/x/two.txt"]);
    expect(copies).toHaveLength(2);
    view.rerender(explorer("/b"));
    await settle();
    before = invoke.mock.calls.length;
    await act(async () => copies[1]({ created: [], failed: [] }));
    await settle();
    expect(commands(before)).toEqual([]);
  });
});

describe("FileExplorer keyboard after an edit", () => {
  it("handles keys again once the rename is done, while its re-read still runs", async () => {
    const restore = rowsInView();
    try {
      const file = (name: string) => ({
        name,
        kind: "file" as const,
        size: 0,
        mtime: 0,
        gitignored: false,
      });
      const rereads: ((entries: unknown) => void)[] = [];
      let listed = false;
      serve({
        fs_read_dir: () => {
          if (listed)
            return new Promise((resolve) => {
              rereads.push(resolve);
            });
          listed = true;
          return Promise.resolve([file("a.txt"), file("b.txt")]);
        },
      });
      const open = vi.fn();
      render(<FileExplorer rootPath="/kb" onOpenFile={open} />);
      fireEvent.doubleClick(await screen.findByText("a.txt"));
      const input = await screen.findByDisplayValue("a.txt");
      fireEvent.change(input, { target: { value: "c.txt" } });
      fireEvent.keyDown(input, { key: "Enter" });
      await vi.waitFor(() => expect(rereads).toHaveLength(1));
      await settle();
      expect(screen.queryByDisplayValue("c.txt")).toBeNull();

      fireEvent.keyDown(treeArea(), { key: "ArrowDown" });
      fireEvent.keyDown(treeArea(), { key: "Enter" });
      expect(open).toHaveBeenCalledWith("/kb/a.txt");

      await act(async () => rereads[0]([file("b.txt"), file("c.txt")]));
      expect(await screen.findByText("c.txt")).toBeTruthy();
    } finally {
      restore();
    }
  });
});
