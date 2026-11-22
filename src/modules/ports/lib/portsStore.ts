import { IS_WINDOWS } from "@/lib/platform";
import { type WorkspaceEnv, workspaceScopeKey } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { create } from "zustand";
import {
  type DetectedPort,
  macUrl,
  macUrlFor,
  PortDetector,
  parseLoopbackLink,
} from "./portDetect";
import {
  addOffers,
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

// Memory only: nothing here reaches the settings store.
export const usePortsStore = create<PortsModel>(() => EMPTY_PORTS);

// Bounds what a pane remembers; each entry is a click, so this is never hit
// in normal use.
const DISMISSED_PER_PANE = 64;

const detectors = new Map<number, PortDetector>();
// Ports whose offer this pane showed and the user dismissed: they stay away
// until the pane closes. Everything else may come back on new output.
const dismissedByPane = new Map<number, Set<number>>();
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
  const found = detector.feed(bytes);
  if (found.length > 0) offerPorts(leafId, ssh, found);
}

function offerPorts(
  leafId: number,
  env: SshEnv,
  found: readonly DetectedPort[],
): void {
  const dismissed = dismissedByPane.get(leafId);
  const fresh = dismissed ? found.filter((f) => !dismissed.has(f.port)) : found;
  commit(
    addOffers(
      model(),
      { scope: workspaceScopeKey(env), host: env.host, leafId },
      fresh,
    ),
  );
}

function rememberDismissed(leafId: number, port: number): void {
  let dismissed = dismissedByPane.get(leafId);
  if (!dismissed) {
    dismissed = new Set();
    dismissedByPane.set(leafId, dismissed);
  }
  dismissed.add(port);
  if (dismissed.size > DISMISSED_PER_PANE) {
    const [oldest] = dismissed;
    dismissed.delete(oldest);
  }
}

// Pane closed: its offers go, the server's forwards stay.
export function paneClosed(leafId: number): void {
  detectors.delete(leafId);
  dismissedByPane.delete(leafId);
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

// An active forward is reused and its row highlighted; a disconnected one is
// forwarded again; concurrent requests for one port share a call.
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

// Clicking the status bar offer forwards it and opens the Mac address.
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
  rememberDismissed(offer.leafId, offer.port);
  commit({ ...model(), offers: model().offers.filter((o) => o !== offer) });
}

// `error` is the field's text; `forwarded` tells the field to clear, so a
// failed forward keeps the number for another try. Opens nothing.
export type PortInputResult = { error: string | null; forwarded: boolean };

export async function forwardPortInput(
  env: WorkspaceEnv | null,
  raw: string,
): Promise<PortInputResult> {
  const ssh = sshEnv(env);
  const input = parsePortInput(raw);
  if (input.kind === "invalid")
    return { error: input.message, forwarded: false };
  if (input.kind === "empty" || !ssh) return { error: null, forwarded: false };
  const forward = await ensureForward(ssh, input.port);
  return { error: null, forwarded: forward !== null };
}

// A loopback link clicked in this SSH pane, path and query kept. Any port goes
// here, below 1024 too: the user asked for it.
export async function openLoopbackAddress(
  env: WorkspaceEnv | null,
  text: string,
): Promise<boolean> {
  const ssh = sshEnv(env);
  const address = parseLoopbackLink(text);
  if (!ssh || !address) return false;
  const forward = await ensureForward(ssh, address.port);
  if (forward) host.openPreview(macUrlFor(address, forward.localPort));
  return forward !== null;
}

export async function retryForward(
  env: WorkspaceEnv | null,
  port: number,
): Promise<void> {
  const ssh = sshEnv(env);
  if (ssh) await ensureForward(ssh, port);
}

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

// The Mac address of an active forward in the preview tab.
export function openForwardInPreview(
  env: WorkspaceEnv | null,
  port: number,
): void {
  const scope = portsScope(env);
  const forward = scope === null ? null : findForward(model(), scope, port);
  if (forward?.status === "active") host.openPreview(macUrl(forward.localPort));
}
