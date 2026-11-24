import { describe, expect, it, vi } from "vitest";
import type { Tab } from "@/modules/tabs";
import {
  type CommandPaletteActionContext,
  createCommandItems,
} from "./commands";

vi.mock("@/modules/terminal", () => ({ leafIds: () => [] }));
vi.mock("@/modules/tabs", () => ({ MAX_PANES_PER_TAB: 4 }));

const noop = () => {};

function tab(id: number, groupId?: string): Tab {
  return {
    id,
    kind: "terminal",
    title: `t${id}`,
    spaceId: "a",
    groupId,
    paneTree: { kind: "leaf", id },
    activeLeafId: id,
  } as Tab;
}

function context(
  overrides: Partial<CommandPaletteActionContext>,
): CommandPaletteActionContext {
  return {
    tabs: [],
    activeId: 0,
    searchTarget: null,
    explorerRoot: null,
    home: null,
    openNewTab: noop,
    openNewBlock: noop,
    openNewPrivate: noop,
    openNewEditor: noop,
    openNewPreview: noop,
    canForwardPorts: false,
    statusBarHidden: false,
    openForwardPort: noop,
    openTmuxSwitcher: noop,
    openGitGraph: noop,
    toggleSourceControl: noop,
    closeActiveTabOrPane: noop,
    splitPaneRight: noop,
    splitPaneDown: noop,
    focusSearch: noop,
    focusExplorerSearch: noop,
    toggleSidebar: noop,
    toggleAi: noop,
    askAiSelection: noop,
    openAgentOverview: noop,
    openSettings: noop,
    openKeyboardShortcuts: noop,
    spaces: [],
    activeSpaceId: null,
    openSpacesOverview: noop,
    newSpace: noop,
    switchSpace: noop,
    createGroupFromTab: noop,
    removeTabFromGroup: noop,
    toggleGroupCollapsed: noop,
    ...overrides,
  };
}

function groupItems(ctx: CommandPaletteActionContext) {
  return createCommandItems(ctx).filter((i) => i.id.startsWith("tab.group."));
}

describe("group commands", () => {
  it("offers only the new-group command for a loose tab", () => {
    const createGroupFromTab = vi.fn();
    const items = groupItems(
      context({ tabs: [tab(1)], activeId: 1, createGroupFromTab }),
    );
    expect(items.map((i) => i.id)).toEqual(["tab.group.new"]);
    expect(items[0]).toMatchObject({
      title: "Add tab to new group",
      group: "Tabs",
    });
    expect(items[0].disabledReason).toBeUndefined();
    items[0].run();
    expect(createGroupFromTab).toHaveBeenCalledWith(1);
  });

  it("adds remove and toggle for a tab in a group", () => {
    const createGroupFromTab = vi.fn();
    const removeTabFromGroup = vi.fn();
    const toggleGroupCollapsed = vi.fn();
    const items = groupItems(
      context({
        tabs: [tab(1), tab(2, "g1")],
        activeId: 2,
        createGroupFromTab,
        removeTabFromGroup,
        toggleGroupCollapsed,
      }),
    );
    expect(items.map((i) => [i.id, i.title, i.group])).toEqual([
      ["tab.group.new", "Add tab to new group", "Tabs"],
      ["tab.group.remove", "Remove tab from group", "Tabs"],
      ["tab.group.toggle", "Collapse/expand group", "Tabs"],
    ]);
    for (const item of items) item.run();
    expect(createGroupFromTab).toHaveBeenCalledWith(2);
    expect(removeTabFromGroup).toHaveBeenCalledWith(2);
    expect(toggleGroupCollapsed).toHaveBeenCalledWith("g1");
  });
});
