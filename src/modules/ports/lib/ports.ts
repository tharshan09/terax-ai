import {
  type DetectedPort,
  macAddress,
  macOrigin,
  macUrl,
  validPort,
} from "./portDetect";

export type ForwardStatus = "active" | "disconnected";

// Shape of `ports::PortForward` (serde camelCase).
export type PortForward = {
  remotePort: number;
  localPort: number;
  status: ForwardStatus;
};

// Shape of `ports::chrome::BrowserView` (serde camelCase).
export type BrowserViewStatus =
  | "opened"
  | "chrome_missing"
  | "origin_refused"
  | "no_page"
  | "unreachable"
  | "forward_gone"
  | "open_failed";

export type BrowserView = {
  status: BrowserViewStatus;
  remotePort: number;
  localPort: number;
  reason: string | null;
};

export type PortOffer = {
  scope: string;
  host: string;
  leafId: number;
  port: number;
  working: boolean;
};

// Whether a Chrome answers behind a forward. It belongs to one Mac port: a
// forward that moved or ended takes it along.
export type ChromeProbe = "probing" | "chrome" | "none" | "failed";

export type ChromeEntry = {
  scope: string;
  remotePort: number;
  localPort: number;
  probe: ChromeProbe;
  run: number;
};

export type PortsModel = {
  // Per workspaceScopeKey, ascending by remotePort.
  forwards: Readonly<Record<string, readonly PortForward[]>>;
  // Per chromeKey(scope, remotePort); the forwards are replaced on every
  // refresh, so the result lives beside them.
  chrome: Readonly<Record<string, ChromeEntry>>;
  // Oldest first.
  offers: readonly PortOffer[];
  // Ports with a forward request in flight, per scope.
  pending: Readonly<Record<string, readonly number[]>>;
  highlighted: { scope: string; port: number } | null;
};

export const EMPTY_PORTS: PortsModel = {
  forwards: {},
  chrome: {},
  offers: [],
  pending: {},
  highlighted: null,
};

export const PORT_INPUT_ERROR = "Enter a port between 1 and 65535.";
export const HIGHLIGHT_MS = 2000;
const LOWEST_OFFERED_PORT = 1024;
// `ss -tan` and `netstat` list every ephemeral peer as `127.0.0.1:4xxxx`; a dev
// server up there prints its URL with a scheme.
const LOWEST_EPHEMERAL_PORT = 32768;
export const MAX_OFFERS_PER_SERVER = 5;

export type PortInput =
  | { kind: "empty" }
  | { kind: "invalid"; message: string }
  | { kind: "port"; port: number };

export function parsePortInput(raw: string): PortInput {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };
  const port = /^\d{1,5}$/.test(text) ? Number(text) : 0;
  return validPort(port)
    ? { kind: "port", port }
    : { kind: "invalid", message: PORT_INPUT_ERROR };
}

export function forwardFailedText(port: number, reason: unknown): string {
  return `Could not forward port ${port}: ${String(reason)}`;
}

export function stopFailedText(port: number, reason: unknown): string {
  return `Could not stop port ${port}: ${String(reason)}`;
}

// Success toast, only when the Mac port differs.
export function movedPortText(forward: PortForward): string | null {
  return forward.localPort === forward.remotePort
    ? null
    : `Port ${forward.remotePort} is available at ${macAddress(forward.localPort)}`;
}

export type PortPhase =
  | "unknown"
  | "offered"
  | "forwarding"
  | "active"
  | "disconnected";

export function forwardsOf(
  model: PortsModel,
  scope: string,
): readonly PortForward[] {
  return model.forwards[scope] ?? [];
}

export function findForward(
  model: PortsModel,
  scope: string,
  port: number,
): PortForward | null {
  return forwardsOf(model, scope).find((f) => f.remotePort === port) ?? null;
}

export function isPending(
  model: PortsModel,
  scope: string,
  port: number,
): boolean {
  return (model.pending[scope] ?? []).includes(port);
}

export function findOffer(
  model: PortsModel,
  scope: string,
  port: number,
): PortOffer | null {
  return model.offers.find((o) => o.scope === scope && o.port === port) ?? null;
}

export function portPhase(
  model: PortsModel,
  scope: string,
  port: number,
): PortPhase {
  if (isPending(model, scope, port)) return "forwarding";
  const forward = findForward(model, scope, port);
  if (forward) return forward.status;
  return findOffer(model, scope, port) ? "offered" : "unknown";
}

// Ports below 1024 are system services, not dev servers; ephemeral ones only
// count when written as a URL.
export function offerablePort(found: DetectedPort): boolean {
  return (
    found.port >= LOWEST_OFFERED_PORT &&
    (found.port < LOWEST_EPHEMERAL_PORT || found.scheme)
  );
}

// One offer per server and port, none for a port that is forwarded or being
// forwarded.
export function canOffer(
  model: PortsModel,
  scope: string,
  port: number,
): boolean {
  return (
    port >= LOWEST_OFFERED_PORT && portPhase(model, scope, port) === "unknown"
  );
}

function takenPorts(model: PortsModel, scope: string): Set<number> {
  const taken = new Set<number>(model.pending[scope]);
  for (const o of model.offers) if (o.scope === scope) taken.add(o.port);
  for (const f of forwardsOf(model, scope)) taken.add(f.remotePort);
  return taken;
}

// Newest first, the server keeps MAX_OFFERS_PER_SERVER; one being accepted
// always stays.
function capOffers(offers: readonly PortOffer[], scope: string): PortOffer[] {
  const kept: PortOffer[] = [];
  let own = 0;
  for (let i = offers.length - 1; i >= 0; i--) {
    const o = offers[i];
    if (o.scope === scope) {
      if (own >= MAX_OFFERS_PER_SERVER && !o.working) continue;
      own++;
    }
    kept.push(o);
  }
  return kept.reverse();
}

// The ports of one chunk in one pass over the model, so a flood of output
// costs linear time and never more than the capped offers in memory.
export function addOffers(
  model: PortsModel,
  origin: Omit<PortOffer, "working" | "port">,
  found: readonly DetectedPort[],
): PortsModel {
  if (found.length === 0) return model;
  const taken = takenPorts(model, origin.scope);
  const added: PortOffer[] = [];
  for (const f of found) {
    if (!offerablePort(f) || taken.has(f.port)) continue;
    taken.add(f.port);
    added.push({ ...origin, port: f.port, working: false });
    if (added.length > MAX_OFFERS_PER_SERVER) added.shift();
  }
  if (added.length === 0) return model;
  return {
    ...model,
    offers: capOffers([...model.offers, ...added], origin.scope),
  };
}

export function addOffer(
  model: PortsModel,
  offer: Omit<PortOffer, "working">,
): PortsModel {
  const { port, ...origin } = offer;
  return addOffers(model, origin, [{ port, scheme: false }]);
}

export function removeOffer(
  model: PortsModel,
  scope: string,
  port: number,
): PortsModel {
  const offers = model.offers.filter(
    (o) => !(o.scope === scope && o.port === port),
  );
  return offers.length === model.offers.length ? model : { ...model, offers };
}

export function dropPaneOffers(model: PortsModel, leafId: number): PortsModel {
  const offers = model.offers.filter((o) => o.leafId !== leafId);
  return offers.length === model.offers.length ? model : { ...model, offers };
}

function setOfferWorking(
  model: PortsModel,
  scope: string,
  port: number,
  working: boolean,
): PortsModel {
  return {
    ...model,
    offers: model.offers.map((o) =>
      o.scope === scope && o.port === port ? { ...o, working } : o,
    ),
  };
}

export function startForwarding(
  model: PortsModel,
  scope: string,
  port: number,
): PortsModel {
  const pending = model.pending[scope] ?? [];
  const next = pending.includes(port)
    ? model
    : { ...model, pending: { ...model.pending, [scope]: [...pending, port] } };
  return setOfferWorking(next, scope, port, true);
}

function endForwarding(
  model: PortsModel,
  scope: string,
  port: number,
): PortsModel {
  const pending = (model.pending[scope] ?? []).filter((p) => p !== port);
  const rest = { ...model.pending };
  if (pending.length === 0) delete rest[scope];
  else rest[scope] = pending;
  return { ...model, pending: rest };
}

function withForward(
  model: PortsModel,
  scope: string,
  forward: PortForward,
): PortsModel {
  const list = forwardsOf(model, scope).filter(
    (f) => f.remotePort !== forward.remotePort,
  );
  list.push(forward);
  list.sort((a, b) => a.remotePort - b.remotePort);
  return { ...model, forwards: { ...model.forwards, [scope]: list } };
}

// The row appears or turns active and the offer is gone.
export function forwardSucceeded(
  model: PortsModel,
  scope: string,
  forward: PortForward,
): PortsModel {
  const done = endForwarding(model, scope, forward.remotePort);
  return removeOffer(
    withForward(dropChrome(done, scope, forward.remotePort), scope, forward),
    scope,
    forward.remotePort,
  );
}

// No new row and no offer; an existing row keeps its state.
export function forwardFailed(
  model: PortsModel,
  scope: string,
  port: number,
): PortsModel {
  return removeOffer(endForwarding(model, scope, port), scope, port);
}

export function forwardStopped(
  model: PortsModel,
  scope: string,
  port: number,
): PortsModel {
  const list = forwardsOf(model, scope);
  const next = list.filter((f) => f.remotePort !== port);
  if (next.length === list.length) return dropChrome(model, scope, port);
  const forwards = { ...model.forwards };
  if (next.length === 0) delete forwards[scope];
  else forwards[scope] = next;
  const highlighted =
    model.highlighted?.scope === scope && model.highlighted.port === port
      ? null
      : model.highlighted;
  return dropChrome({ ...model, forwards, highlighted }, scope, port);
}

export function forwardsListed(
  model: PortsModel,
  scope: string,
  list: readonly PortForward[],
): PortsModel {
  const forwards = { ...model.forwards };
  if (list.length === 0) delete forwards[scope];
  else forwards[scope] = [...list].sort((a, b) => a.remotePort - b.remotePort);
  const offers = model.offers.filter(
    (o) => o.scope !== scope || !list.some((f) => f.remotePort === o.port),
  );
  return keepListedChrome({ ...model, forwards, offers }, scope, list);
}

export function chromeKey(scope: string, remotePort: number): string {
  return `${scope}\n${remotePort}`;
}

function dropChrome(
  model: PortsModel,
  scope: string,
  remotePort: number,
): PortsModel {
  const key = chromeKey(scope, remotePort);
  if (!(key in model.chrome)) return model;
  const chrome = { ...model.chrome };
  delete chrome[key];
  return { ...model, chrome };
}

function keepListedChrome(
  model: PortsModel,
  scope: string,
  list: readonly PortForward[],
): PortsModel {
  let chrome: Record<string, ChromeEntry> | null = null;
  for (const [key, entry] of Object.entries(model.chrome)) {
    if (entry.scope !== scope) continue;
    const listed = list.some(
      (f) =>
        f.remotePort === entry.remotePort && f.localPort === entry.localPort,
    );
    if (listed) continue;
    chrome ??= { ...model.chrome };
    delete chrome[key];
  }
  return chrome ? { ...model, chrome } : model;
}

// Null until asked, and for an entry left over from another Mac port.
export function chromeOf(
  model: PortsModel,
  scope: string,
  forward: PortForward,
): ChromeProbe | null {
  const entry = model.chrome[chromeKey(scope, forward.remotePort)];
  return entry?.localPort === forward.localPort ? entry.probe : null;
}

// At most once per forward; only a failed ask is repeated.
export function needsChromeProbe(
  model: PortsModel,
  scope: string,
  forward: PortForward,
): boolean {
  if (forward.status !== "active") return false;
  const probe = chromeOf(model, scope, forward);
  return probe === null || probe === "failed";
}

export function chromeProbeStarted(
  model: PortsModel,
  scope: string,
  forward: PortForward,
  run: number,
): PortsModel {
  return {
    ...model,
    chrome: {
      ...model.chrome,
      [chromeKey(scope, forward.remotePort)]: {
        scope,
        remotePort: forward.remotePort,
        localPort: forward.localPort,
        probe: "probing",
        run,
      },
    },
  };
}

// An answer for a forward that ended or was asked again meanwhile is dropped.
export function chromeProbeEnded(
  model: PortsModel,
  scope: string,
  remotePort: number,
  run: number,
  probe: Exclude<ChromeProbe, "probing">,
): PortsModel {
  const key = chromeKey(scope, remotePort);
  const entry = model.chrome[key];
  if (entry?.run !== run) return model;
  return { ...model, chrome: { ...model.chrome, [key]: { ...entry, probe } } };
}

export function highlight(
  model: PortsModel,
  scope: string,
  port: number,
): PortsModel {
  return { ...model, highlighted: { scope, port } };
}

export function clearHighlight(
  model: PortsModel,
  scope: string,
  port: number,
): PortsModel {
  const h = model.highlighted;
  return h?.scope === scope && h.port === port
    ? { ...model, highlighted: null }
    : model;
}

export type OfferView = {
  port: number;
  label: string;
  // "+N" for the other offers of this server, null when there are none.
  more: string | null;
  working: boolean;
};

// The status bar shows the newest offer of the active server.
export function offerView(
  model: PortsModel,
  scope: string | null,
): OfferView | null {
  if (scope === null) return null;
  const own = model.offers.filter((o) => o.scope === scope);
  const newest = own[own.length - 1];
  if (!newest) return null;
  return {
    port: newest.port,
    label: `Forward port ${newest.port}?`,
    more: own.length > 1 ? `+${own.length - 1}` : null,
    working: newest.working,
  };
}

export function newestOffer(
  model: PortsModel,
  scope: string | null,
): PortOffer | null {
  if (scope === null) return null;
  for (let i = model.offers.length - 1; i >= 0; i--)
    if (model.offers[i].scope === scope) return model.offers[i];
  return null;
}

export type RowAction =
  | "open"
  | "openInBrowser"
  | "copy"
  | "viewBrowser"
  | "retry"
  | "stop";

export type PortRowView = {
  remotePort: number;
  localPort: number;
  label: string;
  address: string;
  url: string;
  // The Mac port was taken, so it differs and is shown emphasized.
  moved: boolean;
  status: ForwardStatus;
  highlighted: boolean;
  working: boolean;
  // Null where the browser view is not offered or the forward was not asked yet.
  chrome: ChromeProbe | null;
  // The "Chrome" mark, only on an active row.
  chromeMark: boolean;
  actions: readonly RowAction[];
  // Shown but not usable, as View browser on a disconnected Chrome row.
  unavailable: readonly RowAction[];
};

const ACTIVE_ACTIONS: readonly RowAction[] = [
  "open",
  "openInBrowser",
  "copy",
  "stop",
];
const CHROME_ACTIONS: readonly RowAction[] = [
  "open",
  "openInBrowser",
  "copy",
  "viewBrowser",
  "stop",
];
const DISCONNECTED_ACTIONS: readonly RowAction[] = ["retry", "stop"];
const DISCONNECTED_CHROME_ACTIONS: readonly RowAction[] = [
  "retry",
  "stop",
  "viewBrowser",
];
const NO_ACTIONS: readonly RowAction[] = [];
const VIEW_BROWSER: readonly RowAction[] = ["viewBrowser"];

function rowActions(
  status: ForwardStatus,
  chrome: boolean,
): Pick<PortRowView, "actions" | "unavailable"> {
  if (status === "active")
    return {
      actions: chrome ? CHROME_ACTIONS : ACTIVE_ACTIONS,
      unavailable: NO_ACTIONS,
    };
  return chrome
    ? { actions: DISCONNECTED_CHROME_ACTIONS, unavailable: VIEW_BROWSER }
    : { actions: DISCONNECTED_ACTIONS, unavailable: NO_ACTIONS };
}

// `browser`: the platform offers the remote browser view.
export function rowViews(
  model: PortsModel,
  scope: string | null,
  browser = false,
): PortRowView[] {
  if (scope === null) return [];
  return forwardsOf(model, scope).map((f) => {
    const chrome = browser ? chromeOf(model, scope, f) : null;
    const isChrome = chrome === "chrome";
    return {
      remotePort: f.remotePort,
      localPort: f.localPort,
      label: `${f.remotePort} -> ${macAddress(f.localPort)}`,
      address: macAddress(f.localPort),
      url: macUrl(f.localPort),
      moved: f.localPort !== f.remotePort,
      status: f.status,
      highlighted:
        model.highlighted?.scope === scope &&
        model.highlighted.port === f.remotePort,
      working: isPending(model, scope, f.remotePort),
      chrome,
      chromeMark: isChrome && f.status === "active",
      ...rowActions(f.status, isChrome),
    };
  });
}

export const CHROME_REQUIRED_TEXT =
  "Google Chrome is required on this Mac to view the remote browser.";
export const NO_PAGE_TEXT = "No page is open in the remote browser.";

export function viewBrowserFailedText(reason: unknown): string {
  return `Could not view the remote browser: ${String(reason)}`;
}

export function openChromeFailedText(reason: string | null): string {
  return reason
    ? `Could not open Google Chrome: ${reason}`
    : "Could not open Google Chrome.";
}

export function browserNoticeText(server: string): string {
  return `Anyone who can reach this port can control the browser on ${server}, including the accounts signed in there. Terax keeps it reachable from this Mac only.`;
}

export type ViewOutcome =
  | { kind: "done" }
  | { kind: "refresh" }
  | { kind: "guide" }
  | { kind: "toast"; text: string; error: boolean };

// The guide explains the server setup, so it answers only what the server
// did; a failed open on this Mac names its own reason instead.
export function viewOutcome(view: BrowserView): ViewOutcome {
  switch (view.status) {
    case "opened":
      return { kind: "done" };
    case "forward_gone":
      return { kind: "refresh" };
    case "chrome_missing":
      return { kind: "toast", text: CHROME_REQUIRED_TEXT, error: true };
    case "no_page":
      return { kind: "toast", text: NO_PAGE_TEXT, error: false };
    case "open_failed":
      return {
        kind: "toast",
        text: openChromeFailedText(view.reason),
        error: true,
      };
    case "origin_refused":
    case "unreachable":
      return { kind: "guide" };
  }
}

// Chrome's usual debugging port, for a guide without a matching forward.
export const DEFAULT_DEBUG_PORT = 9222;

export type GuidePorts = { remotePort: number; localPort: number };

// A Chrome row first, then a forward of the usual port, else that port.
export function guidePorts(model: PortsModel, scope: string): GuidePorts {
  const list = forwardsOf(model, scope);
  const found =
    list.find((f) => chromeOf(model, scope, f) === "chrome") ??
    list.find((f) => f.remotePort === DEFAULT_DEBUG_PORT);
  return found
    ? { remotePort: found.remotePort, localPort: found.localPort }
    : { remotePort: DEFAULT_DEBUG_PORT, localPort: DEFAULT_DEBUG_PORT };
}

export type GuideStep = {
  text: string;
  // Set where the command depends on the server's setup.
  example: string | null;
  command: string | null;
};

export type BrowserGuide = {
  title: string;
  intro: string;
  steps: readonly GuideStep[];
  macPortNote: string;
  warning: string;
};

export function browserGuide(
  server: string,
  { remotePort, localPort }: GuidePorts,
): BrowserGuide {
  const origin = macOrigin(localPort);
  return {
    title: "Set up browser view",
    intro: `Run these steps on ${server}. Terax changes nothing on the server.`,
    steps: [
      {
        text: `Start Chrome on the server with remote debugging. The program name depends on the system (google-chrome, chromium or Chrome for Testing). Chrome refuses the view without --remote-allow-origins, and it must be exactly ${origin}, not 127.0.0.1.`,
        example: "Example:",
        command: `google-chrome --headless=new --remote-debugging-port=${remotePort} --user-data-dir="$HOME/.cache/terax-remote-chrome" --remote-allow-origins=${origin}`,
      },
      {
        text: "Attach the Chrome DevTools MCP of your coding agent to this Chrome. The setup can differ on your server.",
        example: "Example for Claude Code:",
        command: `claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:${remotePort}`,
      },
      {
        text: "Check that the debugging port listens on the server only (127.0.0.1 or [::1]).",
        example: null,
        command: `ss -ltn 'sport = :${remotePort}'`,
      },
      {
        text: `In Terax, forward port ${remotePort}. If it is already forwarded, stop it and forward it again.`,
        example: null,
        command: null,
      },
    ],
    macPortNote:
      "If the Mac port changes, for example because the number was taken on this Mac, restart Chrome on the server with the new origin.",
    warning:
      "Keep the debugging port reachable on the server only. Never start Chrome with --remote-debugging-address=0.0.0.0 or open the port in a firewall.",
  };
}

export type PortsSummary = {
  count: number;
  // At least one forward is disconnected and needs a retry.
  attention: boolean;
};

export function portsSummary(
  model: PortsModel,
  scope: string | null,
): PortsSummary {
  const list = scope === null ? [] : forwardsOf(model, scope);
  return {
    count: list.length,
    attention: list.some((f) => f.status === "disconnected"),
  };
}
