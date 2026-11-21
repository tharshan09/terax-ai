import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PORTS, type PortForward } from "@/modules/ports/lib/ports";
import { refreshForwards, usePortsStore } from "@/modules/ports/lib/portsStore";
import { paneExited, routePaneBytes } from "@/modules/terminal/lib/paneOutput";
import type { WorkspaceEnv } from "@/modules/workspace";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));
vi.mock("@/lib/platform", () => ({ IS_MAC: false, IS_WINDOWS: false }));
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

const DEVBOX: WorkspaceEnv = { kind: "ssh", host: "devbox" };
const OTHER: WorkspaceEnv = { kind: "ssh", host: "other" };
const LOCAL: WorkspaceEnv = { kind: "local" };
const bytes = new TextEncoder().encode("  Local: http://localhost:5173/\r\n");

function offers() {
  return usePortsStore.getState().offers.map((o) => [o.leafId, o.port]);
}

function listCalls() {
  return invoke.mock.calls.filter(([cmd]) => cmd === "ssh_port_list");
}

let forwards: PortForward[] = [];

beforeEach(() => {
  invoke.mockReset();
  forwards = [];
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "ssh_port_list") return forwards;
    throw new Error(`unexpected ${cmd}`);
  });
  usePortsStore.setState(EMPTY_PORTS, true);
});

describe("routePaneBytes", () => {
  it("feeds detection for a pane without a renderer slot and keeps the bytes in its ring", () => {
    const ring = { push: vi.fn() };
    routePaneBytes(7, DEVBOX, null, ring, bytes);
    expect(ring.push).toHaveBeenCalledExactlyOnceWith(bytes);
    expect(offers()).toEqual([[7, 5173]]);
  });

  it("feeds detection for a pane with a live grid and writes there instead", () => {
    const grid = { write: vi.fn() };
    const ring = { push: vi.fn() };
    routePaneBytes(8, DEVBOX, grid, ring, bytes);
    expect(grid.write).toHaveBeenCalledExactlyOnceWith(bytes);
    expect(ring.push).not.toHaveBeenCalled();
    expect(offers()).toEqual([[8, 5173]]);
  });

  it("detects by the env the pane was spawned on", () => {
    routePaneBytes(9, LOCAL, null, { push: vi.fn() }, bytes);
    routePaneBytes(10, null, null, { push: vi.fn() }, bytes);
    expect(offers()).toEqual([]);
  });
});

describe("paneExited", () => {
  it("asks for liveness exactly once when the pane's server has forwards", async () => {
    forwards = [{ remotePort: 3000, localPort: 3000, status: "active" }];
    await refreshForwards(DEVBOX);
    invoke.mockClear();

    paneExited(DEVBOX);
    expect(listCalls()).toEqual([["ssh_port_list", { host: "devbox" }]]);
  });

  it("asks nothing for a server without forwards or a local pane", () => {
    paneExited(OTHER);
    paneExited(LOCAL);
    paneExited(null);
    expect(invoke).not.toHaveBeenCalled();
  });
});
