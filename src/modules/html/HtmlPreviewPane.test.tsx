// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HtmlTab } from "@/modules/tabs/lib/useTabs";
import type { WorkspaceEnv } from "@/modules/workspace";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, convertFileSrc, toast } = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(),
  convertFileSrc: vi.fn(
    (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  ),
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    message: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke, convertFileSrc }));
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

import { serializeTabs } from "@/modules/spaces/lib/serialize";
import { isInsideHorizontalScroller } from "@/modules/tabs/lib/tabSwipe";
import { useZenStore } from "@/modules/zen/lib/zenStore";
import { HtmlPreviewPane } from "./HtmlPreviewPane";

const LOCAL: WorkspaceEnv = { kind: "local" };
const SSH: WorkspaceEnv = { kind: "ssh", host: "devbox" };
const WSL: WorkspaceEnv = { kind: "wsl", distro: "Ubuntu" };
const FRAME_URL = "http://127.0.0.1:5000/T/a.html";

// The sandbox constants as the source declares them, read independently of
// what the component renders.
const PANE_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "HtmlPreviewPane.tsx"),
  "utf8",
);
function declared(name: string): string {
  const m = new RegExp(`const ${name} = "([^"]*)";`).exec(PANE_SRC);
  if (!m) throw new Error(`${name} not declared`);
  return m[1];
}
const LOCAL_SANDBOX = declared("LOCAL_SANDBOX");
const REMOTE_SANDBOX = declared("REMOTE_SANDBOX");

type Handler = (args: Record<string, unknown>) => Promise<unknown>;

function serve(handlers: Record<string, Handler>) {
  invoke.mockImplementation((cmd: string, args?: unknown) => {
    const handler = handlers[cmd];
    if (!handler) return Promise.reject(`unexpected command ${cmd}`);
    return handler((args ?? {}) as Record<string, unknown>);
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function callsOf(cmd: string, path?: string) {
  return invoke.mock.calls.filter(
    ([c, a]) =>
      c === cmd &&
      (path === undefined ||
        (a as { path?: string } | undefined)?.path === path),
  );
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

function pane(
  path: string,
  workspace: WorkspaceEnv | undefined,
  opts: { visible?: boolean; onSetView?: (m: "rendered" | "raw") => void } = {},
) {
  return render(
    <HtmlPreviewPane
      path={path}
      workspace={workspace}
      visible={opts.visible ?? true}
      onSetView={opts.onSetView ?? (() => {})}
    />,
  );
}

function reloadButton(root: HTMLElement): HTMLButtonElement {
  const b = root.querySelector<HTMLButtonElement>('button[title="Reload"]');
  if (!b) throw new Error("no Reload button");
  return b;
}

function frame(root: HTMLElement): HTMLIFrameElement {
  const f = root.querySelector("iframe");
  if (!f) throw new Error("no frame");
  return f;
}

const ready = () =>
  Promise.resolve({ status: "ready", url: FRAME_URL, reason: null });

beforeEach(() => {
  invoke.mockReset();
  convertFileSrc.mockClear();
  for (const fn of [
    toast,
    toast.error,
    toast.message,
    toast.warning,
    toast.info,
    toast.success,
  ])
    fn.mockReset();
  useZenStore.setState({ on: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useZenStore.setState({ on: false });
});

describe("HtmlPreviewPane reload", () => {
  it("[AC-9] WSL: Reload is loading until fs_read_file answers, then shows v2 without a tab switch", async () => {
    const second = deferred<unknown>();
    let reads = 0;
    serve({
      fs_read_file: () => {
        reads += 1;
        return reads === 1
          ? Promise.resolve({ kind: "text", content: "<p>v1</p>", size: 9 })
          : second.promise;
      },
    });
    const onSetView = vi.fn();
    const { container } = pane("/p/a.html", WSL, { onSetView });
    await settle();
    expect(frame(container).getAttribute("srcdoc")).toContain("v1");
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("false");

    fireEvent.click(reloadButton(container));
    await settle();
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      second.resolve({ kind: "text", content: "<p>v2</p>", size: 9 });
    });
    await settle();
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("false");
    expect(callsOf("fs_read_file")).toHaveLength(2);
    expect(frame(container).getAttribute("srcdoc")).toContain("v2");
    expect(onSetView).not.toHaveBeenCalled();
    expect(callsOf("preview_frame_source")).toHaveLength(0);
  });

  it("[AC-9] WSL: a failed reload also ends loading", async () => {
    let reads = 0;
    serve({
      fs_read_file: () => {
        reads += 1;
        return reads === 1
          ? Promise.resolve({ kind: "text", content: "v1", size: 2 })
          : Promise.reject("gone");
      },
    });
    const { container } = pane("/p/a.html", WSL);
    await settle();
    fireEvent.click(reloadButton(container));
    await settle();
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("false");
    expect(container.textContent).toContain("Failed to read file: gone");
  });

  it("[AC-9] local built-in way: Reload re-authorizes, loads a new asset URL and is loading until its load event", async () => {
    serve({
      preview_frame_source: () =>
        Promise.resolve({ status: "unsupported", url: null, reason: null }),
      asset_allow: () => Promise.resolve(null),
    });
    const { container } = pane("/p/a.html", LOCAL);
    await settle();
    const first = frame(container);
    const firstSrc = first.getAttribute("src");

    fireEvent.click(reloadButton(container));
    await settle();
    const second = frame(container);
    expect(second.getAttribute("src")).not.toBe(firstSrc);
    expect(
      second.getAttribute("src")?.startsWith(convertFileSrc("/p/a.html")),
    ).toBe(true);
    expect(callsOf("asset_allow")).toHaveLength(2);
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("true");

    fireEvent.load(second);
    expect(reloadButton(container).getAttribute("aria-busy")).toBe("false");
  });
});

describe("HtmlPreviewPane through the preview server", () => {
  it("[AC-13] local and SSH load the server address; a refused file loads the built-in way", async () => {
    serve({
      preview_frame_source: (args) =>
        Promise.resolve(
          args.path === "/p/big.html"
            ? { status: "too_large", url: null, reason: null }
            : { status: "ready", url: FRAME_URL, reason: null },
        ),
      asset_allow: () => Promise.resolve(null),
      fs_read_file: () =>
        Promise.resolve({ kind: "text", content: "x", size: 1 }),
    });
    const local = pane("/p/a.html", LOCAL);
    const remote = pane("/srv/p/b.html", SSH);
    const big = pane("/p/big.html", LOCAL);
    await settle();

    for (const [view, path, sandbox] of [
      [local, "/p/a.html", LOCAL_SANDBOX],
      [remote, "/srv/p/b.html", REMOTE_SANDBOX],
    ] as const) {
      const f = frame(view.container);
      expect(f.getAttribute("src")).toBe(FRAME_URL);
      expect(f.getAttribute("sandbox")).toBe(sandbox);
      expect(f.getAttribute("sandbox")).not.toContain("allow-same-origin");
      expect(f.hasAttribute("srcdoc")).toBe(false);
      expect(callsOf("asset_allow", path)).toHaveLength(0);
      expect(callsOf("fs_read_file", path)).toHaveLength(0);
    }
    expect(callsOf("preview_frame_source", "/p/a.html")[0]?.[1]).toEqual({
      path: "/p/a.html",
      workspace: LOCAL,
    });
    expect(callsOf("preview_frame_source", "/srv/p/b.html")[0]?.[1]).toEqual({
      path: "/srv/p/b.html",
      workspace: SSH,
    });

    expect(callsOf("asset_allow", "/p/big.html").map(([, a]) => a)).toEqual([
      { path: "/p/big.html", directory: true },
    ]);
    const bigSrc = frame(big.container).getAttribute("src") ?? "";
    expect(bigSrc.startsWith(`${convertFileSrc("/p/big.html")}?v=`)).toBe(true);

    for (const view of [local, remote, big]) {
      expect(
        view.container.querySelector('button[title="Open in Browser"]'),
      ).not.toBeNull();
    }
  });

  it("[AC-13] SSH: a server refusal loads the source as srcDoc", async () => {
    serve({
      preview_frame_source: () =>
        Promise.resolve({
          status: "unreachable",
          url: null,
          reason: "timed out",
        }),
      fs_read_file: () =>
        Promise.resolve({ kind: "text", content: "<p>s</p>", size: 8 }),
    });
    const { container } = pane("/srv/p/b.html", SSH);
    await settle();
    const f = frame(container);
    expect(f.getAttribute("srcdoc")).toContain("<p>s</p>");
    expect(f.hasAttribute("src")).toBe(false);
    expect(f.getAttribute("sandbox")).toBe(REMOTE_SANDBOX);
  });

  it.each([
    ["local", LOCAL, "/p/a.html"],
    ["SSH", SSH, "/srv/p/b.html"],
  ] as const)(
    "[AC-14] %s: Reload builds a new frame with the same address, loading until its load event",
    async (_, workspace, path) => {
      serve({ preview_frame_source: ready });
      const { container } = pane(path, workspace);
      await settle();
      const a = frame(container);
      fireEvent.load(a);

      fireEvent.click(reloadButton(container));
      await settle();
      const b = frame(container);
      expect(b).not.toBe(a);
      expect(a.isConnected).toBe(false);
      expect(b.getAttribute("src")).toBe(FRAME_URL);
      expect(reloadButton(container).getAttribute("aria-busy")).toBe("true");

      fireEvent.load(b);
      expect(reloadButton(container).getAttribute("aria-busy")).toBe("false");
      expect(callsOf("preview_frame_source")).toHaveLength(1);
    },
  );
});

describe("HtmlPreviewPane element", () => {
  it("[AC-16] the visible pane opts out of tab swipes, header included", async () => {
    serve({ preview_frame_source: ready });
    const { container } = pane("/p/a.html", LOCAL, { visible: true });
    await settle();
    const root = container.firstElementChild as HTMLElement;
    expect(root.hasAttribute("data-no-tab-swipe")).toBe(true);
    const header = root.querySelector("[data-preview-header]");
    expect(header).not.toBeNull();
    // A real hovered element inside the pane, through the real swipe check.
    expect(isInsideHorizontalScroller(frame(container), null, 1)).toBe(true);
    expect(isInsideHorizontalScroller(header, null, -1)).toBe(true);
  });

  it("[AC-16] a hidden pane does not opt out", async () => {
    serve({ preview_frame_source: ready });
    const { container } = pane("/p/a.html", LOCAL, { visible: false });
    await settle();
    const root = container.firstElementChild as HTMLElement;
    expect(root.hasAttribute("data-no-tab-swipe")).toBe(false);
    expect(isInsideHorizontalScroller(frame(container), null, 1)).toBe(false);
  });

  it("[AC-18] the frame has border and corners outside zen, none in zen; the header stays", async () => {
    serve({ preview_frame_source: ready });
    const { container } = pane("/p/a.html", LOCAL);
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
    expect(root.querySelector("[data-preview-header]")).not.toBeNull();
    expect(
      root.querySelector('button[aria-label="Toggle zen mode"]'),
    ).not.toBeNull();
  });
});

describe("HtmlPreviewPane keeps the frame address to itself", () => {
  // The address, its host and port, or the secret segment `T` on its own.
  const LEAKS = [
    FRAME_URL,
    "127.0.0.1:5000",
    /(^|[^A-Za-z0-9])T([^A-Za-z0-9]|$)/,
  ];

  function leaked(texts: string[]): string[] {
    return texts.filter((t) =>
      LEAKS.some((l) => (typeof l === "string" ? t.includes(l) : l.test(t))),
    );
  }

  it("[AC-21] neither console, toast nor the saved tab carries the address", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (m) => vi.spyOn(console, m).mockImplementation(() => {}),
    );
    serve({
      preview_frame_source: (args) =>
        args.path === "/p/c.html" ? Promise.reject("task aborted") : ready(),
      asset_allow: () => Promise.resolve(null),
      preview_open_in_browser: () =>
        Promise.resolve({ status: "too_large", reason: null }),
    });

    const first = pane("/p/a.html", LOCAL);
    await settle();
    expect(frame(first.container).getAttribute("src")).toBe(FRAME_URL);
    fireEvent.click(reloadButton(first.container));
    await settle();
    fireEvent.load(frame(first.container));
    const open = first.container.querySelector<HTMLButtonElement>(
      'button[title="Open in Browser"]',
    );
    if (!open) throw new Error("no Open in Browser");
    await act(async () => {
      fireEvent.click(open);
    });
    await settle();

    const second = pane("/p/c.html", LOCAL);
    await settle();
    expect(callsOf("asset_allow", "/p/c.html")).toHaveLength(1);
    expect(
      frame(second.container).getAttribute("src")?.startsWith("asset://"),
    ).toBe(true);

    const toastMocks = [
      toast,
      toast.error,
      toast.message,
      toast.warning,
      toast.info,
      toast.success,
    ];
    const said = [...spies, ...toastMocks].flatMap((fn) =>
      fn.mock.calls.map((args) => args.map(String).join(" ")),
    );
    // Something was said (the toast and the failed call's log), none of it leaks.
    expect(toast.error).toHaveBeenCalledOnce();
    expect(said.length).toBeGreaterThan(1);
    expect(leaked(said)).toEqual([]);

    const tabs: HtmlTab[] = [
      {
        id: 1,
        kind: "html",
        spaceId: "s",
        title: "a.html",
        path: "/p/a.html",
        workspace: LOCAL,
      },
      {
        id: 2,
        kind: "html",
        spaceId: "s",
        title: "b.html",
        path: "/srv/p/b.html",
        workspace: SSH,
      },
    ];
    const saved = JSON.stringify(serializeTabs(tabs));
    expect(saved).toContain('"path":"/p/a.html"');
    expect(saved).toContain('"path":"/srv/p/b.html"');
    expect(saved).toContain('"workspace":{"kind":"ssh","host":"devbox"}');
    expect(saved).not.toContain("127.0.0.1");
    expect(leaked([saved])).toEqual([]);
  });
});
