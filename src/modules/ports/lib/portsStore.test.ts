import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_PORTS,
  type PortForward,
  offerView,
  portPhase,
  portsSummary,
  rowViews,
} from "@/modules/ports/lib/ports";
import type { WorkspaceEnv } from "@/modules/workspace";

const { invoke, toast, storeWrites, platform } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  storeWrites: vi.fn(),
  platform: { IS_WINDOWS: false },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/platform", () => platform);
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    get = vi.fn(async () => undefined);
    set = storeWrites;
    save = storeWrites;
    delete = storeWrites;
    onKeyChange = vi.fn(async () => () => {});
    onChange = vi.fn(async () => () => {});
  },
}));

const DEVBOX: WorkspaceEnv = { kind: "ssh", host: "devbox", label: "devbox" };
const OTHER: WorkspaceEnv = { kind: "ssh", host: "other" };
const LOCAL: WorkspaceEnv = { kind: "local" };
const SCOPE = "ssh:devbox";

const enc = new TextEncoder();
const openPreview = vi.fn();

type Handler = (args: Record<string, unknown>) => unknown;
const handlers = new Map<string, Handler>();

function serve(cmd: string, handler: Handler): void {
  handlers.set(cmd, handler);
}

function calls(cmd: string) {
  return invoke.mock.calls.filter(([c]) => c === cmd);
}

function active(remotePort: number, localPort = remotePort): PortForward {
  return { remotePort, localPort, status: "active" };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function fresh() {
  vi.resetModules();
  const store = await import("@/modules/ports/lib/portsStore");
  store.configurePorts({ openPreview });
  return store;
}

type Store = Awaited<ReturnType<typeof fresh>>;

function feed(s: Store, leafId: number, env: WorkspaceEnv, text: string) {
  s.feedPaneOutput(leafId, env, enc.encode(text));
}

function offers(s: Store) {
  return s.usePortsStore.getState().offers.map((o) => [o.leafId, o.port]);
}

async function seed(s: Store, env: WorkspaceEnv, list: PortForward[]) {
  serve("ssh_port_list", () => list);
  await s.refreshForwards(env);
  invoke.mockClear();
}

beforeEach(() => {
  vi.resetAllMocks();
  handlers.clear();
  platform.IS_WINDOWS = false;
  invoke.mockImplementation(
    async (cmd: string, args: Record<string, unknown>) => {
      const handler = handlers.get(cmd);
      if (!handler) throw new Error(`unexpected ${cmd}`);
      return handler(args);
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("detection and offers", () => {
  it("offers a port once per pane through chunk splits and repaints, and never twice after dismissal", async () => {
    const s = await fresh();
    await seed(s, DEVBOX, [active(3000)]);
    feed(s, 7, DEVBOX, "  Local: http://local");
    feed(s, 7, DEVBOX, "host:5173/\r\n");
    for (let i = 0; i < 50; i++)
      feed(
        s,
        7,
        DEVBOX,
        "\x1b[2K\x1b[1G  Local: \x1b[36mhttp://localhost:5173/\x1b[0m\r\n",
      );
    expect(offers(s)).toEqual([[7, 5173]]);

    s.dismissOffer(DEVBOX);
    expect(offers(s)).toEqual([]);

    feed(s, 7, DEVBOX, "localhost:5173\r\n");
    feed(s, 8, DEVBOX, "localhost:5173\r\n");
    feed(s, 9, LOCAL, "localhost:5173\r\n");
    feed(s, 8, DEVBOX, "localhost:3000\r\n");
    expect(offers(s)).toEqual([[8, 5173]]);

    s.paneClosed(8);
    expect(offers(s)).toEqual([]);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("detects nothing on Windows, where forwards do not exist", async () => {
    platform.IS_WINDOWS = true;
    const s = await fresh();
    feed(s, 7, DEVBOX, "localhost:5173\r\n");
    expect(offers(s)).toEqual([]);
  });

  it("shows the newest offer of the active server with +N", async () => {
    const s = await fresh();
    feed(s, 7, DEVBOX, "localhost:3000\r\n");
    feed(s, 7, DEVBOX, "localhost:5173\r\n");
    feed(s, 1, OTHER, "localhost:4000\r\n");
    const m = () => s.usePortsStore.getState();
    expect(offerView(m(), s.portsScope(DEVBOX))).toMatchObject({
      label: "Forward port 5173?",
      more: "+1",
    });
    s.dismissOffer(DEVBOX);
    expect(offerView(m(), s.portsScope(DEVBOX))).toMatchObject({
      label: "Forward port 3000?",
      more: null,
    });
  });
});

describe("accepting an offer", () => {
  it("is working until the answer, then adds the row and opens the Mac address without a toast", async () => {
    const s = await fresh();
    const answer = deferred<PortForward>();
    serve("ssh_port_forward", () => answer.promise);
    feed(s, 7, DEVBOX, "localhost:5173\r\n");

    const done = s.acceptOffer(DEVBOX);
    const m = () => s.usePortsStore.getState();
    expect(offerView(m(), SCOPE)?.working).toBe(true);
    expect(portPhase(m(), SCOPE, 5173)).toBe("forwarding");
    await s.acceptOffer(DEVBOX);
    expect(calls("ssh_port_forward")).toEqual([
      ["ssh_port_forward", { host: "devbox", remotePort: 5173 }],
    ]);

    answer.resolve(active(5173));
    await done;
    expect(offerView(m(), SCOPE)).toBeNull();
    expect(rowViews(m(), SCOPE).map((r) => r.label)).toEqual([
      "5173 -> localhost:5173",
    ]);
    expect(portsSummary(m(), SCOPE).count).toBe(1);
    expect(openPreview).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:5173",
    );
    expect(toast).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("names a differing Mac port in a toast and opens it", async () => {
    const s = await fresh();
    serve("ssh_port_forward", () => active(5173, 5174));
    feed(s, 7, DEVBOX, "localhost:5173\r\n");
    await s.acceptOffer(DEVBOX);
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      "Port 5173 is available at localhost:5174",
    );
    expect(openPreview).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:5174",
    );
  });

  it("shows the failure, leaves no row and drops the offer", async () => {
    const s = await fresh();
    serve("ssh_port_forward", () => {
      throw "not connected to devbox";
    });
    feed(s, 7, DEVBOX, "localhost:5173\r\n");
    await s.acceptOffer(DEVBOX);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Could not forward port 5173: not connected to devbox",
    );
    expect(s.usePortsStore.getState().forwards).toEqual({});
    expect(offers(s)).toEqual([]);
    expect(openPreview).not.toHaveBeenCalled();
  });
});

describe("forwarding by hand and by address", () => {
  it("validates the field without invoking and forwards a trimmed port without opening it", async () => {
    const s = await fresh();
    serve("ssh_port_forward", (a) => active(a.remotePort as number));
    for (const raw of ["abc", "0", "65536", "30.5", "-1"])
      expect(await s.forwardPortInput(DEVBOX, raw)).toBe(
        "Enter a port between 1 and 65535.",
      );
    expect(await s.forwardPortInput(DEVBOX, "")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();

    expect(await s.forwardPortInput(DEVBOX, " 3000 ")).toBeNull();
    expect(calls("ssh_port_forward")).toEqual([
      ["ssh_port_forward", { host: "devbox", remotePort: 3000 }],
    ]);
    expect(openPreview).not.toHaveBeenCalled();
  });

  it("reuses an active forward, highlights its row for 2000 ms and opens its Mac address with path and query", async () => {
    vi.useFakeTimers();
    const s = await fresh();
    await seed(s, DEVBOX, [active(4000, 4001)]);
    const highlighted = () =>
      rowViews(s.usePortsStore.getState(), SCOPE)[0].highlighted;

    expect(await s.forwardPortInput(DEVBOX, "4000")).toBeNull();
    expect(highlighted()).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(highlighted()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(highlighted()).toBe(false);

    expect(
      await s.openLoopbackAddress(DEVBOX, "http://localhost:4000/a?b=1"),
    ).toBe(true);
    expect(openPreview).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:4001/a?b=1",
    );
    expect(calls("ssh_port_forward")).toEqual([]);
  });

  it("forwards a clicked address, ports below 1024 included, and opens it on localhost", async () => {
    const s = await fresh();
    serve("ssh_port_forward", (a) => active(a.remotePort as number));
    await s.openLoopbackAddress(DEVBOX, "localhost:3000/docs?x=1");
    await s.openLoopbackAddress(DEVBOX, "0.0.0.0:80");
    await s.openLoopbackAddress(DEVBOX, "https://127.0.0.1:8443/");
    expect(openPreview.mock.calls).toEqual([
      ["http://localhost:3000/docs?x=1"],
      ["http://localhost:80/"],
      ["https://localhost:8443/"],
    ]);
    expect(calls("ssh_port_forward").map(([, a]) => a.remotePort)).toEqual([
      3000, 80, 8443,
    ]);
  });

  it("does nothing for a local pane or a non-loopback address", async () => {
    const s = await fresh();
    expect(await s.openLoopbackAddress(LOCAL, "localhost:3000")).toBe(false);
    expect(await s.openLoopbackAddress(DEVBOX, "example.com:3000")).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("rows, retry and stop", () => {
  it("lists, retries and stops forwards with the matching actions", async () => {
    const s = await fresh();
    await seed(s, DEVBOX, [
      active(3000),
      { remotePort: 8080, localPort: 8080, status: "disconnected" },
    ]);
    const m = () => s.usePortsStore.getState();
    expect(rowViews(m(), SCOPE).map((r) => [r.remotePort, r.actions])).toEqual([
      [3000, ["open", "openInBrowser", "copy", "stop"]],
      [8080, ["retry", "stop"]],
    ]);
    expect(portsSummary(m(), SCOPE)).toEqual({ count: 2, attention: true });

    serve("ssh_port_forward", () => active(8080));
    await s.retryForward(DEVBOX, 8080);
    expect(rowViews(m(), SCOPE)[1].status).toBe("active");
    expect(portsSummary(m(), SCOPE).attention).toBe(false);

    serve("ssh_port_stop", () => null);
    await s.stopForward(DEVBOX, 3000);
    expect(calls("ssh_port_stop")).toEqual([
      ["ssh_port_stop", { host: "devbox", remotePort: 3000 }],
    ]);
    expect(portsSummary(m(), SCOPE).count).toBe(1);
  });

  it("keeps a disconnected row when the retry fails", async () => {
    const s = await fresh();
    await seed(s, DEVBOX, [
      { remotePort: 8080, localPort: 8080, status: "disconnected" },
    ]);
    serve("ssh_port_forward", () => {
      throw "not connected to devbox";
    });
    await s.retryForward(DEVBOX, 8080);
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Could not forward port 8080: not connected to devbox",
    );
    expect(rowViews(s.usePortsStore.getState(), SCOPE)[0].status).toBe(
      "disconnected",
    );
  });

  it("opens an active row in the preview", async () => {
    const s = await fresh();
    await seed(s, DEVBOX, [active(9222, 9223)]);
    s.openForwardInPreview(DEVBOX, 9222);
    expect(openPreview).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:9223",
    );
  });

  it("drops a listing that started before a stop finished", async () => {
    const s = await fresh();
    await seed(s, DEVBOX, [active(3000)]);
    const listed = deferred<PortForward[]>();
    serve("ssh_port_list", () => listed.promise);
    serve("ssh_port_stop", () => null);
    const refresh = s.refreshForwards(DEVBOX);
    await s.stopForward(DEVBOX, 3000);
    listed.resolve([active(3000)]);
    await refresh;
    expect(rowViews(s.usePortsStore.getState(), SCOPE)).toEqual([]);
  });
});

describe("liveness", () => {
  it("asks only when the list opens or a terminal of that server ends", async () => {
    vi.useFakeTimers();
    const s = await fresh();
    await seed(s, DEVBOX, [active(3000)]);
    feed(s, 7, DEVBOX, "build done\r\n");

    vi.advanceTimersByTime(60_000);
    expect(invoke).not.toHaveBeenCalled();

    await s.refreshForwards(DEVBOX);
    expect(calls("ssh_port_list")).toHaveLength(1);

    s.terminalEnded(DEVBOX);
    expect(calls("ssh_port_list")).toHaveLength(2);
    await s.refreshForwards(DEVBOX);
    expect(calls("ssh_port_list")).toHaveLength(2);

    s.terminalEnded(LOCAL);
    s.terminalEnded(OTHER);
    expect(calls("ssh_port_list")).toHaveLength(2);
  });

  it("shares one query between overlapping requests", async () => {
    const s = await fresh();
    serve("ssh_port_list", () => [active(3000)]);
    await Promise.all([s.refreshForwards(DEVBOX), s.refreshForwards(DEVBOX)]);
    expect(calls("ssh_port_list")).toHaveLength(1);
  });
});

describe("scope and lifetime", () => {
  it("keeps forwards per server and past the pane that found them", async () => {
    const s = await fresh();
    serve("ssh_port_forward", (a) => active(a.remotePort as number));
    feed(s, 7, DEVBOX, "localhost:3000\r\n");
    await s.acceptOffer(DEVBOX);
    await s.forwardPortInput(OTHER, "5000");
    s.paneClosed(7);
    const m = s.usePortsStore.getState();
    expect(rowViews(m, SCOPE).map((r) => r.remotePort)).toEqual([3000]);
    expect(rowViews(m, s.portsScope(OTHER)).map((r) => r.remotePort)).toEqual([
      5000,
    ]);
    expect(s.portsScope(LOCAL)).toBeNull();
  });

  it("starts empty and writes nothing to the settings store", async () => {
    const s = await fresh();
    expect(s.usePortsStore.getState()).toEqual(EMPTY_PORTS);
    serve("ssh_port_forward", (a) => active(a.remotePort as number));
    await s.forwardPortInput(DEVBOX, "3000");
    expect(storeWrites).not.toHaveBeenCalled();
    expect(invoke.mock.calls.map(([c]) => c)).toEqual(["ssh_port_forward"]);
  });
});
