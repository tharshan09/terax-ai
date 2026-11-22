import { IS_WINDOWS } from "@/lib/platform";
import {
  browserNoticeConfirmed,
  confirmBrowserNotice,
} from "@/modules/settings/store";
import {
  currentWorkspaceScopeKey,
  type WorkspaceEnv,
  workspaceScopeKey,
} from "@/modules/workspace";
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
  type BrowserView,
  chromeKey,
  chromeOf,
  chromeProbeEnded,
  chromeProbeStarted,
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
  type GuidePorts,
  guidePorts,
  HIGHLIGHT_MS,
  highlight,
  movedPortText,
  needsChromeProbe,
  newestOffer,
  type PortForward,
  type PortsModel,
  parsePortInput,
  startForwarding,
  stopFailedText,
  viewBrowserFailedText,
  viewOutcome,
} from "./ports";
import { browserViewAvailable, setPortsListOpen } from "./portsList";

type SshEnv = Extract<WorkspaceEnv, { kind: "ssh" }>;

// Wired by the app shell, so the store opens tabs without importing it.
export type PortsHost = {
  openPreview: (url: string) => void;
};

let host: PortsHost = { openPreview: () => {} };

export function configurePorts(next: PortsHost): void {
  host = next;
}

// Memory only: forwards and Chrome marks never reach the settings store.
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
    if (browserViewAvailable() && needsChromeProbe(model(), scope, forward))
      probeChrome(env, scope, forward);
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

let probeRuns = 0;

// Never awaited: the row is there before the answer, the mark follows.
function probeChrome(env: SshEnv, scope: string, forward: PortForward): void {
  const run = ++probeRuns;
  commit(chromeProbeStarted(model(), scope, forward, run));
  invoke<boolean>("ssh_port_chrome", {
    host: env.host,
    remotePort: forward.remotePort,
  }).then(
    (found) =>
      commit(
        chromeProbeEnded(
          model(),
          scope,
          forward.remotePort,
          run,
          found ? "chrome" : "none",
        ),
      ),
    () =>
      commit(
        chromeProbeEnded(model(), scope, forward.remotePort, run, "failed"),
      ),
  );
}

// Asks liveness, then each active forward without an answer whether a Chrome
// is behind it.
export async function portsListOpened(env: WorkspaceEnv | null): Promise<void> {
  await refreshForwards(env);
  const ssh = sshEnv(env);
  if (!ssh || !browserViewAvailable()) return;
  const scope = workspaceScopeKey(ssh);
  for (const forward of forwardsOf(model(), scope))
    if (needsChromeProbe(model(), scope, forward))
      probeChrome(ssh, scope, forward);
}

export type BrowserDialog =
  | { kind: "notice"; scope: string; server: string }
  | ({ kind: "guide"; scope: string; server: string } & GuidePorts);

export type BrowserViewState = {
  dialog: BrowserDialog | null;
  // chromeKey of the forward whose view is being opened.
  opening: string | null;
};

export const useBrowserViewStore = create<BrowserViewState>(() => ({
  dialog: null,
  opening: null,
}));

let noticeAnswer: ((confirmed: boolean) => void) | null = null;
// One view request at a time; clicks meanwhile are ignored.
let viewing = false;

function serverName(env: SshEnv): string {
  return env.label ?? env.host;
}

function setDialog(dialog: BrowserDialog | null): void {
  useBrowserViewStore.setState({ dialog });
}

function askNotice(scope: string, server: string): Promise<boolean> {
  noticeAnswer?.(false);
  return new Promise((resolve) => {
    noticeAnswer = resolve;
    setDialog({ kind: "notice", scope, server });
  });
}

export function answerBrowserNotice(confirmed: boolean): void {
  const answer = noticeAnswer;
  noticeAnswer = null;
  if (useBrowserViewStore.getState().dialog?.kind === "notice") setDialog(null);
  answer?.(confirmed);
}

// A pending notice counts as Cancel.
export function closeBrowserDialog(scope: string): void {
  const dialog = useBrowserViewStore.getState().dialog;
  if (dialog?.scope !== scope) return;
  if (dialog.kind === "notice") answerBrowserNotice(false);
  else setDialog(null);
}

// Opens the list again when it was closed while the view was being checked;
// a guide for a server the workspace left is dropped.
function showGuide(env: SshEnv, scope: string, ports: GuidePorts): void {
  if (currentWorkspaceScopeKey() !== scope) return;
  setDialog({ kind: "guide", scope, server: serverName(env), ...ports });
  setPortsListOpen(true);
}

export function openBrowserGuide(env: WorkspaceEnv | null): void {
  const ssh = sshEnv(env);
  if (!ssh || !browserViewAvailable()) return;
  const scope = workspaceScopeKey(ssh);
  showGuide(ssh, scope, guidePorts(model(), scope));
}

function activeChrome(scope: string, port: number): PortForward | null {
  const forward = findForward(model(), scope, port);
  return forward?.status === "active" &&
    chromeOf(model(), scope, forward) === "chrome"
    ? forward
    : null;
}

// Whether the answer still belongs to what the user sees: the workspace is on
// that server and the server port is forwarded to the same Mac port.
function stillForwarded(
  scope: string,
  remotePort: number,
  localPort: number,
): boolean {
  if (currentWorkspaceScopeKey() !== scope) return false;
  const forward = findForward(model(), scope, remotePort);
  return forward?.status === "active" && forward.localPort === localPort;
}

// Notice once per server, then the backend checks Chrome on this Mac, the
// page and its origin, and opens the view; the answer shows a toast or the
// guide only while the forward is still the one it was asked for.
export async function viewBrowser(
  env: WorkspaceEnv | null,
  port: number,
): Promise<void> {
  const ssh = sshEnv(env);
  if (!ssh || !browserViewAvailable() || viewing) return;
  const scope = workspaceScopeKey(ssh);
  if (!activeChrome(scope, port)) return;
  viewing = true;
  try {
    const confirmed = await browserNoticeConfirmed(scope).catch(() => false);
    if (!confirmed) {
      if (!(await askNotice(scope, serverName(ssh)))) return;
      await confirmBrowserNotice(scope).catch(() => {});
    }
    const forward = activeChrome(scope, port);
    if (!forward) return;
    useBrowserViewStore.setState({ opening: chromeKey(scope, port) });
    await openViewer(ssh, scope, forward);
  } finally {
    viewing = false;
    useBrowserViewStore.setState({ opening: null });
  }
}

async function openViewer(
  env: SshEnv,
  scope: string,
  forward: PortForward,
): Promise<void> {
  let view: BrowserView;
  try {
    view = await invoke<BrowserView>("ssh_port_view_browser", {
      host: env.host,
      remotePort: forward.remotePort,
    });
  } catch (err) {
    if (!stillForwarded(scope, forward.remotePort, forward.localPort)) return;
    toast.error(viewBrowserFailedText(err));
    void refreshForwards(env);
    return;
  }
  if (!stillForwarded(scope, forward.remotePort, view.localPort)) return;
  const outcome = viewOutcome(view);
  switch (outcome.kind) {
    case "done":
      return;
    case "refresh":
      void refreshForwards(env);
      return;
    case "toast":
      if (outcome.error) toast.error(outcome.text);
      else toast(outcome.text);
      return;
    case "guide":
      showGuide(env, scope, {
        remotePort: forward.remotePort,
        localPort: view.localPort,
      });
  }
}
