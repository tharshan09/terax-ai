// GUARD: The remote browser notice is confirmed per server (workspaceScopeKey) in the settings store through writePref, never in localStorage or memory, Cancel writes nothing, and the confirmation survives a reloaded store.
// DISPOSITION: specs/2026-11-20-ssh-remote-workflow/wave-3/slop-dispositions.md
// RULE: --
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserView, PortForward } from "@/modules/ports/lib/ports";
import type { WorkspaceEnv } from "@/modules/workspace";

const { invoke, openUrl, disk, writes } = vi.hoisted(() => ({
  invoke: vi.fn(),
  openUrl: vi.fn(),
  // The settings file on disk; each store instance reads it when created.
  disk: new Map<string, unknown>(),
  writes: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));
vi.mock("@/lib/platform", () => ({ IS_MAC: true, IS_WINDOWS: false }));
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    private mem = new Map(disk);
    get = vi.fn(async (key: string) => this.mem.get(key));
    entries = vi.fn(async () => [...this.mem.entries()]);
    set = vi.fn(async (key: string, value: unknown) => {
      writes(key, value);
      this.mem.set(key, value);
    });
    save = vi.fn(async () => {
      disk.clear();
      for (const [k, v] of this.mem) disk.set(k, v);
    });
    delete = vi.fn(async (key: string) => {
      writes(key);
      this.mem.delete(key);
    });
    onKeyChange = vi.fn(async () => () => {});
    onChange = vi.fn(async () => () => {});
  },
}));

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const DEVBOX: WorkspaceEnv = { kind: "ssh", host: "devbox", label: "devbox" };
const OTHER: WorkspaceEnv = { kind: "ssh", host: "other", label: "other" };
const FORWARD: PortForward = {
  remotePort: 9222,
  localPort: 9223,
  status: "active",
};
const OPENED: BrowserView = {
  status: "opened",
  remotePort: 9222,
  localPort: 9223,
  reason: null,
};

// A new app start: every module and the store instance are loaded again.
async function boot() {
  vi.resetModules();
  const store = await import("@/modules/ports/lib/portsStore");
  const settings = await import("@/modules/settings/store");
  const workspace = await import("@/modules/workspace");
  store.configurePorts({ openPreview: () => {} });
  return { store, settings, workspace };
}

type App = Awaited<ReturnType<typeof boot>>;

function settle() {
  return new Promise((r) => setTimeout(r, 0));
}

// Forwards and probes the way a session does, so the store sees all of it.
async function forwardChrome(app: App, env: WorkspaceEnv) {
  app.workspace.useWorkspaceEnvStore.setState({ env });
  await app.store.forwardPortInput(env, "9222");
  await settle();
}

beforeEach(() => {
  disk.clear();
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "ssh_port_forward") return FORWARD;
    if (cmd === "ssh_port_list") return [FORWARD];
    if (cmd === "ssh_port_chrome") return true;
    if (cmd === "ssh_port_view_browser") return OPENED;
    throw new Error(`unexpected ${cmd}`);
  });
  openUrl.mockResolvedValue(undefined);
});

function views() {
  return invoke.mock.calls.filter(([cmd]) => cmd === "ssh_port_view_browser");
}

afterEach(() => {
  invoke.mockReset();
  openUrl.mockReset();
  writes.mockReset();
});

describe("remote browser notice", () => {
  it("is kept per server in the settings store and survives a reloaded store", async () => {
    let app = await boot();
    await forwardChrome(app, DEVBOX);

    const cancelled = app.store.viewBrowser(DEVBOX, 9222);
    await settle();
    expect(app.store.useBrowserViewStore.getState().dialog).toMatchObject({
      kind: "notice",
      scope: "ssh:devbox",
    });
    app.store.answerBrowserNotice(false);
    await cancelled;
    expect(writes).not.toHaveBeenCalled();
    expect(views()).toHaveLength(0);

    const confirmed = app.store.viewBrowser(DEVBOX, 9222);
    await settle();
    app.store.answerBrowserNotice(true);
    await confirmed;
    expect(writes.mock.calls).toEqual([
      ["browserNoticeConfirmed", ["ssh:devbox"]],
    ]);
    expect(views()).toHaveLength(1);

    app = await boot();
    expect(await app.settings.browserNoticeConfirmed("ssh:devbox")).toBe(true);
    expect(await app.settings.browserNoticeConfirmed("ssh:other")).toBe(false);
    await forwardChrome(app, DEVBOX);
    await app.store.viewBrowser(DEVBOX, 9222);
    expect(app.store.useBrowserViewStore.getState().dialog).toBeNull();
    expect(views()).toHaveLength(2);

    await forwardChrome(app, OTHER);
    void app.store.viewBrowser(OTHER, 9222);
    await settle();
    expect(app.store.useBrowserViewStore.getState().dialog).toMatchObject({
      kind: "notice",
      scope: "ssh:other",
    });
    app.store.answerBrowserNotice(false);

    expect([...disk.keys()]).toEqual(["browserNoticeConfirmed"]);
  });

  it("is written only through writePref under the workspace scope key", () => {
    const settings = readFileSync(
      join(ROOT, "modules/settings/store.ts"),
      "utf8",
    );
    expect(settings).toMatch(
      /const KEY_BROWSER_NOTICE_CONFIRMED = "browserNoticeConfirmed";/,
    );
    expect(settings).toMatch(
      /await writePref\(KEY_BROWSER_NOTICE_CONFIRMED, \[\.\.\.scopes, scope\]\);/,
    );
    expect(
      settings.match(/KEY_BROWSER_NOTICE_CONFIRMED/g)?.length,
      "the key is read once and written once",
    ).toBe(3);

    const store = readFileSync(
      join(ROOT, "modules/ports/lib/portsStore.ts"),
      "utf8",
    );
    expect(store).toMatch(
      /import \{\s*browserNoticeConfirmed,\s*confirmBrowserNotice,\s*\} from "@\/modules\/settings\/store";/,
    );
    expect(store).toMatch(/browserNoticeConfirmed\(scope\)/);
    expect(store).toMatch(/confirmBrowserNotice\(scope\)/);
    expect(store).toMatch(/const scope = workspaceScopeKey\(ssh\);/);

    const ports = join(ROOT, "modules/ports");
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const path = join(dir, e.name);
        if (e.isDirectory()) return sources(path);
        return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
          ? [path]
          : [];
      });
    for (const file of sources(ports))
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /localStorage|sessionStorage|indexedDB/,
      );
  });
});
