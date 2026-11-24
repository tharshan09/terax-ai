// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", async () => ({
  ...(await vi.importActual<object>("@tauri-apps/api/event")),
  listen: () => Promise.resolve(() => {}),
}));

import { useAgentStore } from "@/modules/agents/store/agentStore";
import { useSpaces } from "@/modules/spaces/lib/useSpaces";
import type { TabGroup } from "./lib/tabGroups";
import type { Tab, TerminalTab } from "./lib/useTabs";
import { TabBar, type TabBarGroupProps } from "./TabBar";

// Radix measures its popper; jsdom has no ResizeObserver or pointer capture.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;

function term(id: number, groupId?: string): TerminalTab {
  return {
    id,
    kind: "terminal",
    title: `t${id}`,
    customTitle: `t${id}`,
    spaceId: "a",
    paneTree: { kind: "leaf", id: id * 10 },
    activeLeafId: id * 10,
    ...(groupId ? { groupId } : {}),
  };
}

function group(collapsed: boolean): TabGroup {
  return { id: "G1", spaceId: "a", name: "G1", color: 4, collapsed };
}

function groupProps(groups: TabGroup[]): TabBarGroupProps {
  return {
    spaceId: "a",
    groups,
    renamingGroupId: null,
    onRenamingGroupChange: vi.fn(),
    onCreateGroup: vi.fn(),
    onAddToGroup: vi.fn(),
    onRemoveFromGroup: vi.fn(),
    onUngroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onSetGroupColor: vi.fn(),
    onToggleGroup: vi.fn(),
    onMoveGroup: vi.fn(),
    onMoveGroupToSpace: vi.fn(),
    onCloseGroup: vi.fn(),
  };
}

function bar(tabs: Tab[]) {
  const props = {
    tabs,
    activeId: tabs[0].id,
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onNewBlock: vi.fn(),
    onNewPrivate: vi.fn(),
    onNewSsh: vi.fn(),
    sshHosts: [],
    onNewPreview: vi.fn(),
    onNewEditor: vi.fn(),
    onNewGitGraph: vi.fn(),
    onClose: vi.fn(),
    onPin: vi.fn(),
    onRename: vi.fn(),
    onReorder: vi.fn(),
    groupProps: groupProps([group(false)]),
  };
  const view = render(<TabBar {...props} />);
  const draw = (collapsed: boolean) =>
    view.rerender(
      <TabBar {...props} groupProps={groupProps([group(collapsed)])} />,
    );
  return { props, draw };
}

const tabEl = (id: number) =>
  document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`) as HTMLElement;
const field = () => screen.queryByLabelText("Rename tab") as HTMLInputElement;

function startRename(id: number) {
  fireEvent.contextMenu(tabEl(id));
  fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
}

beforeEach(() => {
  useAgentStore.setState({ sessions: {}, notifications: [], localAgent: null });
  useSpaces.setState({ spaces: [], activeId: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TabBar: renaming a tab whose group collapses", () => {
  const tabs = () => [term(1), term(2, "G1"), term(3, "G1")];

  it("saves the typed name and leaves no rename open", () => {
    const { props, draw } = bar(tabs());
    startRename(2);
    fireEvent.change(field(), { target: { value: "foo" } });

    draw(true);
    expect(props.onRename).toHaveBeenCalledTimes(1);
    expect(props.onRename).toHaveBeenCalledWith(2, "foo");

    draw(false);
    expect(field()).toBeNull();
  });

  it("drops an untouched or unchanged name and leaves no rename open", () => {
    const { props, draw } = bar(tabs());
    startRename(2);
    draw(true);
    draw(false);
    expect(field()).toBeNull();

    startRename(3);
    fireEvent.change(field(), { target: { value: "x" } });
    fireEvent.change(field(), { target: { value: " t3 " } });
    draw(true);
    draw(false);
    expect(field()).toBeNull();
    expect(props.onRename).not.toHaveBeenCalled();
  });
});
