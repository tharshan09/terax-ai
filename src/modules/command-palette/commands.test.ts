import { describe, expect, it, vi } from "vitest";
import {
  type CommandPaletteActionContext,
  createCommandItems,
} from "./commands";
import { fuzzyBest } from "./lib/fuzzy";

// Both barrels pull the terminal stack; the commands only need these two.
vi.mock("@/modules/terminal", () => ({ leafIds: () => [] }));
vi.mock("@/modules/tabs", () => ({ MAX_PANES_PER_TAB: 4 }));

const noop = () => {};

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

// The palette's own match: title, group and keywords.
function matching(ctx: CommandPaletteActionContext, term: string): string[] {
  return createCommandItems(ctx)
    .filter(
      (item) =>
        fuzzyBest(term, [item.title, item.group, ...(item.keywords ?? [])]) !==
        null,
    )
    .map((item) => item.title);
}

describe("Forward Port command (AC-7)", () => {
  it("is offered in an SSH workspace, right after New web preview", () => {
    const items = createCommandItems(context({ canForwardPorts: true }));
    const at = items.findIndex((item) => item.id === "ports.forward");
    expect(at).toBeGreaterThan(0);
    expect(items[at - 1].id).toBe("tab.newPreview");
    expect(items[at]).toMatchObject({ title: "Forward Port", group: "Tabs" });
    expect(matching(context({ canForwardPorts: true }), "port")).toContain(
      "Forward Port",
    );
  });

  it("is absent in a local workspace", () => {
    const ctx = context({ canForwardPorts: false });
    expect(
      createCommandItems(ctx).some((item) => item.id === "ports.forward"),
    ).toBe(false);
    expect(matching(ctx, "port")).not.toContain("Forward Port");
  });

  it("runs the list opener it was given", () => {
    const openForwardPort = vi.fn();
    const item = createCommandItems(
      context({ canForwardPorts: true, openForwardPort }),
    ).find((i) => i.id === "ports.forward");
    item?.run();
    expect(openForwardPort).toHaveBeenCalledTimes(1);
    expect(item?.disabledReason).toBeUndefined();
  });

  it("is disabled while zen mode hides the status bar", () => {
    const item = createCommandItems(
      context({ canForwardPorts: true, statusBarHidden: true }),
    ).find((i) => i.id === "ports.forward");
    expect(item?.disabledReason).toBe("Status bar hidden");
  });
});
