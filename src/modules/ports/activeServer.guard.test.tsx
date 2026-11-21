// GUARD: Ports status, list, offer and command take the server of the active workspace from useWorkspaceEnvStore, never from the active terminal tab.
// DISPOSITION: specs/2026-11-20-ssh-remote-workflow/wave-2/slop-dispositions.md
// RULE: --
// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PORTS, type PortForward } from "@/modules/ports/lib/ports";
import { usePortsListStore } from "@/modules/ports/lib/portsList";
import { usePortsStore } from "@/modules/ports/lib/portsStore";
import { StatusBar } from "@/modules/statusbar";
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

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn() }));
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
  StatusbarConfig: () => null,
}));
vi.mock("@/modules/statusbar/widgets/registry", () => ({
  STATUSBAR_WIDGET_COMPONENTS: {},
}));

const DEVBOX: WorkspaceEnv = { kind: "ssh", host: "devbox", label: "devbox" };
const OTHER: WorkspaceEnv = { kind: "ssh", host: "other", label: "other" };
const FORWARD: PortForward = {
  remotePort: 3000,
  localPort: 3000,
  status: "active",
};

function bar(activeWorkspace: WorkspaceEnv | undefined) {
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
      activeWorkspace={activeWorkspace}
    />
  );
}

function portsStatus() {
  return screen.queryByTestId("ports-status");
}

beforeEach(() => {
  invoke.mockImplementation(async (cmd: string, args: { host: string }) =>
    cmd === "ssh_port_list" && args.host === "devbox" ? [FORWARD] : [],
  );
  usePortsStore.setState(
    { ...EMPTY_PORTS, forwards: { "ssh:devbox": [FORWARD] } },
    true,
  );
  useWorkspaceEnvStore.setState({ env: DEVBOX });
});

afterEach(() => {
  cleanup();
  invoke.mockReset();
  usePortsStore.setState(EMPTY_PORTS, true);
  usePortsListStore.setState({ open: false });
  useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
});

describe("ports follow the workspace store, not the active terminal tab", () => {
  it("keeps the ports status and its server when a preview tab becomes active", async () => {
    const { rerender } = render(bar(DEVBOX));
    expect(portsStatus()?.textContent).toBe("Ports1");

    rerender(bar(undefined));
    expect(portsStatus()?.textContent).toBe("Ports1");

    await act(async () => {
      fireEvent.click(portsStatus() as HTMLElement);
    });
    expect(screen.getByTestId("ports-list-host").textContent).toBe("devbox");
    expect(
      screen.getAllByTestId("ports-row").map((row) => row.textContent),
    ).toEqual(["3000 -> localhost:3000"]);
    expect(invoke).toHaveBeenCalledWith("ssh_port_list", { host: "devbox" });
  });

  it("ignores a terminal tab prop that names another server", async () => {
    render(bar(OTHER));
    await act(async () => {
      fireEvent.click(portsStatus() as HTMLElement);
    });
    expect(screen.getByTestId("ports-list-host").textContent).toBe("devbox");
    expect(invoke).not.toHaveBeenCalledWith("ssh_port_list", {
      host: "other",
    });
  });

  it("shows nothing for a local workspace even when the terminal tab is on SSH", () => {
    useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
    render(bar(DEVBOX));
    expect(portsStatus()).toBeNull();
    expect(screen.queryByTestId("port-offer")).toBeNull();
  });

  it("reads no workspace from props in the ports components", () => {
    for (const name of ["PortsStatus.tsx", "PortsList.tsx"]) {
      const source = readFileSync(
        fileURLToPath(new URL(name, import.meta.url)),
        "utf8",
      );
      expect(source).not.toMatch(
        /activeWorkspace|activeTerminalTab|leafWorkspace/,
      );
    }
  });
});
