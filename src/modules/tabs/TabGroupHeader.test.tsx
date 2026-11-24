// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaneNode } from "@/modules/terminal/lib/panes";

vi.mock("./lib/selectTabAgentStatus", async () => {
  const actual = await vi.importActual<
    typeof import("./lib/selectTabAgentStatus")
  >("./lib/selectTabAgentStatus");
  return {
    ...actual,
    groupAggregateStatus: vi.fn(actual.groupAggregateStatus),
  };
});

import { useAgentStore } from "@/modules/agents/store/agentStore";
import { groupAggregateStatus } from "./lib/selectTabAgentStatus";
import type { StripItem, TabGroup } from "./lib/tabGroups";
import type { TerminalTab } from "./lib/useTabs";
import type { TabBarGroupProps } from "./TabBar";
import { TabActivityIndicator } from "./TabActivityIndicator";
import { TabGroupHeader } from "./TabGroupHeader";

const aggregateMock = groupAggregateStatus as unknown as ReturnType<
  typeof vi.fn
>;

function term(id: number, paneTree: PaneNode, cold?: boolean): TerminalTab {
  return {
    id,
    kind: "terminal",
    title: `t${id}`,
    spaceId: "a",
    paneTree,
    activeLeafId: paneTree.id,
    groupId: "G1",
    ...(cold ? { cold } : {}),
  };
}

const members = [
  term(2, {
    kind: "split",
    id: 20,
    dir: "row",
    children: [
      { kind: "leaf", id: 21 },
      { kind: "leaf", id: 22 },
    ],
  }),
  term(3, { kind: "leaf", id: 31 }, true),
];

function item(collapsed: boolean): Extract<StripItem, { kind: "group" }> {
  const group: TabGroup = {
    id: "G1",
    spaceId: "a",
    name: "",
    color: 0,
    collapsed,
  };
  return { kind: "group", group, members, count: members.length };
}

const noop = () => {};
const groupProps = {
  spaceId: "a",
  groups: [],
  renamingGroupId: null,
  onRenamingGroupChange: noop,
  onToggleGroup: noop,
  onRenameGroup: noop,
} as unknown as TabBarGroupProps;

function renderHeader(collapsed: boolean, onRender: () => void = noop) {
  return render(
    <Profiler id="header" onRender={onRender}>
      <TabGroupHeader
        item={item(collapsed)}
        groupProps={groupProps}
        dragging={false}
        dropHighlight={false}
        onPointerDown={noop}
        onPointerMove={noop}
        onPointerUp={noop}
        onPointerCancel={noop}
      />
    </Profiler>,
  );
}

function agent(leafId: number, tabId: number, status: "working" | "waiting") {
  useAgentStore.getState().start(leafId, tabId, "claude");
  useAgentStore.getState().setStatus(leafId, status);
}

describe("TabGroupHeader aggregate badge", () => {
  beforeEach(() => {
    aggregateMock.mockClear();
    useAgentStore.setState({
      sessions: {},
      notifications: [],
      localAgent: null,
    });
  });
  afterEach(cleanup);

  it("shows waiting over working across members, cold ones included, and ignores foreign sessions", () => {
    act(() => {
      agent(21, 2, "working");
      agent(31, 3, "waiting");
    });
    let renders = 0;
    const { container } = renderHeader(true, () => {
      renders += 1;
    });
    expect(
      container.querySelector('[aria-label="Agent waiting for input"]'),
    ).not.toBeNull();

    act(() => useAgentStore.getState().setStatus(31, "idle"));
    expect(
      container.querySelector('[aria-label="Agent working"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Agent waiting for input"]'),
    ).toBeNull();

    const before = renders;
    act(() => {
      useAgentStore.getState().start(99, 9, "claude");
      useAgentStore.getState().setStatus(99, "waiting");
    });
    expect(renders).toBe(before);
  });

  it("draws each status exactly like the tab badge", () => {
    act(() => agent(31, 3, "waiting"));
    const head = renderHeader(true).container.querySelector(
      '[aria-label="Agent waiting for input"]',
    );
    const tab = render(
      <TabActivityIndicator paneTree={{ kind: "leaf", id: 31 }} />,
    ).container.querySelector('[aria-label="Agent waiting for input"]');
    expect(head?.outerHTML).toBe(tab?.outerHTML);
  });

  it("leaves the agent store alone while expanded", () => {
    act(() => agent(21, 2, "working"));
    const { container } = renderHeader(false);
    act(() => {
      useAgentStore.getState().setStatus(21, "waiting");
      useAgentStore.getState().setStatus(31, "working");
    });
    expect(aggregateMock).not.toHaveBeenCalled();
    expect(container.querySelector("[aria-label^='Agent']")).toBeNull();
  });
});
