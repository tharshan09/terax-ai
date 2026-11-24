import { SPACE_COLORS } from "@/modules/spaces/lib/spaceColor";
import type { Tab } from "./useTabs";

/** Metadata of a tab group. Membership lives on the tab (`Tab.groupId`);
 *  `color` is an index into `SPACE_COLORS`. */
export type TabGroup = {
  id: string;
  spaceId: string;
  name: string;
  color: number;
  collapsed: boolean;
};

export type GroupState = { tabs: Tab[]; groups: TabGroup[] };

export type StripItem =
  | { kind: "tab"; tab: Tab }
  | { kind: "group"; group: TabGroup; members: Tab[]; count: number };

/** An insertion gap in the drawn strip. `index` counts gaps over every drawn
 *  element (group headers and visible tabs, the dragged tab included), 0 being
 *  before the first. `groupId` names the group the gap lies inside, `null`
 *  outside any; the gap after a group's last member lies outside.
 *  `onCollapsedHeader` means the pointer is over the inner half of a collapsed
 *  header, which `groupId` then names. */
export type GapTarget = {
  index: number;
  groupId: string | null;
  onCollapsedHeader: boolean;
};

export type GroupClosePlan = {
  groupId: string;
  memberIds: number[];
  n: number;
  m: number;
};

export type GroupMove = {
  state: GroupState;
  sourceEmptied: boolean;
  activeMoved: boolean;
};

export const GROUP_NAME_MAX = 32;

export function visibleTabsInSpace(
  state: GroupState,
  spaceId: string,
  opts?: { all?: boolean },
): Tab[] {
  if (opts?.all) return state.tabs.filter((t) => t.spaceId === spaceId);
  const hidden = new Set<string>();
  for (const g of state.groups) {
    if (g.collapsed && g.spaceId === spaceId) hidden.add(g.id);
  }
  return state.tabs.filter(
    (t) =>
      t.spaceId === spaceId &&
      (t.groupId === undefined || !hidden.has(t.groupId)),
  );
}

function groupsById(groups: readonly TabGroup[]): Map<string, TabGroup> {
  return new Map(groups.map((g) => [g.id, g]));
}

/** The tab's group when it names a known group of the tab's own space. */
export function validGroupOf(
  tab: Tab,
  byId: ReadonlyMap<string, TabGroup>,
): TabGroup | undefined {
  if (tab.groupId === undefined) return undefined;
  const g = byId.get(tab.groupId);
  return g && g.spaceId === tab.spaceId ? g : undefined;
}

export function stripLayout(state: GroupState, spaceId: string): StripItem[] {
  const byId = groupsById(state.groups);
  const tabs = visibleTabsInSpace(state, spaceId, { all: true });
  const members = new Map<string, Tab[]>();
  for (const t of tabs) {
    const g = validGroupOf(t, byId);
    if (!g) continue;
    const list = members.get(g.id);
    if (list) list.push(t);
    else members.set(g.id, [t]);
  }
  const items: StripItem[] = [];
  const emitted = new Set<string>();
  for (const t of tabs) {
    const g = validGroupOf(t, byId);
    if (!g) {
      items.push({ kind: "tab", tab: t });
      continue;
    }
    if (emitted.has(g.id)) continue;
    emitted.add(g.id);
    const list = members.get(g.id) ?? [];
    items.push({ kind: "group", group: g, members: list, count: list.length });
  }
  return items;
}

export function withoutGroup(tab: Tab): Tab {
  if (tab.groupId === undefined) return tab;
  const { groupId: _dropped, ...rest } = tab;
  return rest as Tab;
}

export function withGroup(tab: Tab, groupId: string | undefined): Tab {
  if (groupId === undefined) return withoutGroup(tab);
  return tab.groupId === groupId ? tab : { ...tab, groupId };
}

/** Per space, pulls every member up behind its group's first member, so a
 *  loose tab caught between members ends up right behind the group. Other
 *  spaces keep their slots in the array. */
function contiguous(tabs: Tab[]): Tab[] {
  const bySpace = new Map<string, Tab[]>();
  for (const t of tabs) {
    const list = bySpace.get(t.spaceId);
    if (list) list.push(t);
    else bySpace.set(t.spaceId, [t]);
  }
  const ordered = new Map<string, Tab[]>();
  for (const [spaceId, list] of bySpace) {
    const out: Tab[] = [];
    const emitted = new Set<string>();
    for (const t of list) {
      if (t.groupId === undefined) {
        out.push(t);
        continue;
      }
      if (emitted.has(t.groupId)) continue;
      emitted.add(t.groupId);
      for (const m of list) if (m.groupId === t.groupId) out.push(m);
    }
    ordered.set(spaceId, out);
  }
  const cursor = new Map<string, number>();
  return tabs.map((t) => {
    const i = cursor.get(t.spaceId) ?? 0;
    cursor.set(t.spaceId, i + 1);
    return (ordered.get(t.spaceId) as Tab[])[i];
  });
}

export function normalizeGroups(state: GroupState): GroupState {
  const byId = groupsById(state.groups);
  const cleaned = state.tabs.map((t) =>
    t.groupId !== undefined && !validGroupOf(t, byId) ? withoutGroup(t) : t,
  );
  const tabs = contiguous(cleaned);
  const used = new Set<string>();
  for (const t of tabs) if (t.groupId !== undefined) used.add(t.groupId);
  const groups = state.groups.filter((g) => used.has(g.id));
  const tabsSame = tabs.every((t, i) => t === state.tabs[i]);
  const groupsSame = groups.length === state.groups.length;
  if (tabsSame && groupsSame) return state;
  return {
    tabs: tabsSame ? state.tabs : tabs,
    groups: groupsSame ? state.groups : groups,
  };
}

/** Inserts `block` in front of the tab `beforeId`, or behind the last tab of
 *  `spaceId` when `beforeId` is null or gone. */
function insertBlock(
  tabs: Tab[],
  block: Tab[],
  spaceId: string,
  beforeId: number | null,
): Tab[] {
  let at = beforeId === null ? -1 : tabs.findIndex((t) => t.id === beforeId);
  if (at < 0) {
    let last = -1;
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].spaceId === spaceId) last = i;
    }
    at = last < 0 ? tabs.length : last + 1;
  }
  return [...tabs.slice(0, at), ...block, ...tabs.slice(at)];
}

function insertTab(tabs: Tab[], tab: Tab, beforeId: number | null): Tab[] {
  return insertBlock(tabs, [tab], tab.spaceId, beforeId);
}

/** Places `tab` behind the last tab of its space, or at the end. */
export function appendToSpace(tabs: Tab[], tab: Tab): Tab[] {
  return insertTab(tabs, tab, null);
}

/** The tab right behind the last member of `groupId` within the space; null
 *  when the group ends the space. */
function idBehindGroup(
  tabs: Tab[],
  spaceId: string,
  groupId: string,
): number | null {
  const inSpace = visibleTabsInSpace({ tabs, groups: [] }, spaceId, {
    all: true,
  });
  let last = -1;
  for (let i = 0; i < inSpace.length; i++) {
    if (inSpace[i].groupId === groupId) last = i;
  }
  if (last < 0) return null;
  return inSpace[last + 1]?.id ?? null;
}

export function groupFromTab(
  state: GroupState,
  tabId: number,
  groupId: string,
): GroupState {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab || state.groups.some((g) => g.id === groupId)) return state;
  const surviving = state.groups.filter(
    (g) =>
      g.id !== tab.groupId ||
      state.tabs.some((t) => t.id !== tabId && t.groupId === g.id),
  );
  const group: TabGroup = {
    id: groupId,
    spaceId: tab.spaceId,
    name: "",
    color: nextGroupColor(surviving, tab.spaceId),
    collapsed: false,
  };
  return normalizeGroups({
    tabs: state.tabs.map((t) => (t.id === tabId ? withGroup(t, groupId) : t)),
    groups: [...state.groups, group],
  });
}

export function assignToGroup(
  state: GroupState,
  tabId: number,
  groupId: string,
): GroupState {
  const tab = state.tabs.find((t) => t.id === tabId);
  const group = state.groups.find((g) => g.id === groupId);
  if (!tab || !group || group.spaceId !== tab.spaceId) return state;
  if (tab.groupId === groupId) return state;
  const rest = state.tabs.filter((t) => t.id !== tabId);
  return normalizeGroups({
    tabs: insertTab(
      rest,
      withGroup(tab, groupId),
      idBehindGroup(rest, tab.spaceId, groupId),
    ),
    groups: state.groups,
  });
}

export function removeFromGroup(state: GroupState, tabId: number): GroupState {
  const tab = state.tabs.find((t) => t.id === tabId);
  if (!tab || tab.groupId === undefined) return state;
  const groupId = tab.groupId;
  const rest = state.tabs.filter((t) => t.id !== tabId);
  const loose = withoutGroup(tab);
  const tabs = rest.some((t) => t.groupId === groupId)
    ? insertTab(rest, loose, idBehindGroup(rest, tab.spaceId, groupId))
    : state.tabs.map((t) => (t.id === tabId ? loose : t));
  return normalizeGroups({ tabs, groups: state.groups });
}

export function dissolveGroup(state: GroupState, groupId: string): GroupState {
  if (!state.groups.some((g) => g.id === groupId)) return state;
  return normalizeGroups({
    tabs: state.tabs.map((t) => (t.groupId === groupId ? withoutGroup(t) : t)),
    groups: state.groups.filter((g) => g.id !== groupId),
  });
}

/** The first palette colour no group of the space wears; once all are worn,
 *  the least worn one, the first on a tie. */
export function nextGroupColor(groups: TabGroup[], spaceId: string): number {
  const worn = new Array<number>(SPACE_COLORS.length).fill(0);
  for (const g of groups) {
    if (g.spaceId === spaceId && g.color >= 0 && g.color < worn.length) {
      worn[g.color] += 1;
    }
  }
  let best = 0;
  for (let c = 1; c < worn.length; c++) if (worn[c] < worn[best]) best = c;
  return best;
}

/** Computed as if the group were collapsed, whatever its `collapsed` field. */
export function activeAfterHide(
  state: GroupState,
  groupId: string,
): number | "new-terminal" {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) return "new-terminal";
  const hiding = {
    tabs: state.tabs,
    groups: state.groups.map((g) =>
      g.id === groupId ? { ...g, collapsed: true } : g,
    ),
  };
  const inSpace = visibleTabsInSpace(hiding, group.spaceId, { all: true });
  const shown = new Set(
    visibleTabsInSpace(hiding, group.spaceId).map((t) => t.id),
  );
  let first = -1;
  let last = -1;
  for (let i = 0; i < inSpace.length; i++) {
    if (inSpace[i].groupId !== groupId) continue;
    if (first < 0) first = i;
    last = i;
  }
  for (let i = last + 1; i < inSpace.length; i++) {
    if (shown.has(inSpace[i].id)) return inSpace[i].id;
  }
  for (let i = (first < 0 ? inSpace.length : first) - 1; i >= 0; i--) {
    if (shown.has(inSpace[i].id)) return inSpace[i].id;
  }
  return "new-terminal";
}

/** Per drawn strip element, the tabs it stands for in the array: a tab
 *  itself, a header its group's members (first one first). */
function drawnElements(state: GroupState, spaceId: string): Tab[][] {
  const elements: Tab[][] = [];
  for (const item of stripLayout(state, spaceId)) {
    if (item.kind === "tab") {
      elements.push([item.tab]);
      continue;
    }
    elements.push(item.members);
    if (!item.group.collapsed) for (const m of item.members) elements.push([m]);
  }
  return elements;
}

/** The first tab drawn at or after gap `index` that `skip` lets through;
 *  null when nothing follows. */
function firstTabFrom(
  elements: Tab[][],
  index: number,
  skip: (t: Tab) => boolean,
): Tab | null {
  for (let i = Math.max(0, index); i < elements.length; i++) {
    const t = elements[i].find((m) => !skip(m));
    if (t) return t;
  }
  return null;
}

/** Takes a tab already in the state (reorder) or a new one (a broken-out
 *  pane) and returns a normalized state. A target group gone from the tab's
 *  space leaves a reorder undone; a new tab then lands loose, so the pane its
 *  source already gave up is not lost. */
export function applyGapTarget(
  state: GroupState,
  tab: Tab,
  target: GapTarget,
): GroupState {
  const group =
    target.groupId === null
      ? undefined
      : state.groups.find(
          (g) => g.id === target.groupId && g.spaceId === tab.spaceId,
        );
  if (
    target.groupId !== null &&
    !group &&
    state.tabs.some((t) => t.id === tab.id)
  ) {
    return state;
  }
  const rest = state.tabs.filter((t) => t.id !== tab.id);
  if (group && target.onCollapsedHeader) {
    return normalizeGroups({
      tabs: insertTab(
        rest,
        withGroup(tab, group.id),
        idBehindGroup(rest, tab.spaceId, group.id),
      ),
      groups: state.groups,
    });
  }
  const joins = group && !group.collapsed ? group.id : undefined;
  const before = firstTabFrom(
    drawnElements(state, tab.spaceId),
    target.index,
    (t) => t.id === tab.id,
  );
  return normalizeGroups({
    tabs: insertTab(rest, withGroup(tab, joins), before?.id ?? null),
    groups: state.groups,
  });
}

/** A gap inside another group counts as the gap right behind that group; a
 *  target group gone from the space leaves the state as it is. */
export function moveGroupBlock(
  state: GroupState,
  groupId: string,
  target: GapTarget,
): GroupState {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group || target.groupId === groupId) return state;
  if (
    target.groupId !== null &&
    !state.groups.some(
      (g) => g.id === target.groupId && g.spaceId === group.spaceId,
    )
  ) {
    return state;
  }
  const block = state.tabs.filter((t) => t.groupId === groupId);
  if (block.length === 0) return state;
  const rest = state.tabs.filter((t) => t.groupId !== groupId);
  const space = group.spaceId;
  let beforeId: number | null;
  if (target.groupId !== null) {
    beforeId = idBehindGroup(rest, space, target.groupId);
  } else {
    const next = firstTabFrom(
      drawnElements(state, space),
      target.index,
      (t) => t.groupId === groupId,
    );
    beforeId = next?.id ?? null;
    const host = next?.groupId;
    if (
      host !== undefined &&
      rest.find((t) => t.spaceId === space && t.groupId === host) !== next
    ) {
      beforeId = idBehindGroup(rest, space, host);
    }
  }
  return normalizeGroups({
    tabs: insertBlock(rest, block, space, beforeId),
    groups: state.groups,
  });
}

export function moveGroupAcrossSpaces(
  state: GroupState,
  groupId: string,
  targetSpaceId: string,
  activeId: number,
): GroupMove {
  const unchanged = { state, sourceEmptied: false, activeMoved: false };
  const group = state.groups.find((g) => g.id === groupId);
  if (!group || group.spaceId === targetSpaceId) return unchanged;
  const block = state.tabs
    .filter((t) => t.groupId === groupId)
    .map((t) => ({ ...t, spaceId: targetSpaceId }));
  if (block.length === 0) return unchanged;
  const rest = state.tabs.filter((t) => t.groupId !== groupId);
  const next = normalizeGroups({
    tabs: insertBlock(rest, block, targetSpaceId, null),
    groups: state.groups.map((g) =>
      g.id === groupId ? { ...g, spaceId: targetSpaceId } : g,
    ),
  });
  return {
    state: next,
    sourceEmptied: !rest.some((t) => t.spaceId === group.spaceId),
    activeMoved: block.some((t) => t.id === activeId),
  };
}

export function planGroupClose(
  tabs: Tab[],
  groupId: string,
  confirmIds: ReadonlySet<number>,
): GroupClosePlan | null {
  const memberIds = tabs.filter((t) => t.groupId === groupId).map((t) => t.id);
  if (memberIds.length === 0) return null;
  const m = memberIds.filter((id) => confirmIds.has(id)).length;
  return { groupId, memberIds, n: memberIds.length, m };
}

/** The tab to activate on switching into `spaceId`: the active tab when it is
 *  already there, else the space's last visible tab, else its last tab (whose
 *  group then expands); null when the space has none. */
export function tabForSpaceSwitch(
  state: GroupState,
  spaceId: string,
  activeId: number,
): number | null {
  const inSpace = visibleTabsInSpace(state, spaceId, { all: true });
  if (inSpace.length === 0) return null;
  if (inSpace.some((t) => t.id === activeId)) return activeId;
  const visible = visibleTabsInSpace(state, spaceId);
  const pick = visible.length > 0 ? visible : inSpace;
  return pick[pick.length - 1].id;
}

/** Counts UTF-16 units like the name input does; a cut never splits a
 *  surrogate pair. */
export function normalizeGroupName(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length <= GROUP_NAME_MAX) return trimmed;
  let end = GROUP_NAME_MAX;
  const code = trimmed.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff) end -= 1;
  return trimmed.slice(0, end).trimEnd();
}

/** A palette index; anything else falls back to the first colour. */
export function normalizeGroupColor(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < SPACE_COLORS.length
    ? value
    : 0;
}

/** Drawn from the tab id counter, so creating and restoring never collide. */
export function newGroupId(allocId: () => number): string {
  return `g${allocId()}`;
}
