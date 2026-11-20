import { validPort } from "./portDetect";

export type ForwardStatus = "active" | "disconnected";

// Shape of `ports::PortForward` (serde camelCase).
export type PortForward = {
  remotePort: number;
  localPort: number;
  status: ForwardStatus;
};

export type PortOffer = {
  scope: string;
  host: string;
  leafId: number;
  port: number;
  working: boolean;
};

export type PortsModel = {
  // Per workspaceScopeKey, ascending by remotePort.
  forwards: Readonly<Record<string, readonly PortForward[]>>;
  // Oldest first.
  offers: readonly PortOffer[];
  // Ports with a forward request in flight, per scope.
  pending: Readonly<Record<string, readonly number[]>>;
  highlighted: { scope: string; port: number } | null;
};

export const EMPTY_PORTS: PortsModel = {
  forwards: {},
  offers: [],
  pending: {},
  highlighted: null,
};

export const PORT_INPUT_ERROR = "Enter a port between 1 and 65535.";
export const HIGHLIGHT_MS = 2000;
const LOWEST_OFFERED_PORT = 1024;

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

// Success toast, only when the Mac port differs (BR-14).
export function movedPortText(forward: PortForward): string | null {
  return forward.localPort === forward.remotePort
    ? null
    : `Port ${forward.remotePort} is available at localhost:${forward.localPort}`;
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

// BR-11, BR-12: one offer per server and port, none for a port below 1024 or
// one that is forwarded or being forwarded.
export function canOffer(
  model: PortsModel,
  scope: string,
  port: number,
): boolean {
  return (
    port >= LOWEST_OFFERED_PORT && portPhase(model, scope, port) === "unknown"
  );
}

export function addOffer(
  model: PortsModel,
  offer: Omit<PortOffer, "working">,
): PortsModel {
  if (!canOffer(model, offer.scope, offer.port)) return model;
  return { ...model, offers: [...model.offers, { ...offer, working: false }] };
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

// TR-8, TR-12: the row appears or turns active and the offer is gone.
export function forwardSucceeded(
  model: PortsModel,
  scope: string,
  forward: PortForward,
): PortsModel {
  const done = endForwarding(model, scope, forward.remotePort);
  return removeOffer(
    withForward(done, scope, forward),
    scope,
    forward.remotePort,
  );
}

// TR-9, EP-11: no new row and no offer; an existing row keeps its state.
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
  if (next.length === list.length) return model;
  const forwards = { ...model.forwards };
  if (next.length === 0) delete forwards[scope];
  else forwards[scope] = next;
  const highlighted =
    model.highlighted?.scope === scope && model.highlighted.port === port
      ? null
      : model.highlighted;
  return { ...model, forwards, highlighted };
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
  return { ...model, forwards, offers };
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

// UI-3: the newest offer of the active server.
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

export type RowAction = "open" | "openInBrowser" | "copy" | "retry" | "stop";

export type PortRowView = {
  remotePort: number;
  localPort: number;
  label: string;
  address: string;
  url: string;
  // BR-14: the Mac port differs and is shown emphasized.
  moved: boolean;
  status: ForwardStatus;
  highlighted: boolean;
  working: boolean;
  actions: readonly RowAction[];
};

const ACTIVE_ACTIONS: readonly RowAction[] = [
  "open",
  "openInBrowser",
  "copy",
  "stop",
];
const DISCONNECTED_ACTIONS: readonly RowAction[] = ["retry", "stop"];

export function rowViews(
  model: PortsModel,
  scope: string | null,
): PortRowView[] {
  if (scope === null) return [];
  return forwardsOf(model, scope).map((f) => ({
    remotePort: f.remotePort,
    localPort: f.localPort,
    label: `${f.remotePort} -> localhost:${f.localPort}`,
    address: `localhost:${f.localPort}`,
    url: `http://localhost:${f.localPort}`,
    moved: f.localPort !== f.remotePort,
    status: f.status,
    highlighted:
      model.highlighted?.scope === scope &&
      model.highlighted.port === f.remotePort,
    working: isPending(model, scope, f.remotePort),
    actions: f.status === "active" ? ACTIVE_ACTIONS : DISCONNECTED_ACTIONS,
  }));
}

export type PortsSummary = {
  count: number;
  // UI-4 `attention`: at least one forward is disconnected.
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
