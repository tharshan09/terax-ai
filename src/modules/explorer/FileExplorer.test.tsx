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
    "clientHeight",
  );
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => 600,
  });
  return () => {
    if (original)
      Object.defineProperty(HTMLElement.prototype, "clientHeight", original);
    else Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
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

describe("FileExplorer paste selection", () => {
  it("keeps the newer paste's selection when an older paste's re-read lands last", async () => {
    const restore = rowsInView();
    try {
      const entry = (name: string, kind: "dir" | "file" = "file") => ({
        name,
        kind,
        size: 0,
        mtime: 0,
        gitignored: false,
      });
      const held = new Map<string, (entries: unknown) => void>();
      const clipboard = [["/x/a.txt"], ["/x/b.txt"]];
      let listed = false;
      serve({
        fs_read_dir: (args) => {
          const { path } = args as { path: string };
          if (path === "/sel" && !listed) {
            listed = true;
            return Promise.resolve([entry("d1", "dir"), entry("x.txt")]);
          }
          return new Promise((resolve) => held.set(path, resolve));
        },
        fs_clipboard_paths: () =>
          Promise.resolve({ paths: clipboard.shift() ?? [], unresolved: 0 }),
        fs_copy: (args) => {
          const { sources, destDir } = args as {
            sources: string[];
            destDir: string;
          };
          const created = sources.map((s) => `${destDir}/${s.slice(3)}`);
          return Promise.resolve({ created, failed: [] });
        },
      });
      const selected = (name: string) =>
        screen
          .getByText(name)
          .closest("button")
          ?.classList.contains("bg-accent");
      render(explorer("/sel"));

      fireEvent.contextMenu(await screen.findByText("d1"));
      fireEvent.click(await screen.findByText("Paste"));
      await vi.waitFor(() => expect(held.has("/sel/d1")).toBe(true));
      await settle();
      fireEvent.contextMenu(treeArea());
      fireEvent.click(await screen.findByText("Paste"));
      await vi.waitFor(() => expect(held.has("/sel")).toBe(true));

      const root = [entry("d1", "dir"), entry("b.txt"), entry("x.txt")];
      await act(async () => held.get("/sel")?.(root));
      await vi.waitFor(() => expect(selected("b.txt")).toBe(true));

      await act(async () => held.get("/sel/d1")?.([entry("a.txt")]));
      await settle();
      expect(await screen.findByText("a.txt")).toBeTruthy();
      expect(selected("a.txt")).toBe(false);
      expect(selected("b.txt")).toBe(true);
    } finally {
      restore();
    }
  });
});

describe("FileExplorer paste shortcut", () => {
  it("pastes with Cmd+V while the search bar is open but the tree still shows", async () => {
    serve({
      fs_clipboard_paths: () => Promise.resolve({ paths: [], unresolved: 0 }),
    });
    render(explorer("/srch"));
    await settle();
    fireEvent.click(screen.getByLabelText("Search files"));
    fireEvent.keyDown(treeArea(), { key: "v", code: "KeyV", metaKey: true });
    await vi.waitFor(() => expect(commands()).toContain("fs_clipboard_paths"));
    await settle();
  });
});

describe("FileExplorer selection and drops", () => {
  const entry = (name: string, kind: "dir" | "file" = "file") => ({
    name,
    kind,
    size: 0,
    mtime: 0,
    gitignored: false,
  });
  const selected = (name: string) =>
    screen.getByText(name).closest("button")?.classList.contains("bg-accent");

  it("leaves a selection the user made while the paste re-read", async () => {
    const restore = rowsInView();
    try {
      const held: ((entries: unknown) => void)[] = [];
      let listed = false;
      serve({
        fs_read_dir: () => {
          if (listed) return new Promise((resolve) => held.push(resolve));
          listed = true;
          return Promise.resolve([entry("x.txt"), entry("y.txt")]);
        },
        fs_clipboard_paths: () =>
          Promise.resolve({ paths: ["/x/n.txt"], unresolved: 0 }),
        fs_copy: () => Promise.resolve({ created: ["/us/n.txt"], failed: [] }),
      });
      render(explorer("/us"));
      fireEvent.contextMenu(await screen.findByText("x.txt"));
      fireEvent.click(await screen.findByText("Paste"));
      await vi.waitFor(() => expect(held).toHaveLength(1));

      fireEvent.click(screen.getByText("y.txt"));
      expect(selected("y.txt")).toBe(true);
      await act(async () =>
        held[0]([entry("n.txt"), entry("x.txt"), entry("y.txt")]),
      );
      await settle();
      expect(await screen.findByText("n.txt")).toBeTruthy();
      expect(selected("n.txt")).toBe(false);
      expect(selected("y.txt")).toBe(true);
    } finally {
      restore();
    }
  });

  it("re-reads a drop's folder only while that folder is open", async () => {
    const restore = rowsInView();
    try {
      serve({
        fs_read_dir: (args) =>
          Promise.resolve(
            (args as { path: string }).path === "/dr"
              ? [entry("d", "dir")]
              : [],
          ),
        fs_copy: () => Promise.resolve({ created: [], failed: [] }),
      });
      render(explorer("/dr"));
      const row = await screen.findByText("d");
      const folder = row.closest("button");
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: () => folder,
      });
      const drop = () =>
        act(async () =>
          webview.drop?.({
            payload: {
              type: "drop",
              paths: ["/x/f.txt"],
              position: { x: 10, y: 10 },
            },
          }),
        );

      let before = invoke.mock.calls.length;
      await drop();
      await settle();
      expect(commands(before)).toEqual(["fs_copy"]);

      fireEvent.click(row);
      await settle();
      before = invoke.mock.calls.length;
      await drop();
      await settle();
      expect(commands(before)).toEqual(["fs_copy", "fs_read_dir"]);
      expect(reads(before)).toEqual(["/dr/d"]);
    } finally {
      restore();
    }
  });
});

describe("FileExplorer after a failed copy", () => {
  it("re-reads after a failed copy only if something landed, keeping the listing", async () => {
    const restore = rowsInView();
    try {
      const lost = "ssh: connection closed";
      type Outcome = "rejected" | "aborted" | "aborted-placed" | "normal";
      let outcome: Outcome = "normal";
      serve({
        fs_read_dir: () =>
          outcome === "aborted-placed"
            ? Promise.reject(lost)
            : Promise.resolve([
                {
                  name: "keep.txt",
                  kind: "file",
                  size: 0,
                  mtime: 0,
                  gitignored: false,
                },
              ]),
        fs_clipboard_paths: () =>
          Promise.resolve({ paths: ["/x/f.txt"], unresolved: 0 }),
        fs_copy: () => {
          if (outcome === "rejected") return Promise.reject(lost);
          const aborted = outcome.startsWith("aborted");
          return Promise.resolve({
            created: outcome === "aborted-placed" ? ["/kept/f.txt"] : [],
            failed: aborted ? [{ source: "/x/g.txt", message: lost }] : [],
            aborted: aborted ? lost : null,
          });
        },
      });
      render(explorer("/kept"));
      expect(await screen.findByText("keep.txt")).toBeTruthy();
      const paste = async () => {
        fireEvent.contextMenu(treeArea());
        fireEvent.click(await screen.findByText("Paste"));
      };
      const drop = () =>
        act(async () =>
          webview.drop?.({
            payload: {
              type: "drop",
              paths: ["/x/f.txt"],
              position: { x: 10, y: 10 },
            },
          }),
        );
      const outcomes: Outcome[] = [
        "rejected",
        "aborted",
        "aborted-placed",
        "normal",
      ];
      for (const transfer of [paste, drop]) {
        for (const next of outcomes) {
          outcome = next;
          const before = invoke.mock.calls.length;
          await transfer();
          await vi.waitFor(() => expect(commands(before)).toContain("fs_copy"));
          await settle();
          await settle();
          const rereads = next === "normal" || next === "aborted-placed";
          expect(reads(before)).toEqual(rereads ? ["/kept"] : []);
          expect(screen.getByText("keep.txt")).toBeTruthy();
          expect(screen.queryByText(lost)).toBeNull();
        }
      }
    } finally {
      restore();
    }
  });
});

describe("FileExplorer paste while typing a name", () => {
  let errors: unknown[] = [];
  const onError = (e: ErrorEvent) => errors.push(e.error);
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
  beforeEach(() => {
    errors = [];
    window.addEventListener("error", onError);
  });
  afterEach(() => {
    vi.useRealTimers();
    window.removeEventListener("error", onError);
  });

  it.each([
    {
      name: "a new file",
      begin: () => fireEvent.click(screen.getByTitle("New file")),
    },
    {
      name: "a rename of f.txt",
      begin: () => fireEvent.doubleClick(screen.getByText("f.txt")),
    },
  ])(
    "offers no context-menu Paste on a right-click while typing $name",
    async ({ begin }) => {
      const restore = rowsInView();
      try {
        serve({
          fs_read_dir: () =>
            Promise.resolve([
              {
                name: "f.txt",
                kind: "file",
                size: 0,
                mtime: 0,
                gitignored: false,
              },
            ]),
          fs_clipboard_paths: () =>
            Promise.resolve({ paths: ["/x/f.txt"], unresolved: 0 }),
        });
        render(explorer("/typing"));
        expect(await screen.findByText("f.txt")).toBeTruthy();
        vi.useFakeTimers();
        begin();
        await advance(50);
        fireEvent.contextMenu(treeArea());
        const item = screen.getByText("Paste").closest("[role='menuitem']");
        expect(item?.getAttribute("aria-disabled")).toBe("true");
        // Past the input's 170 ms tick, whose refocus once fought the menu's focus trap.
        await advance(200);
        expect(errors).toEqual([]);
        expect(document.activeElement?.closest("[role='menu']")).toBeTruthy();
        if (item) fireEvent.click(item);
        await advance(10);
        expect(commands()).not.toContain("fs_clipboard_paths");
        fireEvent.keyDown(document.activeElement ?? document.body, {
          key: "Escape",
        });
        await advance(10);
        expect(screen.queryByText("Paste")).toBeNull();
        const input = screen.getByRole("textbox");
        expect(document.activeElement).toBe(input);
        fireEvent.keyDown(input, { key: "Escape" });
        await advance(10);
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(screen.getByText("f.txt")).toBeTruthy();
        expect(errors).toEqual([]);
      } finally {
        restore();
      }
    },
  );

  it("keeps a typed new name when a right-click blurs the settled input", async () => {
    serve({});
    vi.useFakeTimers();
    render(explorer("/typing"));
    await advance(10);
    fireEvent.click(screen.getByTitle("New file"));
    await advance(200);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "n.txt" },
    });
    fireEvent.contextMenu(treeArea());
    await advance(50);
    expect(errors).toEqual([]);
    expect(invoke).toHaveBeenCalledWith("fs_create_file", {
      path: "/typing/n.txt",
      workspace: LOCAL,
    });
  });
});
