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
  _opts?: { all?: boolean },
): Tab[] {
  return state.tabs.filter((t) => t.spaceId === spaceId);
}

export function stripLayout(state: GroupState, spaceId: string): StripItem[] {
  return visibleTabsInSpace(state, spaceId, { all: true }).map((tab) => ({
    kind: "tab",
    tab,
  }));
}

export function normalizeGroups(state: GroupState): GroupState {
  return state;
}

export function groupFromTab(
  state: GroupState,
  _tabId: number,
  _groupId: string,
): GroupState {
  return state;
}

export function assignToGroup(
  state: GroupState,
  _tabId: number,
  _groupId: string,
): GroupState {
  return state;
}

export function removeFromGroup(state: GroupState, _tabId: number): GroupState {
  return state;
}

export function dissolveGroup(state: GroupState, _groupId: string): GroupState {
  return state;
}

export function nextGroupColor(_groups: TabGroup[], _spaceId: string): number {
  return 0;
}

/** Computed as if the group were collapsed, whatever its `collapsed` field. */
export function activeAfterHide(
  _state: GroupState,
  _groupId: string,
): number | "new-terminal" {
  return "new-terminal";
}

/** Takes a tab already in the state (reorder) or a new one (a broken-out
 *  pane) and returns a normalized state. */
export function applyGapTarget(
  state: GroupState,
  _tab: Tab,
  _target: GapTarget,
): GroupState {
  return state;
}

export function moveGroupBlock(
  state: GroupState,
  _groupId: string,
  _target: GapTarget,
): GroupState {
  return state;
}

export function moveGroupAcrossSpaces(
  state: GroupState,
  _groupId: string,
  _targetSpaceId: string,
  _activeId: number,
): GroupMove {
  return { state, sourceEmptied: false, activeMoved: false };
}

export function planGroupClose(
  _tabs: Tab[],
  _groupId: string,
  _confirmIds: ReadonlySet<number>,
): GroupClosePlan | null {
  return null;
}

/** The tab to activate on switching into `spaceId`: the active tab when it is
 *  already there, else the space's last tab; null when the space has none. */
export function tabForSpaceSwitch(
  state: GroupState,
  spaceId: string,
  activeId: number,
): number | null {
  const inSpace = visibleTabsInSpace(state, spaceId);
  if (inSpace.length === 0) return null;
  if (inSpace.some((t) => t.id === activeId)) return activeId;
  return inSpace[inSpace.length - 1].id;
}

export function normalizeGroupName(raw: string): string {
  return raw;
}

/** Drawn from the tab id counter, so creating and restoring never collide. */
export function newGroupId(allocId: () => number): string {
  return `g${allocId()}`;
}
