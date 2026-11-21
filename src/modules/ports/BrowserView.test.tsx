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
import {
  type BrowserView,
  type BrowserViewStatus,
  type ChromeProbe,
  chromeProbeEnded,
  chromeProbeStarted,
  EMPTY_PORTS,
  forwardsListed,
  type PortForward,
  type PortsModel,
} from "@/modules/ports/lib/ports";
import {
  setPortsListOpen,
  usePortsListStore,
} from "@/modules/ports/lib/portsList";
import {
  configurePorts,
  useBrowserViewStore,
  usePortsStore,
} from "@/modules/ports/lib/portsStore";
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

const { invoke, openUrl, toast, writeSystemClipboard, platform, disk, writes } =
  vi.hoisted(() => ({
    invoke: vi.fn(),
    openUrl: vi.fn(),
    toast: Object.assign(vi.fn(), { error: vi.fn() }),
    writeSystemClipboard: vi.fn(),
    platform: { IS_MAC: true, IS_WINDOWS: false },
    disk: new Map<string, unknown>(),
    writes: vi.fn(),
  }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  listen: vi.fn(async () => () => {}),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/clipboard", () => ({ writeSystemClipboard }));
vi.mock("@/lib/platform", () => platform);
vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class {
    get = vi.fn(async (key: string) => disk.get(key));
    entries = vi.fn(async () => [...disk.entries()]);
    set = vi.fn(async (key: string, value: unknown) => {
      writes(key, value);
      disk.set(key, value);
    });
    save = vi.fn(async () => {});
    delete = vi.fn(async (key: string) => {
      writes(key);
      disk.delete(key);
    });
    onKeyChange = vi.fn(async () => () => {});
    onChange = vi.fn(async () => () => {});
  },
}));

const DEVBOX: WorkspaceEnv = { kind: "ssh", host: "devbox", label: "devbox" };
const OTHER: WorkspaceEnv = { kind: "ssh", host: "other", label: "other" };

function active(remotePort: number, localPort = remotePort): PortForward {
  return { remotePort, localPort, status: "active" };
}

function disconnected(remotePort: number, localPort = remotePort): PortForward {
  return { remotePort, localPort, status: "disconnected" };
}

// What ssh_port_list answers, per host.
const server = new Map<string, PortForward[]>();
let chromeAnswer: (port: number) => Promise<boolean> = async () => false;
let forwardAnswer: (port: number) => PortForward = (port) => active(port);
// What ssh_port_view_browser answers; the ports are the server's forward,
// as the backend reads them from its registry.
let viewStatus: BrowserViewStatus = "opened";
let viewReason: string | null = null;
let viewAnswer: (view: BrowserView) => Promise<BrowserView> = async (v) => v;

function seed(
  host: string,
  list: PortForward[],
  chrome: Record<number, Exclude<ChromeProbe, "probing">> = {},
): void {
  const scope = `ssh:${host}`;
  server.set(host, [...list]);
  let m: PortsModel = forwardsListed(usePortsStore.getState(), scope, list);
  for (const f of list) {
    const probe = chrome[f.remotePort];
    if (!probe) continue;
    m = chromeProbeStarted(m, scope, f, 0);
    m = chromeProbeEnded(m, scope, f.remotePort, 0, probe);
  }
  usePortsStore.setState(m, true);
}

// The rows of AC-2.
function seedDevbox(): void {
  seed("devbox", [active(3000), active(9222, 9223), disconnected(9333)], {
    3000: "none",
    9222: "chrome",
    9333: "chrome",
  });
}

function calls(cmd: string) {
  return invoke.mock.calls.filter(([c]) => c === cmd);
}

function commandsBut(...ignored: string[]) {
  return invoke.mock.calls
    .map(([c]) => c as string)
    .filter((c) => !ignored.includes(c));
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function openList() {
  await act(async () => {
    fireEvent.click(screen.getByTestId("ports-status"));
  });
  await settle();
}

async function closeList() {
  await act(async () => setPortsListOpen(false));
}

function row(port: number): HTMLElement {
  const found = screen
    .getAllByTestId("ports-row")
    .find((r) => r.textContent?.startsWith(String(port)));
  if (!found) throw new Error(`no row ${port}`);
  return found;
}

function actionsOf(port: number): [string, boolean][] {
  return within(row(port))
    .getAllByRole("button")
    .map((b) => [
      b.getAttribute("aria-label") ?? "",
      (b as HTMLButtonElement).disabled,
    ]);
}

async function press(port: number, action: string) {
  await act(async () => {
    fireEvent.click(within(row(port)).getByLabelText(action));
  });
  await settle();
}

async function forwardTyped(port: number) {
  fireEvent.change(screen.getByLabelText("Port"), {
    target: { value: String(port) },
  });
  await act(async () => {
    fireEvent.submit(screen.getByTestId("ports-input"));
  });
  await settle();
}

function notice() {
  return screen.queryByTestId("view-browser-notice");
}

function guide() {
  return screen.queryByTestId("browser-setup-guide");
}

async function choose(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
  await settle();
}

async function pressEscape() {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
  });
}

beforeEach(() => {
  server.clear();
  disk.clear();
  viewStatus = "opened";
  viewReason = null;
  viewAnswer = async (v) => v;
  chromeAnswer = async () => false;
  forwardAnswer = (port) => active(port);
  platform.IS_MAC = true;
  invoke.mockImplementation(
    async (cmd: string, args: { host?: string; remotePort?: number }) => {
      const host = args?.host ?? "";
      const list = server.get(host) ?? [];
      switch (cmd) {
        case "ssh_port_list":
          return [...list];
        case "ssh_port_stop":
          server.set(
            host,
            list.filter((f) => f.remotePort !== args.remotePort),
          );
          return null;
        case "ssh_port_forward": {
          const forward = forwardAnswer(args.remotePort as number);
          server.set(
            host,
            [
              ...list.filter((f) => f.remotePort !== forward.remotePort),
              forward,
            ].sort((a, b) => a.remotePort - b.remotePort),
          );
          return forward;
        }
        case "ssh_port_chrome":
          return chromeAnswer(args.remotePort as number);
        case "ssh_port_view_browser": {
          const forward = list.find((f) => f.remotePort === args.remotePort);
          if (!forward)
            throw `no active forward of port ${args.remotePort} on ${host}`;
          return viewAnswer({
            status: viewStatus,
            remotePort: forward.remotePort,
            localPort: forward.localPort,
            reason: viewReason,
          });
        }
      }
      throw new Error(`unexpected ${cmd}`);
    },
  );
  writeSystemClipboard.mockResolvedValue(undefined);
  openUrl.mockResolvedValue(undefined);
  configurePorts({ openPreview: vi.fn() });
  useWorkspaceEnvStore.setState({ env: DEVBOX });
});

afterEach(() => {
  cleanup();
  invoke.mockReset();
  openUrl.mockReset();
  toast.mockReset();
  toast.error.mockReset();
  writeSystemClipboard.mockReset();
  writes.mockReset();
  usePortsStore.setState(EMPTY_PORTS, true);
  usePortsListStore.setState({ open: false });
  useBrowserViewStore.setState({ dialog: null, opening: null });
  useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
});

describe("Chrome detection (AC-1)", () => {
  it("asks once after forward, retry and a new forward, not on opening the list", async () => {
    let answer!: (found: boolean) => void;
    chromeAnswer = () =>
      new Promise((resolve) => {
        answer = resolve;
      });
    forwardAnswer = () => active(9222, 9223);
    render(<PortsStatus />);
    await openList();
    await forwardTyped(9222);

    expect(calls("ssh_port_chrome")).toHaveLength(1);
    expect(row(9222).dataset.chrome).toBe("probing");
    expect(within(row(9222)).queryByTestId("ports-row-chrome")).toBeNull();
    await act(async () => answer(true));
    await settle();
    expect(row(9222).dataset.chrome).toBe("chrome");
    expect(within(row(9222)).getByTestId("ports-row-chrome").textContent).toBe(
      "Chrome",
    );

    await closeList();
    await openList();
    await closeList();
    await openList();
    expect(calls("ssh_port_chrome")).toHaveLength(1);

    server.set("devbox", [disconnected(9222, 9223)]);
    await closeList();
    await openList();
    expect(row(9222).dataset.status).toBe("disconnected");
    expect(calls("ssh_port_chrome")).toHaveLength(1);

    chromeAnswer = async () => true;
    forwardAnswer = () => active(9222, 9224);
    await press(9222, "Retry");
    expect(calls("ssh_port_chrome")).toHaveLength(2);

    await press(9222, "Stop");
    await forwardTyped(9222);
    expect(calls("ssh_port_chrome")).toEqual([
      ["ssh_port_chrome", { host: "devbox", remotePort: 9222 }],
      ["ssh_port_chrome", { host: "devbox", remotePort: 9222 }],
      ["ssh_port_chrome", { host: "devbox", remotePort: 9222 }],
    ]);
  });

  it("asks an active forward again when its ask failed, once per opening", async () => {
    seed("devbox", [active(9222, 9223), disconnected(9333)], {
      9222: "failed",
      9333: "failed",
    });
    chromeAnswer = async () => {
      throw "no active forward of port 9222 on devbox";
    };
    render(<PortsStatus />);
    await openList();
    expect(calls("ssh_port_chrome")).toEqual([
      ["ssh_port_chrome", { host: "devbox", remotePort: 9222 }],
    ]);
    expect(row(9222).dataset.chrome).toBe("failed");
  });

  it("asks nothing and shows nothing of the browser view off macOS (AC-9)", async () => {
    platform.IS_MAC = false;
    seedDevbox();
    render(<PortsStatus />);
    await openList();
    await forwardTyped(5173);
    expect(calls("ssh_port_chrome")).toEqual([]);
    expect(screen.queryByTestId("ports-row-chrome")).toBeNull();
    expect(screen.queryByLabelText("View browser")).toBeNull();
    expect(screen.queryByTestId("browser-setup-link")).toBeNull();
  });
});

describe("rows (AC-2)", () => {
  it("marks only the active Chrome row and keeps the mark after a reload", async () => {
    seedDevbox();
    render(<PortsStatus />);
    await openList();

    const marks = screen.getAllByTestId("ports-row-chrome");
    expect(marks).toHaveLength(1);
    expect(marks[0].closest("li")).toBe(row(9222));
    expect(marks[0].textContent).toBe("Chrome");
    expect(actionsOf(9222)).toEqual([
      ["Open", false],
      ["Open in browser", false],
      ["Copy", false],
      ["View browser", false],
      ["Stop", false],
    ]);
    expect(actionsOf(3000)).toEqual([
      ["Open", false],
      ["Open in browser", false],
      ["Copy", false],
      ["Stop", false],
    ]);
    expect(row(9333).textContent).toContain("Disconnected");
    expect(actionsOf(9333)).toEqual([
      ["Retry", false],
      ["Stop", false],
      ["View browser", true],
    ]);
    expect(calls("ssh_port_list")).toHaveLength(1);
    expect(calls("ssh_port_chrome")).toEqual([]);
    expect(within(row(9222)).getByTestId("ports-row-label").textContent).toBe(
      "9222 -> localhost:9223",
    );
  });
});

describe("View browser (AC-3 to AC-7)", () => {
  it("shows the notice, and Cancel neither asks, opens nor writes anything", async () => {
    seedDevbox();
    render(<PortsStatus />);
    await openList();
    await press(9222, "View browser");

    const shown = notice() as HTMLElement;
    expect(shown).not.toBeNull();
    expect(within(shown).getByText("Remote browser access")).toBeTruthy();
    expect(
      within(shown).getByText(
        "Anyone who can reach this port can control the browser on devbox, including the accounts signed in there. Terax keeps it reachable from this Mac only.",
      ),
    ).toBeTruthy();
    expect(
      within(shown)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Cancel", "Continue"]);
    expect(shown.contains(document.activeElement)).toBe(true);

    await choose("Cancel");
    expect(notice()).toBeNull();
    expect(commandsBut("ssh_port_list")).toEqual([]);
    expect(openUrl).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();

    await press(9222, "View browser");
    expect(notice()).not.toBeNull();
  });

  it("remembers Continue per server and lets the backend open the view", async () => {
    seedDevbox();
    seed("other", [active(9222, 9223)], { 9222: "chrome" });
    render(<PortsStatus />);
    await openList();
    await press(9222, "View browser");
    await choose("Continue");

    expect(disk.get("browserNoticeConfirmed")).toEqual(["ssh:devbox"]);
    expect(calls("ssh_port_view_browser")).toEqual([
      ["ssh_port_view_browser", { host: "devbox", remotePort: 9222 }],
    ]);
    expect(commandsBut("ssh_port_list")).toEqual(["ssh_port_view_browser"]);

    await press(9222, "View browser");
    expect(notice()).toBeNull();
    expect(calls("ssh_port_view_browser")).toHaveLength(2);

    await act(async () => useWorkspaceEnvStore.setState({ env: OTHER }));
    await settle();
    await press(9222, "View browser");
    expect(notice()).not.toBeNull();
    expect(notice()?.textContent).toContain("the browser on other,");
    expect(calls("ssh_port_view_browser")).toHaveLength(2);
    expect(openUrl).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(guide()).toBeNull();
  });

  it("asks for Google Chrome when it is missing on this Mac (AC-6)", async () => {
    disk.set("browserNoticeConfirmed", ["ssh:devbox"]);
    viewStatus = "chrome_missing";
    seedDevbox();
    render(<PortsStatus />);
    await openList();
    await press(9222, "View browser");
    expect(notice()).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      "Google Chrome is required on this Mac to view the remote browser.",
    );
    expect(guide()).toBeNull();
  });

  const fallbacks: [string, BrowserViewStatus][] = [
    ["a refused origin", "origin_refused"],
    ["an unreachable view", "unreachable"],
  ];

  for (const [name, status] of fallbacks)
    it(`opens the guide for devbox 9222 -> 9223 on ${name} (AC-7)`, async () => {
      disk.set("browserNoticeConfirmed", ["ssh:devbox"]);
      viewStatus = status;
      seedDevbox();
      render(<PortsStatus />);
      await openList();
      await press(9222, "View browser");
      const shown = guide() as HTMLElement;
      expect(shown).not.toBeNull();
      expect(shown.textContent).toContain("Run these steps on devbox.");
      expect(shown.textContent).toContain(
        "--remote-debugging-port=9222 --user-data-dir",
      );
      expect(shown.textContent).toContain(
        "--remote-allow-origins=http://localhost:9223",
      );
      expect(toast.error).not.toHaveBeenCalled();
    });

  it("names the reason of a failed open on this Mac, without the server guide", async () => {
    disk.set("browserNoticeConfirmed", ["ssh:devbox"]);
    viewStatus = "open_failed";
    viewReason = "Unable to find application named 'Google Chrome'";
    seedDevbox();
    render(<PortsStatus />);
    await openList();
    await press(9222, "View browser");
    expect(toast.error).toHaveBeenCalledWith(
      "Could not open Google Chrome: Unable to find application named 'Google Chrome'",
    );
    expect(guide()).toBeNull();
  });

  it("says so when no page is open, without the guide (AC-7)", async () => {
    disk.set("browserNoticeConfirmed", ["ssh:devbox"]);
    viewStatus = "no_page";
    seedDevbox();
    render(<PortsStatus />);
    await openList();
    await press(9222, "View browser");
    expect(toast).toHaveBeenCalledWith(
      "No page is open in the remote browser.",
    );
    expect(guide()).toBeNull();
  });

  it("only asks liveness again when the backend found the forward gone", async () => {
    disk.set("browserNoticeConfirmed", ["ssh:devbox"]);
    viewStatus = "forward_gone";
    seedDevbox();
    render(<PortsStatus />);
    await openList();
    const listed = calls("ssh_port_list").length;
    await press(9222, "View browser");
    expect(calls("ssh_port_list")).toHaveLength(listed + 1);
    expect(toast).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(guide()).toBeNull();
  });
});

describe("guide (AC-8, AC-9)", () => {
  async function openGuide() {
    await act(async () => {
      fireEvent.click(screen.getByTestId("browser-setup-link"));
    });
    await settle();
    return guide() as HTMLElement;
  }

  it("lists the steps with copyable commands, no link and no backend call", async () => {
    seedDevbox();
    render(<PortsStatus />);
    await openList();
    invoke.mockClear();
    const shown = await openGuide();

    expect(within(shown).getByText("Set up browser view")).toBeTruthy();
    const commands = within(shown)
      .getAllByTestId("browser-setup-command")
      .map((c) => c.textContent);
    expect(commands).toEqual([
      'google-chrome --headless=new --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/terax-remote-chrome" --remote-allow-origins=http://localhost:9223',
      "claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222",
      "ss -ltn 'sport = :9222'",
    ]);
    expect(within(shown).getByText("Example:")).toBeTruthy();
    expect(within(shown).getByText("Example for Claude Code:")).toBeTruthy();
    expect(
      within(shown).getByText(
        "In Terax, forward port 9222. If it is already forwarded, stop it and forward it again.",
      ),
    ).toBeTruthy();
    expect(within(shown).getByTestId("browser-setup-warning").textContent).toBe(
      "Keep the debugging port reachable on the server only. Never start Chrome with --remote-debugging-address=0.0.0.0 or open the port in a firewall.",
    );

    const copies = within(shown).getAllByRole("button", { name: /^Copy: / });
    expect(copies).toHaveLength(3);
    for (const copy of copies)
      await act(async () => {
        fireEvent.click(copy);
      });
    expect(writeSystemClipboard.mock.calls.map(([text]) => text)).toEqual(
      commands,
    );
    expect(toast).toHaveBeenCalledTimes(3);
    expect(toast).toHaveBeenCalledWith("Copied");
    expect(shown.querySelector("a")).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  const cases: [string, () => void, string][] = [
    ["a Chrome row", seedDevbox, "http://localhost:9223"],
    [
      "no Chrome row",
      () => seed("devbox", [active(3000)], { 3000: "none" }),
      "http://localhost:9222",
    ],
    ["an empty list", () => seed("devbox", []), "http://localhost:9222"],
  ];

  for (const [name, arrange, origin] of cases)
    it(`opens from the footer with ${name}; Escape closes the dialog, then the list`, async () => {
      arrange();
      render(<PortsStatus />);
      await openList();
      const shown = await openGuide();
      expect(shown.textContent).toContain("--remote-debugging-port=9222 ");
      expect(shown.textContent).toContain(`--remote-allow-origins=${origin}`);
      expect(shown.contains(document.activeElement)).toBe(true);

      await pressEscape();
      expect(guide()).toBeNull();
      expect(screen.queryByTestId("ports-list")).not.toBeNull();

      await pressEscape();
      expect(screen.queryByTestId("ports-list")).toBeNull();
    });

  it("closes the notice first on Escape, counting as Cancel", async () => {
    seedDevbox();
    render(<PortsStatus />);
    await openList();
    await press(9222, "View browser");
    expect(notice()).not.toBeNull();
    await pressEscape();
    expect(notice()).toBeNull();
    expect(screen.queryByTestId("ports-list")).not.toBeNull();
    expect(writes).not.toHaveBeenCalled();
    expect(commandsBut("ssh_port_list")).toEqual([]);
  });
});
