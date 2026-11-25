// @vitest-environment jsdom
import type { WorkspaceEnv } from "@/modules/workspace";
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

const { invoke, env, toast } = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(),
  env: { current: { kind: "local" } as WorkspaceEnv },
  toast: { message: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: () => Promise.resolve(() => {}),
  }),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(() => Promise.resolve()),
  revealItemInDir: vi.fn(() => Promise.resolve()),
}));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/platform", () => ({ IS_MAC: true }));
vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => env.current,
  useWorkspaceEnvStore: (select: (s: { env: WorkspaceEnv }) => unknown) =>
    select({ env: env.current }),
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
// Pass-through spies: the real functions run, the spies show the menu goes
// through the same two functions as the header button.
vi.mock(
  "@/modules/preview-server/lib/openInBrowser",
  async (importOriginal) => {
    const real =
      await importOriginal<
        typeof import("@/modules/preview-server/lib/openInBrowser")
      >();
    return { openInBrowser: vi.fn(real.openInBrowser) };
  },
);
vi.mock(
  "@/modules/preview-server/lib/browserOpenable",
  async (importOriginal) => {
    const real =
      await importOriginal<
        typeof import("@/modules/preview-server/lib/browserOpenable")
      >();
    return { ...real, browserOpenable: vi.fn(real.browserOpenable) };
  },
);

import { browserOpenable } from "@/modules/preview-server/lib/browserOpenable";
import { openInBrowser } from "@/modules/preview-server/lib/openInBrowser";
import { FileExplorer } from "./FileExplorer";

const entry = (name: string, kind: "dir" | "file") => ({
  name,
  kind,
  size: 0,
  mtime: 0,
  gitignored: false,
});

function serve() {
  invoke.mockImplementation((cmd: string, args?: unknown) => {
    if (cmd === "fs_read_dir")
      return Promise.resolve(
        (args as { path: string }).path === "/w"
          ? [
              entry("sub", "dir"),
              entry("pages.html", "dir"),
              entry("notes.txt", "file"),
              entry("report.html", "file"),
            ]
          : [],
      );
    if (cmd === "preview_open_in_browser")
      return Promise.resolve({ status: "opened", reason: null });
    return Promise.resolve(undefined);
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

async function settle() {
  await act(() => new Promise<void>((done) => setTimeout(done, 0)));
}

async function menuFor(row: string): Promise<string[]> {
  fireEvent.contextMenu(await screen.findByText(row));
  await screen.findByText("Reveal in Finder");
  return screen.getAllByRole("menuitem").map((el) => el.textContent ?? "");
}

async function closeMenu() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await settle();
}

let restore: () => void;
beforeEach(() => {
  restore = rowsInView();
  env.current = { kind: "local" };
  invoke.mockReset();
  toast.error.mockReset();
  vi.mocked(openInBrowser).mockClear();
  vi.mocked(browserOpenable).mockClear();
  serve();
});
afterEach(() => {
  cleanup();
  restore();
});

function opens(): unknown[] {
  return invoke.mock.calls.filter(([cmd]) => cmd === "preview_open_in_browser");
}

describe("FileExplorer Open in Browser", () => {
  it("[AC-6] report.html shows it right under Open with Default App (shown); choosing it opens once", async () => {
    render(<FileExplorer rootPath="/w" onOpenFile={() => {}} />);
    const items = await menuFor("report.html");
    const at = items.indexOf("Open with Default App");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(items[at + 1]).toBe("Open in Browser");

    await act(async () => {
      fireEvent.click(screen.getByText("Open in Browser"));
    });
    await settle();
    expect(opens()).toEqual([
      [
        "preview_open_in_browser",
        { path: "/w/report.html", workspace: { kind: "local" } },
      ],
    ]);
    expect(openInBrowser).toHaveBeenCalledExactlyOnceWith("/w/report.html", {
      kind: "local",
    });
    expect(browserOpenable).toHaveBeenCalledWith("/w/report.html", {
      kind: "local",
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("[AC-6] notes.txt and the folder sub have no Open in Browser (absent)", async () => {
    render(<FileExplorer rootPath="/w" onOpenFile={() => {}} />);
    expect(await menuFor("notes.txt")).not.toContain("Open in Browser");
    await closeMenu();
    expect(await menuFor("sub")).not.toContain("Open in Browser");
    await closeMenu();
    // A folder is never offered, even when its name looks like a page.
    expect(await menuFor("pages.html")).not.toContain("Open in Browser");
    expect(opens()).toEqual([]);
  });

  it("[AC-6] in a WSL workspace report.html has no Open in Browser", async () => {
    env.current = { kind: "wsl", distro: "Ubuntu" };
    render(<FileExplorer rootPath="/w" onOpenFile={() => {}} />);
    const items = await menuFor("report.html");
    expect(items).toContain("Open with Default App");
    expect(items).not.toContain("Open in Browser");
  });

  it("[AC-6] the entry follows browserOpenable, not a list of its own", async () => {
    vi.mocked(browserOpenable).mockImplementation((path) =>
      path.endsWith(".txt"),
    );
    try {
      render(<FileExplorer rootPath="/w" onOpenFile={() => {}} />);
      expect(await menuFor("notes.txt")).toContain("Open in Browser");
      await closeMenu();
      expect(await menuFor("report.html")).not.toContain("Open in Browser");
    } finally {
      const real = await vi.importActual<
        typeof import("@/modules/preview-server/lib/browserOpenable")
      >("@/modules/preview-server/lib/browserOpenable");
      vi.mocked(browserOpenable).mockImplementation(real.browserOpenable);
    }
  });
});
