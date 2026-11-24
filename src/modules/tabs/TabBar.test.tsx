// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", async () => ({
  ...(await vi.importActual<object>("@tauri-apps/api/event")),
  listen: () => Promise.resolve(() => {}),
}));

import { useAgentStore } from "@/modules/agents/store/agentStore";
import { SPACE_COLORS } from "@/modules/spaces/lib/spaceColor";
import { useSpaces } from "@/modules/spaces/lib/useSpaces";
import { LOCAL_WORKSPACE } from "@/modules/workspace";
import { usePaneDndStore } from "@/modules/terminal/lib/paneDndStore";
import type { PaneNode } from "@/modules/terminal/lib/panes";
import type { TabGroup } from "./lib/tabGroups";
import {
  GROUP_COLLAPSED_ATTR,
  GROUP_HEADER_ATTR,
  gapIndexAt,
  stripHasTab,
  TAB_GROUP_ATTR,
  TAB_STRIP_ATTR,
} from "./lib/tabStripGap";
import type { EditorTab, Tab, TerminalTab } from "./lib/useTabs";
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

// jsdom normalises colours (0.20 becomes 0.2), so compare like with like.
function css(color: string): string {
  const probe = document.createElement("span");
  probe.style.backgroundColor = color;
  return probe.style.backgroundColor;
}

const DRAWN = `[data-tab-id], [${GROUP_HEADER_ATTR}]`;

// Every header and drawn tab is 100 px wide from x = 0, in strip order.
function layoutRects() {
  return vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      const i = [...document.querySelectorAll(DRAWN)].indexOf(this);
      const left = i < 0 ? 0 : i * 100;
      const width = i < 0 ? 0 : 100;
      return {
        left,
        right: left + width,
        width,
        x: left,
        top: 0,
        y: 0,
        bottom: 28,
        height: 28,
        toJSON: () => ({}),
      } as DOMRect;
    });
}

function term(id: number, groupId?: string, paneTree?: PaneNode): TerminalTab {
  const tree = paneTree ?? { kind: "leaf", id: id * 10 };
  return {
    id,
    kind: "terminal",
    title: `t${id}`,
    customTitle: `t${id}`,
    spaceId: "a",
    paneTree: tree,
    activeLeafId: tree.kind === "leaf" ? tree.id : id * 10,
    ...(groupId ? { groupId } : {}),
  };
}

function editor(id: number, groupId?: string): EditorTab {
  return {
    id,
    kind: "editor",
    title: `t${id}`,
    path: `/t${id}.txt`,
    dirty: false,
    preview: false,
    spaceId: "a",
    ...(groupId ? { groupId } : {}),
  };
}

function group(id: string, over: Partial<TabGroup> = {}): TabGroup {
  return { id, spaceId: "a", name: id, color: 4, collapsed: false, ...over };
}

function groupProps(
  groups: TabGroup[],
  over: Partial<TabBarGroupProps> = {},
): TabBarGroupProps {
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
    ...over,
  };
}

function bar(
  tabs: Tab[],
  groups: TabGroup[],
  over: {
    group?: Partial<TabBarGroupProps>;
    activeId?: number;
    merge?: boolean;
  } = {},
) {
  const gp = groupProps(groups, over.group);
  const props = {
    tabs,
    activeId: over.activeId ?? tabs[0].id,
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
    onMergeInto: over.merge ? vi.fn() : undefined,
    groupProps: gp,
  };
  const view = render(<TabBar {...props} />);
  return {
    gp,
    props,
    view,
    rerender: (nextTabs: Tab[], nextGroups: TabGroup[]) =>
      view.rerender(
        <TabBar
          {...props}
          tabs={nextTabs}
          groupProps={{ ...gp, groups: nextGroups }}
        />,
      ),
  };
}

const header = (id: string) =>
  document.querySelector<HTMLElement>(
    `[${GROUP_HEADER_ATTR}="${id}"]`,
  ) as HTMLElement;
const tabEl = (id: number) =>
  document.querySelector<HTMLElement>(`[data-tab-id="${id}"]`) as HTMLElement;
const strip = () =>
  document.querySelector<HTMLElement>(`[${TAB_STRIP_ATTR}]`) as HTMLElement;
const markers = () => [
  ...document.querySelectorAll<HTMLElement>("[data-drop-marker]"),
];
const drawnOrder = () =>
  [...document.querySelectorAll<HTMLElement>(DRAWN)].map(
    (el) =>
      el.getAttribute(GROUP_HEADER_ATTR) ??
      `t${el.getAttribute("data-tab-id")}`,
  );

function lastMenu(): HTMLElement {
  const menus = screen.getAllByRole("menu");
  return menus[menus.length - 1];
}

function menuEntries(): string[] {
  const menu = lastMenu();
  return [
    ...menu.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="separator"], [role="menuitemradio"]',
    ),
  ].map((el) =>
    el.getAttribute("role") === "separator"
      ? "---"
      : (el.textContent ?? "").trim(),
  );
}

function openSub(label: string) {
  fireEvent.click(screen.getByRole("menuitem", { name: label }));
}

function pointer(
  el: HTMLElement,
  type: "pointerDown" | "pointerMove" | "pointerUp",
  clientX: number,
) {
  fireEvent[type](el, {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX,
    clientY: 10,
  });
}

function drag(el: HTMLElement, fromX: number, toX: number) {
  pointer(el, "pointerDown", fromX);
  pointer(el, "pointerMove", toX);
}

beforeEach(() => {
  layoutRects();
  useAgentStore.setState({ sessions: {}, notifications: [], localAgent: null });
  usePaneDndStore.setState({
    sourceLeafId: null,
    sourceTabId: null,
    target: null,
  });
  useSpaces.setState({ spaces: [], activeId: null });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const t1g1t4 = () => [term(1), term(2, "G1"), term(3, "G1"), term(4)];

describe("TabBar with groups: drawing", () => {
  it("draws the header, the members on a tinted surface, and only the header when collapsed", () => {
    const g = group("G1", { name: "Messungen", color: 4 });
    const { rerender } = bar(t1g1t4(), [g]);

    expect(drawnOrder()).toEqual(["t1", "G1", "t2", "t3", "t4"]);
    const h = header("G1");
    expect(h.textContent).toBe("Messungen");
    expect(h.style.backgroundColor).toBe(css(SPACE_COLORS[4]));
    const surface = h.parentElement as HTMLElement;
    expect(surface.style.getPropertyValue("--group-color")).toBe(
      SPACE_COLORS[4],
    );
    expect(surface.className).toContain("bg-[color-mix(");
    expect(surface.contains(tabEl(3))).toBe(true);
    expect(surface.contains(tabEl(4))).toBe(false);

    rerender(t1g1t4(), [{ ...g, collapsed: true }]);
    expect(drawnOrder()).toEqual(["t1", "G1", "t4"]);
    expect(header("G1").textContent).toBe("Messungen2");
    expect((header("G1").parentElement as HTMLElement).className).not.toContain(
      "bg-[color-mix(",
    );
    const tip = header("G1").getAttribute("title") ?? "";
    expect(tip).toContain("Messungen");
    expect(tip).toContain("2 tabs");
  });

  it("shows only the dot for an unnamed group, and the count and badge once collapsed", () => {
    useAgentStore.setState({
      sessions: {
        20: {
          leafId: 20,
          tabId: 2,
          agent: "claude",
          origin: "osc",
          status: "working",
          startedAt: 0,
          lastActivityAt: 0,
          attentionSince: null,
        },
      },
    });
    const g = group("G1", { name: "" });
    const { rerender } = bar([term(1), term(2, "G1")], [g]);
    expect(header("G1").textContent).toBe("");
    expect(header("G1").querySelector("[aria-label]")).toBeNull();

    rerender([term(1), term(2, "G1")], [{ ...g, collapsed: true }]);
    expect(header("G1").textContent).toBe("1");
    expect(
      header("G1").querySelector('[aria-label="Agent working"]'),
    ).not.toBeNull();
    expect(header("G1").getAttribute("title")).toBe("1 tab");
  });

  it("keeps the tab badge rule: working wins over waiting on a split tab", () => {
    const base = {
      agent: "claude",
      origin: "osc" as const,
      tabId: 1,
      startedAt: 0,
      lastActivityAt: 0,
      attentionSince: null,
    };
    useAgentStore.setState({
      sessions: {
        21: { ...base, leafId: 21, status: "working" },
        22: { ...base, leafId: 22, status: "waiting" },
      },
    });
    bar(
      [
        term(1, undefined, {
          kind: "split",
          id: 20,
          dir: "row",
          children: [
            { kind: "leaf", id: 21 },
            { kind: "leaf", id: 22 },
          ],
        }),
        term(2),
      ],
      [],
    );
    expect(
      tabEl(1).querySelector('[aria-label="Agent working"]'),
    ).not.toBeNull();
  });

  it("renders a group name as text, never as markup", () => {
    const g = group("G1", { name: "<b>x</b>" });
    bar([term(1), term(2, "G1"), term(3, "G2")], [g, group("G2")]);
    expect(header("G1").textContent).toBe("<b>x</b>");
    expect(header("G1").getAttribute("title")).toBe("<b>x</b> · 1 tab");

    fireEvent.contextMenu(tabEl(3));
    openSub("Add to group");
    const sub = lastMenu();
    expect(within(sub).getByText("<b>x</b>")).toBeTruthy();
    expect(document.querySelector("b")).toBeNull();
  });

  it("keeps headers, the line and markers out of the tab count", () => {
    const g = group("G1");
    const { rerender } = bar(t1g1t4(), [g]);
    const h = header("G1");
    expect(h.hasAttribute("data-tab-id")).toBe(false);
    expect(h.hasAttribute(GROUP_COLLAPSED_ATTR)).toBe(false);
    expect((h.parentElement as HTMLElement).hasAttribute("data-tab-id")).toBe(
      false,
    );
    expect(tabEl(2).getAttribute(TAB_GROUP_ATTR)).toBe("G1");
    expect(tabEl(3).getAttribute(TAB_GROUP_ATTR)).toBe("G1");
    expect(tabEl(1).hasAttribute(TAB_GROUP_ATTR)).toBe(false);
    expect(document.querySelectorAll("[data-tab-id]")).toHaveLength(4);
    // The header in front of t2 adds no gap of its own.
    expect(gapIndexAt(strip(), 260)).toBe(2);
    expect(stripHasTab(strip(), "3")).toBe(true);

    drag(tabEl(1), 50, 260);
    for (const m of markers())
      expect(m.hasAttribute("data-tab-id")).toBe(false);

    rerender(t1g1t4(), [{ ...g, collapsed: true }]);
    expect(header("G1").hasAttribute(GROUP_COLLAPSED_ATTR)).toBe(true);
    expect(stripHasTab(strip(), "3")).toBe(false);
    expect(document.querySelectorAll("[data-tab-id]")).toHaveLength(2);
  });

  it("draws a strip without groups as before: tabs straight in the list, tab on tab merges", () => {
    const { props } = bar([term(1), term(2), term(3)], [], { merge: true });
    const list = screen.getByRole("tablist");
    for (const id of [1, 2, 3]) expect(tabEl(id).parentElement).toBe(list);
    expect(document.querySelector(`[${GROUP_HEADER_ATTR}]`)).toBeNull();
    expect(document.querySelector(`[${TAB_GROUP_ATTR}]`)).toBeNull();

    drag(tabEl(1), 50, 150);
    pointer(tabEl(1), "pointerUp", 150);
    expect(props.onMergeInto).toHaveBeenCalledWith(1, 2);
    expect(props.onReorder).not.toHaveBeenCalled();
  });

  it("lets a lone visible tab close beside a collapsed group", () => {
    const { props } = bar(
      [term(1), term(2, "G1")],
      [group("G1", { collapsed: true })],
    );
    expect(within(tabEl(1)).getByLabelText("Close tab")).toBeTruthy();
    fireEvent(
      tabEl(1),
      new MouseEvent("auxclick", { bubbles: true, button: 1 }),
    );
    expect(props.onClose).toHaveBeenCalledWith(1);
    fireEvent.contextMenu(tabEl(1));
    expect(menuEntries()).toContain("Close");
  });

  it("offers no close on the only tab of a space", () => {
    bar([term(1)], []);
    expect(within(tabEl(1)).queryByLabelText("Close tab")).toBeNull();
    fireEvent.contextMenu(tabEl(1));
    expect(menuEntries()).not.toContain("Close");
  });
});

describe("TabBar with groups: header click", () => {
  it("toggles on a click, twice on a double click, and never selects or renames", () => {
    const { gp, props } = bar(
      [term(1), term(2, "G1"), term(3, "G1")],
      [group("G1")],
    );
    const h = header("G1");
    pointer(h, "pointerDown", 150);
    pointer(h, "pointerMove", 152);
    pointer(h, "pointerUp", 152);
    expect(gp.onToggleGroup).toHaveBeenCalledTimes(1);
    expect(gp.onToggleGroup).toHaveBeenCalledWith("G1");

    pointer(h, "pointerDown", 150);
    pointer(h, "pointerUp", 150);
    pointer(h, "pointerDown", 150);
    pointer(h, "pointerUp", 150);
    fireEvent.doubleClick(h);
    expect(gp.onToggleGroup).toHaveBeenCalledTimes(3);
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(gp.onRenamingGroupChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("TabBar with groups: tab menu", () => {
  const strip4 = () => [term(1), editor(2, "G1"), editor(3, "G2"), editor(4)];
  const groups4 = () => [group("G1"), group("G2", { name: "" })];

  it("offers both group entries above Rename and Close on a loose terminal", () => {
    const { gp } = bar(strip4(), groups4());
    fireEvent.contextMenu(tabEl(1));
    expect(menuEntries()).toEqual([
      "Add to new group",
      "Add to group",
      "---",
      "Rename",
      "---",
      "Close",
    ]);
    openSub("Add to group");
    expect(menuEntries()).toEqual(["G1", "Unnamed group"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Unnamed group" }));
    expect(gp.onAddToGroup).toHaveBeenCalledWith(1, "G2");
  });

  it("creates a group from the menu", () => {
    const { gp } = bar(strip4(), groups4());
    fireEvent.contextMenu(tabEl(1));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add to new group" }));
    expect(gp.onCreateGroup).toHaveBeenCalledWith(1);
  });

  it("gives other tab kinds the group entries only", () => {
    bar(strip4(), groups4());
    fireEvent.contextMenu(tabEl(4));
    expect(menuEntries()).toEqual(["Add to new group", "Add to group"]);
  });

  it("offers Remove from group to a member and leaves its own group out", () => {
    const { gp } = bar(strip4(), groups4());
    fireEvent.contextMenu(tabEl(2));
    expect(menuEntries()).toEqual([
      "Add to new group",
      "Add to group",
      "Remove from group",
    ]);
    openSub("Add to group");
    expect(menuEntries()).toEqual(["Unnamed group"]);
    cleanup();

    const again = bar(strip4(), groups4());
    fireEvent.contextMenu(tabEl(2));
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Remove from group" }),
    );
    expect(again.gp.onRemoveFromGroup).toHaveBeenCalledWith(2);
    expect(gp.onRemoveFromGroup).not.toHaveBeenCalled();
  });

  it("greys out Add to group when the space has no other group", () => {
    bar([term(1), term(2, "G1")], [group("G1")]);
    fireEvent.contextMenu(tabEl(2));
    expect(
      screen
        .getByRole("menuitem", { name: "Add to group" })
        .hasAttribute("data-disabled"),
    ).toBe(true);
  });
});

describe("TabBar with groups: header menu", () => {
  const spaceA = {
    id: "a",
    name: "Alpha",
    root: null,
    env: LOCAL_WORKSPACE,
    createdAt: 0,
    updatedAt: 0,
  };
  const spaceB = { ...spaceA, id: "b", name: "Beta" };

  it("lists the entries in order and runs each one", () => {
    useSpaces.setState({ spaces: [spaceA, spaceB], activeId: "a" });
    const tabs = [term(1), term(2, "G1")];
    const run = (label: string) => {
      const view = bar(tabs, [group("G1")]);
      fireEvent.contextMenu(header("G1"));
      fireEvent.click(screen.getByRole("menuitem", { name: label }));
      const gp = view.gp;
      cleanup();
      return gp;
    };

    bar(tabs, [group("G1")]);
    fireEvent.contextMenu(header("G1"));
    expect(menuEntries()).toEqual([
      "Rename group",
      "Change color",
      "Ungroup",
      "Move group to space",
      "---",
      "Close group",
    ]);
    openSub("Move group to space");
    expect(menuEntries()).toEqual(["BBeta"]);
    const moveMenu = lastMenu();
    expect(within(moveMenu).queryByText("Alpha")).toBeNull();
    cleanup();

    expect(run("Rename group").onRenamingGroupChange).toHaveBeenCalledWith(
      "G1",
    );
    expect(run("Ungroup").onUngroup).toHaveBeenCalledWith("G1");
    expect(run("Close group").onCloseGroup).toHaveBeenCalledWith("G1");

    const view = bar(tabs, [group("G1")]);
    fireEvent.contextMenu(header("G1"));
    openSub("Move group to space");
    fireEvent.click(screen.getByRole("menuitem", { name: /Beta/ }));
    expect(view.gp.onMoveGroupToSpace).toHaveBeenCalledWith("G1", "b");
  });

  it("greys out Move group to space with a single space", () => {
    useSpaces.setState({ spaces: [spaceA], activeId: "a" });
    bar([term(1), term(2, "G1")], [group("G1")]);
    fireEvent.contextMenu(header("G1"));
    expect(
      screen
        .getByRole("menuitem", { name: "Move group to space" })
        .hasAttribute("data-disabled"),
    ).toBe(true);
  });

  it("picks a colour from the palette and redraws in it", () => {
    const tabs = [term(1), term(2, "G1")];
    const { gp, rerender } = bar(tabs, [group("G1", { color: 4 })]);
    fireEvent.contextMenu(header("G1"));
    openSub("Change color");
    const dots = screen.getAllByRole("menuitemradio");
    expect(dots).toHaveLength(SPACE_COLORS.length);
    expect(dots.map((d) => d.getAttribute("aria-checked"))).toEqual(
      SPACE_COLORS.map((_, i) => String(i === 4)),
    );
    fireEvent.click(dots[2]);
    expect(gp.onSetGroupColor).toHaveBeenCalledWith("G1", 2);

    rerender(tabs, [group("G1", { color: 2 })]);
    expect(header("G1").style.backgroundColor).toBe(css(SPACE_COLORS[2]));
    expect(
      (header("G1").parentElement as HTMLElement).style.getPropertyValue(
        "--group-color",
      ),
    ).toBe(SPACE_COLORS[2]);
  });
});

describe("TabBar with groups: renaming", () => {
  const renaming = (name = "Old") =>
    bar([term(1), term(2, "G9")], [group("G9", { name })], {
      group: { renamingGroupId: "G9" },
    });

  it("opens a focused, selected name field outside any button", async () => {
    renaming("Old");
    const input = screen.getByRole("textbox", {
      name: "Rename group",
    }) as HTMLInputElement;
    expect(input.maxLength).toBe(32);
    expect(input.closest("button")).toBeNull();
    await act(() => new Promise((r) => requestAnimationFrame(() => r(null))));
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(3);
  });

  it("saves on Enter and on blur, drops on Escape, and saves an empty name", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const input = () => screen.getByRole("textbox") as HTMLInputElement;

    let view = renaming();
    fireEvent.change(input(), { target: { value: "Messungen" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(view.gp.onRenameGroup).toHaveBeenCalledWith("G9", "Messungen");
    expect(view.gp.onRenamingGroupChange).toHaveBeenCalledWith(null);
    cleanup();

    view = renaming();
    fireEvent.change(input(), { target: { value: "Messungen" } });
    fireEvent.focusOut(input());
    expect(view.gp.onRenameGroup).toHaveBeenCalledWith("G9", "Messungen");
    expect(view.gp.onRenamingGroupChange).toHaveBeenCalledWith(null);
    cleanup();

    view = renaming();
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(view.gp.onRenameGroup).not.toHaveBeenCalled();
    expect(view.gp.onRenamingGroupChange).toHaveBeenCalledWith(null);
    cleanup();

    view = renaming();
    fireEvent.change(input(), { target: { value: "" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(view.gp.onRenameGroup).toHaveBeenCalledWith("G9", "");
  });
});

describe("TabBar with groups: dragging", () => {
  it("drops a tab between two members with a group-coloured marker, or behind the group with a neutral one", () => {
    const g = group("G1", { color: 4 });
    let view = bar(t1g1t4(), [g]);
    drag(tabEl(1), 50, 260);
    const [inside] = markers();
    expect(inside.previousElementSibling).toBe(tabEl(2));
    expect(inside.nextElementSibling).toBe(tabEl(3));
    expect(inside.style.backgroundColor).toBe(css(SPACE_COLORS[4]));
    pointer(tabEl(1), "pointerUp", 260);
    expect(view.props.onReorder).toHaveBeenCalledWith(1, {
      index: 3,
      groupId: "G1",
      onCollapsedHeader: false,
    });
    cleanup();

    view = bar(t1g1t4(), [g]);
    drag(tabEl(1), 50, 360);
    const [outside] = markers();
    expect(outside.previousElementSibling?.contains(tabEl(3))).toBe(true);
    expect(outside.nextElementSibling).toBe(tabEl(4));
    expect(outside.style.backgroundColor).toBe("");
    pointer(tabEl(1), "pointerUp", 360);
    expect(view.props.onReorder).toHaveBeenCalledWith(1, {
      index: 4,
      groupId: null,
      onCollapsedHeader: false,
    });
  });

  it("drops a tab onto a collapsed header, or in front of it", () => {
    const g = group("G1", { collapsed: true });
    let view = bar(t1g1t4(), [g], { activeId: 1 });
    drag(tabEl(4), 250, 150);
    expect(header("G1").style.boxShadow).not.toBe("");
    expect(markers()).toHaveLength(0);
    pointer(tabEl(4), "pointerUp", 150);
    expect(view.props.onReorder).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ groupId: "G1", onCollapsedHeader: true }),
    );
    cleanup();

    view = bar(t1g1t4(), [g], { activeId: 1 });
    drag(tabEl(4), 250, 110);
    const [m] = markers();
    expect(m.nextElementSibling?.contains(header("G1"))).toBe(true);
    expect(m.style.backgroundColor).toBe("");
    pointer(tabEl(4), "pointerUp", 110);
    expect(view.props.onReorder).toHaveBeenCalledWith(4, {
      index: 1,
      groupId: null,
      onCollapsedHeader: false,
    });
  });

  it("moves a group by its header, landing behind another group rather than inside it", () => {
    let view = bar(t1g1t4(), [group("G1")]);
    drag(header("G1"), 150, 460);
    expect(header("G1").className).toContain("opacity-50");
    pointer(header("G1"), "pointerUp", 460);
    expect(view.gp.onMoveGroup).toHaveBeenCalledWith("G1", {
      index: 5,
      groupId: null,
      onCollapsedHeader: false,
    });
    expect(view.gp.onToggleGroup).not.toHaveBeenCalled();
    expect(view.props.onReorder).not.toHaveBeenCalled();
    cleanup();

    view = bar(
      [term(2, "G1"), term(1), term(3, "G2"), term(4, "G2")],
      [group("G1"), group("G2")],
    );
    drag(header("G1"), 50, 460);
    const [m] = markers();
    expect(m.previousElementSibling?.contains(tabEl(4))).toBe(true);
    expect(m.nextElementSibling).toBeNull();
    pointer(header("G1"), "pointerUp", 460);
    expect(view.gp.onMoveGroup).toHaveBeenCalledWith("G1", {
      index: 5,
      groupId: "G2",
      onCollapsedHeader: false,
    });
    expect(view.gp.onToggleGroup).not.toHaveBeenCalled();
    expect(view.props.onReorder).not.toHaveBeenCalled();
  });

  it("colours the marker of a pane breaking out into a group", () => {
    usePaneDndStore.setState({
      sourceLeafId: 10,
      sourceTabId: "1",
      target: {
        kind: "newTab",
        gap: { index: 3, groupId: "G1", onCollapsedHeader: false },
      },
    });
    bar(t1g1t4(), [group("G1", { color: 4 })]);
    let [m] = markers();
    expect(m.previousElementSibling).toBe(tabEl(2));
    expect(m.nextElementSibling).toBe(tabEl(3));
    expect(m.style.backgroundColor).toBe(css(SPACE_COLORS[4]));

    act(() =>
      usePaneDndStore.getState().setTarget({
        kind: "newTab",
        gap: { index: 3, groupId: null, onCollapsedHeader: false },
      }),
    );
    [m] = markers();
    expect(m.style.backgroundColor).toBe("");
  });
});
