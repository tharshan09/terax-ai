// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PORTS, type PortForward } from "@/modules/ports/lib/ports";
import { usePortsStore } from "@/modules/ports/lib/portsStore";
import {
  normalizeUrl,
  PreviewAddressBar,
} from "@/modules/preview/PreviewAddressBar";
import {
  LOCAL_WORKSPACE,
  useWorkspaceEnvStore,
  type WorkspaceEnv,
} from "@/modules/workspace";

// Radix measures its popper; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const { invoke, openUrl } = vi.hoisted(() => ({
  invoke: vi.fn(),
  openUrl: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));
vi.mock("@/lib/platform", () => ({ IS_WINDOWS: false }));
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    get = vi.fn(async () => undefined);
    set = vi.fn();
    save = vi.fn();
    delete = vi.fn();
    onKeyChange = vi.fn(async () => () => {});
    onChange = vi.fn(async () => () => {});
  },
}));

const DEVBOX: WorkspaceEnv = { kind: "ssh", host: "devbox", label: "devbox" };
const SCOPE = "ssh:devbox";

function forwards(list: PortForward[]): void {
  usePortsStore.setState(
    { ...EMPTY_PORTS, forwards: list.length > 0 ? { [SCOPE]: list } : {} },
    true,
  );
}

const onSubmit = vi.fn();
const onReload = vi.fn();
const fetchSpy = vi.fn(async () => ({}) as Response);

async function openMenu(url = "") {
  render(
    <PreviewAddressBar url={url} onSubmit={onSubmit} onReload={onReload} />,
  );
  await act(async () => {
    fireEvent.keyDown(screen.getByTitle(/ports$/i), { key: "Enter" });
  });
  return screen.getByTestId("preview-ports-menu");
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  onSubmit.mockReset();
  onReload.mockReset();
  fetchSpy.mockClear();
  invoke.mockReset();
  usePortsStore.setState(EMPTY_PORTS, true);
  useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
});

describe("preview ports menu", () => {
  it("lists only the server's active forwards and loads one without a probe", async () => {
    useWorkspaceEnvStore.setState({ env: DEVBOX });
    forwards([
      { remotePort: 3000, localPort: 3000, status: "active" },
      { remotePort: 8080, localPort: 8080, status: "disconnected" },
      { remotePort: 9222, localPort: 9223, status: "active" },
    ]);
    const menu = await openMenu();
    expect(menu.dataset.status).toBe("remote-list");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual([
      "3000 -> localhost:3000",
      "9222 -> localhost:9223",
    ]);
    await act(async () => {
      fireEvent.click(items[1]);
    });
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith("http://localhost:9223");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("says so when the server has no forwarded ports", async () => {
    useWorkspaceEnvStore.setState({ env: DEVBOX });
    forwards([{ remotePort: 8080, localPort: 8080, status: "disconnected" }]);
    const menu = await openMenu();
    expect(menu.dataset.status).toBe("remote-empty");
    expect(menu.textContent).toBe("No forwarded ports.");
    expect(screen.queryAllByRole("menuitem")).toEqual([]);
  });

  it("keeps the fixed dev-server presets in a local workspace", async () => {
    forwards([{ remotePort: 3000, localPort: 3000, status: "active" }]);
    const menu = await openMenu();
    expect(menu.dataset.status).toBe("local");
    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(16);
    expect(items[0].textContent).toBe("Vite:5173");
  });
});

describe("normalizeUrl", () => {
  it("adds http to local hosts, the preview's loopback variant included", () => {
    expect(normalizeUrl("localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeUrl("127.0.0.1:8080/x")).toBe("http://127.0.0.1:8080/x");
    expect(normalizeUrl("0.0.0.0:3000")).toBe("http://0.0.0.0:3000");
    expect(normalizeUrl("192.168.1.5:3000")).toBe("http://192.168.1.5:3000");
    expect(normalizeUrl("app.localhost:3000")).toBe(
      "http://app.localhost:3000",
    );
    expect(normalizeUrl("[::1]:3000")).toBe("http://[::1]:3000");
  });

  it("keeps the other cases as before", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
    expect(normalizeUrl("docs.example.com/a?b=1")).toBe(
      "https://docs.example.com/a?b=1",
    );
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("HTTP://localhost:3000")).toBe("HTTP://localhost:3000");
    expect(normalizeUrl("  http://localhost:5173/  ")).toBe(
      "http://localhost:5173/",
    );
    expect(normalizeUrl("foo")).toBe("foo");
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("   ")).toBeNull();
  });
});
