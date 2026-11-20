import { IS_WINDOWS } from "@/lib/platform";
import { type WorkspaceEnv, workspaceScopeKey } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { create } from "zustand";
import {
  macUrl,
  macUrlFor,
  PortDetector,
  parseLoopbackAddress,
} from "./portDetect";
import {
  addOffer,
  clearHighlight,
  dropPaneOffers,
  EMPTY_PORTS,
  findForward,
  forwardFailed,
  forwardFailedText,
  forwardStopped,
  forwardSucceeded,
  forwardsListed,
  forwardsOf,
  HIGHLIGHT_MS,
  highlight,
  movedPortText,
  newestOffer,
  type PortForward,
  type PortsModel,
  parsePortInput,
  startForwarding,
  stopFailedText,
} from "./ports";

type SshEnv = Extract<WorkspaceEnv, { kind: "ssh" }>;

// Wired by the app shell, so the store opens tabs without importing it.
export type PortsHost = {
  openPreview: (url: string) => void;
};

let host: PortsHost = { openPreview: () => {} };

export function configurePorts(next: PortsHost): void {
  host = next;
}

// Memory only (BR-18): nothing here reaches the settings store.
export const usePortsStore = create<PortsModel>(() => EMPTY_PORTS);

const detectors = new Map<number, PortDetector>();
const seenByPane = new Map<number, Set<number>>();
const inflight = new Map<string, Promise<PortForward | null>>();
const listing = new Map<string, Promise<void>>();
const generation = new Map<string, number>();
let highlightTimer: ReturnType<typeof setTimeout> | null = null;

function model(): PortsModel {
  return usePortsStore.getState();
}

function commit(next: PortsModel): void {
  if (next !== model()) usePortsStore.setState(next, true);
}

function sshEnv(env: WorkspaceEnv | null | undefined): SshEnv | null {
  return env?.kind === "ssh" ? env : null;
}

// The key forwards are filed under; null for local and WSL workspaces.
export function portsScope(
  env: WorkspaceEnv | null | undefined,
): string | null {
  const ssh = sshEnv(env);
  return ssh ? workspaceScopeKey(ssh) : null;
}

function changed(scope: string): void {
  generation.set(scope, (generation.get(scope) ?? 0) + 1);
}

function flash(scope: string, port: number): void {
  if (highlightTimer !== null) clearTimeout(highlightTimer);
  commit(highlight(model(), scope, port));
  highlightTimer = setTimeout(() => {
    highlightTimer = null;
    commit(clearHighlight(model(), scope, port));
  }, HIGHLIGHT_MS);
}

// Raw PTY bytes of one pane, as delivered; the terminal keeps its own copy.
// Local and WSL panes return before any work.
export function feedPaneOutput(
  leafId: number,
  env: WorkspaceEnv | null,
  bytes: Uint8Array,
): void {
  const ssh = sshEnv(env);
  if (!ssh || IS_WINDOWS) return;
  let detector = detectors.get(leafId);
  if (!detector) {
    detector = new PortDetector();
    detectors.set(leafId, detector);
  }
  const ports = detector.feed(bytes);
  if (ports.length > 0) offerPorts(leafId, ssh, ports);
}

function offerPorts(
  leafId: number,
  env: SshEnv,
  ports: readonly number[],
): void {
  let seen = seenByPane.get(leafId);
  if (!seen) {
    seen = new Set();
    seenByPane.set(leafId, seen);
  }
  const scope = workspaceScopeKey(env);
  let next = model();
  for (const port of ports) {
    if (seen.has(port)) continue;
    seen.add(port);
    next = addOffer(next, { scope, host: env.host, leafId, port });
  }
  commit(next);
}

// Pane closed: its offers go, the server's forwards stay (BR-16).
export function paneClosed(leafId: number): void {
  detectors.delete(leafId);
  seenByPane.delete(leafId);
  commit(dropPaneOffers(model(), leafId));
}

// A terminal of this server ended: the one moment besides opening the list
// that asks for liveness, since every check extends the connection's hold.
export function terminalEnded(env: WorkspaceEnv | null): void {
  const scope = portsScope(env);
  if (scope === null || forwardsOf(model(), scope).length === 0) return;
  void refreshForwards(env);
}

export function refreshForwards(env: WorkspaceEnv | null): Promise<void> {
  const ssh = sshEnv(env);
  if (!ssh) return Promise.resolve();
  const scope = workspaceScopeKey(ssh);
  const running = listing.get(scope);
  if (running) return running;
  const startedAt = generation.get(scope) ?? 0;
  const run = invoke<PortForward[]>("ssh_port_list", { host: ssh.host })
    .then(
      (list) => {
        if ((generation.get(scope) ?? 0) === startedAt)
          commit(forwardsListed(model(), scope, list));
      },
      () => {},
    )
    .finally(() => listing.delete(scope));
  listing.set(scope, run);
  return run;
}

async function requestForward(
  env: SshEnv,
  scope: string,
  port: number,
): Promise<PortForward | null> {
  commit(startForwarding(model(), scope, port));
  try {
    const forward = await invoke<PortForward>("ssh_port_forward", {
      host: env.host,
      remotePort: port,
    });
    changed(scope);
    commit(forwardSucceeded(model(), scope, forward));
    const moved = movedPortText(forward);
    if (moved) toast(moved);
    return forward;
  } catch (err) {
    commit(forwardFailed(model(), scope, port));
    toast.error(forwardFailedText(port, err));
    return null;
  }
}

// EP-8: an active forward is reused and its row highlighted; a disconnected
// one is forwarded again; concurrent requests for one port share a call.
function ensureForward(env: SshEnv, port: number): Promise<PortForward | null> {
  const scope = workspaceScopeKey(env);
  const existing = findForward(model(), scope, port);
  if (existing?.status === "active") {
    flash(scope, port);
    return Promise.resolve(existing);
  }
  const key = `${scope}\n${port}`;
  const running = inflight.get(key);
  if (running) return running;
  const run = requestForward(env, scope, port).finally(() =>
    inflight.delete(key),
  );
  inflight.set(key, run);
  return run;
}

// UI-3 click (FL-7): forwards the shown offer and opens the Mac address.
export async function acceptOffer(env: WorkspaceEnv | null): Promise<void> {
  const ssh = sshEnv(env);
  const offer = newestOffer(model(), portsScope(ssh));
  if (!ssh || !offer || offer.working) return;
  const forward = await ensureForward(ssh, offer.port);
  if (forward) host.openPreview(macUrl(forward.localPort));
}

export function dismissOffer(env: WorkspaceEnv | null): void {
  const offer = newestOffer(model(), portsScope(env));
  if (!offer || offer.working) return;
  commit({ ...model(), offers: model().offers.filter((o) => o !== offer) });
}

// UI-8 (FL-10): returns the field's error text, or null. Opens nothing.
export async function forwardPortInput(
  env: WorkspaceEnv | null,
  raw: string,
): Promise<string | null> {
  const ssh = sshEnv(env);
  const input = parsePortInput(raw);
  if (input.kind === "invalid") return input.message;
  if (input.kind === "port" && ssh) await ensureForward(ssh, input.port);
  return null;
}

// FL-8: a loopback address clicked in this SSH pane, path and query kept.
// Ports below 1024 are fine here (BR-11).
export async function openLoopbackAddress(
  env: WorkspaceEnv | null,
  text: string,
): Promise<boolean> {
  const ssh = sshEnv(env);
  const address = parseLoopbackAddress(text);
  if (!ssh || !address) return false;
  const forward = await ensureForward(ssh, address.port);
  if (forward) host.openPreview(macUrlFor(address, forward.localPort));
  return forward !== null;
}

// UI-7 "Retry" (TR-12, EP-11).
export async function retryForward(
  env: WorkspaceEnv | null,
  port: number,
): Promise<void> {
  const ssh = sshEnv(env);
  if (ssh) await ensureForward(ssh, port);
}

// UI-7 "Stop" (TR-10, TR-13).
export async function stopForward(
  env: WorkspaceEnv | null,
  port: number,
): Promise<void> {
  const ssh = sshEnv(env);
  if (!ssh) return;
  const scope = workspaceScopeKey(ssh);
  try {
    await invoke("ssh_port_stop", { host: ssh.host, remotePort: port });
    changed(scope);
    commit(forwardStopped(model(), scope, port));
  } catch (err) {
    toast.error(stopFailedText(port, err));
  }
}

// UI-7 "Open": the Mac address of an active forward in the preview tab.
export function openForwardInPreview(
  env: WorkspaceEnv | null,
  port: number,
): void {
  const scope = portsScope(env);
  const forward = scope === null ? null : findForward(model(), scope, port);
  if (forward?.status === "active") host.openPreview(macUrl(forward.localPort));
}
