/**
 * Catalog of every known status-bar widget. The code is the source of truth;
 * the persisted layout (see settings/store.ts `statusbarLayout`) only carries
 * user customization (order + per-widget visibility) and is merged against this
 * catalog on load, so widgets shipped later appear for existing users without
 * disturbing their saved order.
 */
export const STATUSBAR_WIDGETS = [
  "workspace-env",
  "cwd",
  "git-branch",
  "git-sync",
  "git-changes",
  "git-staged",
  "line-changes",
  "agent-status",
  "claude-model",
  "claude-context",
  "claude-cost",
  "private",
] as const;

export type StatusbarWidgetId = (typeof STATUSBAR_WIDGETS)[number];

export type StatusbarWidgetItem = { id: StatusbarWidgetId; visible: boolean };
export type StatusbarLayout = StatusbarWidgetItem[];

export const STATUSBAR_WIDGET_LABELS: Record<StatusbarWidgetId, string> = {
  "workspace-env": "Workspace",
  cwd: "Working directory",
  "git-branch": "Git branch",
  "git-sync": "Git sync",
  "git-changes": "Git changes",
  "git-staged": "Git staged",
  "line-changes": "Line changes",
  "agent-status": "Agent status",
  "claude-model": "Claude model",
  "claude-context": "Claude context",
  "claude-cost": "Claude cost",
  private: "Private mode",
};

// A widget can ship disabled-by-default while still being one click away.
const DEFAULT_HIDDEN: ReadonlySet<StatusbarWidgetId> = new Set([
  "git-changes",
  "git-staged",
]);

export const DEFAULT_STATUSBAR_LAYOUT: StatusbarLayout = STATUSBAR_WIDGETS.map(
  (id) => ({ id, visible: !DEFAULT_HIDDEN.has(id) }),
);

export function isStatusbarWidgetId(v: unknown): v is StatusbarWidgetId {
  return (
    typeof v === "string" &&
    (STATUSBAR_WIDGETS as readonly string[]).includes(v)
  );
}

/**
 * Normalize a stored layout: drop unknown/duplicate ids, default missing
 * visibility to shown, then append any catalog widget the saved layout has
 * never seen (at its default visibility). An empty/garbage result falls back
 * to the full default so the bar is never blank from corrupt data. An
 * all-hidden layout of real ids is a legitimate user choice and is preserved.
 */
export function coerceStatusbarLayout(stored: unknown): StatusbarLayout {
  if (!Array.isArray(stored)) return DEFAULT_STATUSBAR_LAYOUT;
  const seen = new Set<StatusbarWidgetId>();
  const out: StatusbarLayout = [];
  for (const it of stored) {
    if (!it || typeof it !== "object") continue;
    const id = (it as { id?: unknown }).id;
    if (!isStatusbarWidgetId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, visible: (it as { visible?: unknown }).visible !== false });
  }
  for (const { id, visible } of DEFAULT_STATUSBAR_LAYOUT) {
    if (!seen.has(id)) out.push({ id, visible });
  }
  return out.length ? out : DEFAULT_STATUSBAR_LAYOUT;
}

/** Move `fromId` to sit immediately before `toId`. Filter-then-splice avoids
 *  the classic double-splice off-by-one. */
export function moveWidget(
  layout: StatusbarLayout,
  fromId: StatusbarWidgetId,
  toId: StatusbarWidgetId,
): StatusbarLayout {
  if (fromId === toId) return layout;
  const item = layout.find((w) => w.id === fromId);
  if (!item) return layout;
  const next = layout.filter((w) => w.id !== fromId);
  const idx = next.findIndex((w) => w.id === toId);
  if (idx === -1) return layout;
  next.splice(idx, 0, item);
  return next;
}

/** Keyboard/touch reorder fallback: nudge a widget by `delta` positions. */
export function moveWidgetByDelta(
  layout: StatusbarLayout,
  id: StatusbarWidgetId,
  delta: number,
): StatusbarLayout {
  const idx = layout.findIndex((w) => w.id === id);
  if (idx === -1) return layout;
  const target = idx + delta;
  if (target < 0 || target >= layout.length) return layout;
  const next = layout.slice();
  const [item] = next.splice(idx, 1);
  next.splice(target, 0, item);
  return next;
}

export function setWidgetVisible(
  layout: StatusbarLayout,
  id: StatusbarWidgetId,
  visible: boolean,
): StatusbarLayout {
  let changed = false;
  const next = layout.map((w) => {
    if (w.id !== id || w.visible === visible) return w;
    changed = true;
    return { ...w, visible };
  });
  return changed ? next : layout;
}
