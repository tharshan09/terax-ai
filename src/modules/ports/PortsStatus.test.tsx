// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_PORTS,
  type PortForward,
  type PortOffer,
} from "@/modules/ports/lib/ports";
import {
  openPortsList,
  usePortsListStore,
} from "@/modules/ports/lib/portsList";
import { configurePorts, usePortsStore } from "@/modules/ports/lib/portsStore";
import { PortsStatus } from "@/modules/ports/PortsStatus";
import { StatusBar } from "@/modules/statusbar";
import {
  STATUSBAR_WIDGET_LABELS,
  STATUSBAR_WIDGETS,
} from "@/modules/statusbar/layout";
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

const { invoke, platform } = vi.hoisted(() => ({
  invoke: vi.fn(),
  platform: { IS_MAC: false, IS_WINDOWS: false },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));
vi.mock("@/lib/platform", () => platform);
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
vi.mock("@/modules/ai", () => ({
  useChatStore: (select: (s: object) => unknown) =>
    select({ panelOpen: false, openPanel: () => {} }),
}));
vi.mock("@/modules/ai/components/AgentStatusPill", () => ({
  AgentStatusPill: () => null,
}));
vi.mock("@/modules/ai/components/AiStatusBarControls", () => ({
  AiOpenButton: () => null,
  AiStatusBarControls: () => null,
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (select: (s: object) => unknown) =>
    select({ statusbarLayout: [], statusbarShowAi: false }),
}));
vi.mock("@/modules/statusbar/lib/useClaudeStatus", () => ({
  useClaudeStatus: () => null,
}));
vi.mock("@/modules/statusbar/StatusbarConfig", () => ({
  StatusbarConfig: () => <div data-testid="statusbar-config" />,
}));
vi.mock("@/modules/statusbar/widgets/registry", () => ({
  STATUSBAR_WIDGET_COMPONENTS: {},
}));

const DEVBOX: WorkspaceEnv = { kind: "ssh", host: "devbox", label: "devbox" };
const SCOPE = "ssh:devbox";
const openPreview = vi.fn();

function active(remotePort: number, localPort = remotePort): PortForward {
  return { remotePort, localPort, status: "active" };
}

function offer(port: number): PortOffer {
  return { scope: SCOPE, host: "devbox", leafId: 7, port, working: false };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function seed(forwards: PortForward[], offers: PortOffer[] = []): void {
  usePortsStore.setState(
    {
      ...EMPTY_PORTS,
      forwards: forwards.length > 0 ? { [SCOPE]: forwards } : {},
      offers,
    },
    true,
  );
}

function statusBar() {
  return (
    <StatusBar
      cwd={null}
      home={null}
      onCd={() => {}}
      onWorkspaceChange={() => {}}
      onOpenMini={() => {}}
      hasComposer={false}
      privateActive={false}
      sourceControl={{} as never}
      activeLeafId={null}
      activeWorkspace={undefined}
    />
  );
}

const portsStatus = () => screen.queryByTestId("ports-status");
const portOffer = () => screen.queryByTestId("port-offer");

beforeEach(() => {
  platform.IS_WINDOWS = false;
  invoke.mockImplementation(async () => []);
  configurePorts({ openPreview });
  useWorkspaceEnvStore.setState({ env: DEVBOX });
});

afterEach(() => {
  cleanup();
  invoke.mockReset();
  openPreview.mockReset();
  usePortsStore.setState(EMPTY_PORTS, true);
  usePortsListStore.setState({ open: false });
  useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
  configurePorts({ openPreview: () => {} });
});

describe("ports status visibility and count (AC-1)", () => {
  it("sits in the right zone of the status bar with the forward count", () => {
    seed([active(3000), active(9222, 9223)]);
    render(statusBar());
    const status = portsStatus() as HTMLElement;
    expect(status.textContent).toBe("Ports2");
    expect(status.dataset.status).toBe("count");
    const rightZone = screen.getByTestId("statusbar-config").parentElement;
    expect(rightZone?.contains(status)).toBe(true);
  });

  it("shows only the label without forwards", () => {
    seed([]);
    render(<PortsStatus />);
    expect(portsStatus()?.textContent).toBe("Ports");
    expect(portsStatus()?.dataset.status).toBe("empty");
  });

  it("renders neither status nor offer in a local workspace", () => {
    seed([active(3000)], [offer(5173)]);
    useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
    render(<PortsStatus />);
    expect(portsStatus()).toBeNull();
    expect(portOffer()).toBeNull();
  });

  it("renders neither status nor offer on Windows, even for an SSH workspace", () => {
    platform.IS_WINDOWS = true;
    seed([active(3000)], [offer(5173)]);
    render(<PortsStatus />);
    expect(portsStatus()).toBeNull();
    expect(portOffer()).toBeNull();
  });

  it("offers no status bar configuration entry to hide it", () => {
    expect(STATUSBAR_WIDGETS.filter((id) => /port/i.test(id))).toEqual([]);
    expect(
      Object.values(STATUSBAR_WIDGET_LABELS).filter((l) => /port/i.test(l)),
    ).toEqual([]);
  });
});

describe("ports status attention (AC-2)", () => {
  it("turns to attention when a forward is disconnected", () => {
    seed([
      active(3000),
      { remotePort: 8080, localPort: 8080, status: "disconnected" },
    ]);
    render(<PortsStatus />);
    expect(portsStatus()?.dataset.status).toBe("attention");
    expect(portsStatus()?.textContent).toBe("Ports2");
  });
});

describe("port offer (AC-3)", () => {
  it("shows the newest offer with +N left of the ports status", () => {
    seed([], [offer(3000), offer(5173)]);
    render(<PortsStatus />);
    const shown = portOffer() as HTMLElement;
    expect(shown.dataset.status).toBe("offering");
    expect(shown.textContent).toContain("Forward port 5173?");
    expect(screen.getByTestId("port-offer-more").textContent).toBe("+1");
    expect(
      shown.compareDocumentPosition(portsStatus() as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("forwards the shown port on click, ignores a second click while working, then previews it", async () => {
    const answer = deferred<PortForward>();
    invoke.mockImplementation((cmd: string) =>
      cmd === "ssh_port_forward" ? answer.promise : Promise.resolve([]),
    );
    seed([], [offer(3000), offer(5173)]);
    render(<PortsStatus />);

    const accept = screen.getByTitle(
      "Forward port 5173 to this Mac and preview it",
    );
    await act(async () => {
      fireEvent.click(accept);
    });
    expect(portOffer()?.dataset.status).toBe("working");
    expect(accept).toHaveProperty("disabled", true);

    await act(async () => {
      fireEvent.click(accept);
    });
    expect(
      invoke.mock.calls.filter(([cmd]) => cmd === "ssh_port_forward"),
    ).toEqual([["ssh_port_forward", { host: "devbox", remotePort: 5173 }]]);

    await act(async () => {
      answer.resolve(active(5173));
    });
    expect(openPreview).toHaveBeenCalledWith("http://localhost:5173");
    expect(portOffer()?.textContent).toContain("Forward port 3000?");
    expect(screen.queryByTestId("port-offer-more")).toBeNull();
    expect(portsStatus()?.textContent).toBe("Ports1");
  });

  it("dismisses the shown offer with the cross", async () => {
    seed([], [offer(3000), offer(5173)]);
    render(<PortsStatus />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Dismiss port 5173"));
    });
    expect(portOffer()?.textContent).toContain("Forward port 3000?");
    expect(screen.queryByTestId("port-offer-more")).toBeNull();
    expect(invoke).not.toHaveBeenCalledWith(
      "ssh_port_forward",
      expect.anything(),
    );
  });
});

describe("opening the list as the Forward Port command does (AC-7)", () => {
  it("opens the ports list with focus in the Port field", async () => {
    seed([]);
    render(<PortsStatus />);
    expect(screen.queryByTestId("ports-list")).toBeNull();
    await act(async () => {
      openPortsList();
    });
    expect(screen.getByTestId("ports-list")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Port"));
  });
});
