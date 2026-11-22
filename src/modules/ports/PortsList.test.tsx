// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PORTS, type PortForward } from "@/modules/ports/lib/ports";
import { usePortsListStore } from "@/modules/ports/lib/portsList";
import { configurePorts, usePortsStore } from "@/modules/ports/lib/portsStore";
import { PortsStatus } from "@/modules/ports/PortsStatus";
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

const { invoke, openUrl, toast, writeSystemClipboard } = vi.hoisted(() => ({
  invoke: vi.fn(),
  openUrl: vi.fn(),
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  writeSystemClipboard: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/clipboard", () => ({ writeSystemClipboard }));
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

const DEVBOX: WorkspaceEnv = { kind: "ssh", host: "devbox", label: "devbox" };
const SCOPE = "ssh:devbox";
const openPreview = vi.fn();

function active(remotePort: number, localPort = remotePort): PortForward {
  return { remotePort, localPort, status: "active" };
}

const DISCONNECTED: PortForward = {
  remotePort: 8080,
  localPort: 8080,
  status: "disconnected",
};

// The backend as the list sees it: ssh_port_list answers what is forwarded.
let server: PortForward[] = [];

function serveForwards(list: PortForward[]): void {
  server = [...list];
  usePortsStore.setState(
    {
      ...EMPTY_PORTS,
      forwards: list.length > 0 ? { [SCOPE]: [...list] } : {},
    },
    true,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let forwardAnswer: Promise<PortForward> | null = null;

function calls(cmd: string) {
  return invoke.mock.calls.filter(([c]) => c === cmd);
}

async function openList() {
  await act(async () => {
    fireEvent.click(screen.getByTestId("ports-status"));
  });
}

function list() {
  return screen.queryByTestId("ports-list");
}

function row(port: number): HTMLElement {
  const found = screen
    .getAllByTestId("ports-row")
    .find((r) => r.textContent?.startsWith(String(port)));
  if (!found) throw new Error(`no row ${port}`);
  return found;
}

function actionsOf(port: number): string[] {
  return within(row(port))
    .getAllByRole("button")
    .map((b) => b.getAttribute("aria-label") ?? "");
}

async function press(port: number, action: string) {
  await act(async () => {
    fireEvent.click(within(row(port)).getByLabelText(action));
  });
}

beforeEach(() => {
  server = [];
  forwardAnswer = null;
  invoke.mockImplementation(
    async (cmd: string, args: { remotePort?: number }) => {
      if (cmd === "ssh_port_list") return [...server];
      if (cmd === "ssh_port_stop") {
        server = server.filter((f) => f.remotePort !== args.remotePort);
        return null;
      }
      if (cmd === "ssh_port_forward") {
        const forward = await (forwardAnswer ??
          Promise.resolve(active(args.remotePort as number)));
        server = [...server, forward].sort(
          (a, b) => a.remotePort - b.remotePort,
        );
        return forward;
      }
      throw new Error(`unexpected ${cmd}`);
    },
  );
  writeSystemClipboard.mockResolvedValue(undefined);
  openUrl.mockResolvedValue(undefined);
  configurePorts({ openPreview });
  useWorkspaceEnvStore.setState({ env: DEVBOX });
});

afterEach(() => {
  cleanup();
  invoke.mockReset();
  openUrl.mockReset();
  toast.mockReset();
  toast.error.mockReset();
  writeSystemClipboard.mockReset();
  openPreview.mockReset();
  usePortsStore.setState(EMPTY_PORTS, true);
  usePortsListStore.setState({ open: false });
  useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
  configurePorts({ openPreview: () => {} });
});

describe("ports list (AC-4)", () => {
  it("lists the server's forwards under its name with the moved Mac port emphasized", async () => {
    serveForwards([active(3000), active(9222, 9223)]);
    render(<PortsStatus />);
    await openList();

    const shown = list() as HTMLElement;
    expect(shown.dataset.status).toBe("listing");
    expect(shown.textContent).toContain("PORTS");
    expect(screen.getByTestId("ports-list-host").textContent).toBe("devbox");
    expect(
      screen.getAllByTestId("ports-row-label").map((r) => r.textContent),
    ).toEqual(["3000 -> localhost:3000", "9222 -> localhost:9223"]);
    expect(
      [...shown.querySelectorAll("[data-moved='true']")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["9223"]);
    expect(screen.getByLabelText("Port")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forward" })).toBeTruthy();
    expect(calls("ssh_port_list")).toEqual([
      ["ssh_port_list", { host: "devbox" }],
    ]);
  });

  it("explains the empty list", async () => {
    serveForwards([]);
    render(<PortsStatus />);
    await openList();
    expect(list()?.dataset.status).toBe("empty");
    expect(list()?.textContent).toContain(
      "No forwarded ports. Enter a port below or click a localhost link in the terminal.",
    );
  });

  it("closes on Escape", async () => {
    serveForwards([active(3000)]);
    render(<PortsStatus />);
    await openList();
    await act(async () => {
      fireEvent.keyDown(document.activeElement ?? document.body, {
        key: "Escape",
      });
    });
    expect(list()).toBeNull();
  });

  it("closes on a click outside", async () => {
    serveForwards([active(3000)]);
    render(
      <>
        <PortsStatus />
        <button type="button">elsewhere</button>
      </>,
    );
    await openList();
    // Radix arms its outside-pointer listener on the next tick.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const elsewhere = screen.getByText("elsewhere");
    await act(async () => {
      fireEvent.pointerDown(elsewhere);
      fireEvent.click(elsewhere);
    });
    expect(list()).toBeNull();
  });
});

describe("row actions (AC-5)", () => {
  beforeEach(() => {
    serveForwards([active(3000), DISCONNECTED, active(9222, 9223)]);
  });

  it("copies the Mac address with a Copied toast", async () => {
    render(<PortsStatus />);
    await openList();
    await press(9222, "Copy");
    expect(writeSystemClipboard).toHaveBeenCalledWith("http://localhost:9223");
    expect(toast).toHaveBeenCalledWith("Copied");
    expect(list()).not.toBeNull();
  });

  it("opens the Mac address in the preview and in the system browser", async () => {
    render(<PortsStatus />);
    await openList();
    await press(9222, "Open");
    expect(openPreview).toHaveBeenCalledWith("http://localhost:9223");
    await press(9222, "Open in browser");
    expect(openUrl).toHaveBeenCalledWith("http://localhost:9223");
    expect(list()).not.toBeNull();
  });

  it("stops a forward and removes its row, the list stays open", async () => {
    render(<PortsStatus />);
    await openList();
    await press(9222, "Stop");
    expect(calls("ssh_port_stop")).toEqual([
      ["ssh_port_stop", { host: "devbox", remotePort: 9222 }],
    ]);
    expect(
      screen.getAllByTestId("ports-row").map((r) => r.dataset.status),
    ).toEqual(["active", "disconnected"]);
    expect(list()).not.toBeNull();
  });

  it("offers only Retry and Stop on a disconnected row", async () => {
    render(<PortsStatus />);
    await openList();
    expect(row(8080).dataset.status).toBe("disconnected");
    expect(row(8080).textContent).toContain("Disconnected");
    expect(actionsOf(8080)).toEqual(["Retry", "Stop"]);
    expect(actionsOf(9222)).toEqual([
      "Open",
      "Open in browser",
      "Copy",
      "Stop",
    ]);
  });
});

describe("port input (AC-6)", () => {
  it("rejects abc without calling the backend", async () => {
    serveForwards([]);
    render(<PortsStatus />);
    await openList();
    const field = screen.getByLabelText("Port");
    fireEvent.change(field, { target: { value: "abc" } });
    await act(async () => {
      fireEvent.submit(screen.getByTestId("ports-input"));
    });
    expect(screen.getByTestId("ports-input").dataset.status).toBe("invalid");
    expect(screen.getByRole("alert").textContent).toBe(
      "Enter a port between 1 and 65535.",
    );
    expect(calls("ssh_port_forward")).toEqual([]);
  });

  it("forwards 5173, stays working until the answer, then shows the row and clears the field", async () => {
    serveForwards([]);
    const answer = deferred<PortForward>();
    forwardAnswer = answer.promise;
    render(<PortsStatus />);
    await openList();
    const field = screen.getByLabelText("Port") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "5173" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    });

    expect(screen.getByTestId("ports-input").dataset.status).toBe("working");
    expect(field.readOnly).toBe(true);
    expect(screen.getByRole("button", { name: /Forward$/ })).toHaveProperty(
      "disabled",
      true,
    );
    expect(calls("ssh_port_forward")).toEqual([
      ["ssh_port_forward", { host: "devbox", remotePort: 5173 }],
    ]);

    await act(async () => {
      answer.resolve(active(5173));
    });
    expect(
      screen.getAllByTestId("ports-row-label").map((r) => r.textContent),
    ).toEqual(["5173 -> localhost:5173"]);
    expect(field.value).toBe("");
    expect(screen.getByTestId("ports-input").dataset.status).toBe("idle");
    expect(openPreview).not.toHaveBeenCalled();
  });

  it("keeps the number in the field when the forward fails", async () => {
    serveForwards([]);
    forwardAnswer = Promise.reject("not connected to devbox");
    forwardAnswer.catch(() => {});
    render(<PortsStatus />);
    await openList();
    const field = screen.getByLabelText("Port") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "5173" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Could not forward port 5173: not connected to devbox",
    );
    expect(field.value).toBe("5173");
    expect(screen.getByTestId("ports-input").dataset.status).toBe("idle");
    expect(screen.queryAllByTestId("ports-row")).toEqual([]);
  });
});
