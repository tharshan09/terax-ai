import { describe, expect, it } from "vitest";
import { stripLayout, type TabGroup } from "@/modules/tabs/lib/tabGroups";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import { hydrateSpace, hydrateTabs, serializeSpace } from "./serialize";
import type { SpaceState } from "./store";
import { isSpaceState } from "./validate";

function counter(start = 100): () => number {
  let n = start;
  return () => n++;
}

function term(id: number, over: Partial<Tab> = {}): Tab {
  return {
    id,
    kind: "terminal",
    spaceId: "a",
    title: `t${id}`,
    customTitle: `t${id}`,
    paneTree: { kind: "leaf", id: id * 10, cwd: `/w/${id}` },
    activeLeafId: id * 10,
    ...over,
  } as Tab;
}

function group(id: string, over: Partial<TabGroup> = {}): TabGroup {
  return { id, spaceId: "a", name: "", color: 0, collapsed: false, ...over };
}

function titleOf(t: Tab): string {
  return t.kind === "terminal" ? (t.customTitle ?? t.title) : t.title;
}

/** The strip as `["t1", ["Name", collapsed, color, "t2", "t3"], ...]`. */
function stripOf(state: { tabs: Tab[]; groups: TabGroup[] }, space = "a") {
  return stripLayout(state, space).map((item) =>
    item.kind === "tab"
      ? titleOf(item.tab)
      : [
          item.group.name,
          item.group.collapsed,
          item.group.color,
          ...item.members.map(titleOf),
        ],
  );
}

function stored(over: Partial<SpaceState> & Record<string, unknown>) {
  return { tabs: [], activeTabIndex: 0, ...over } as SpaceState;
}

function storedTerm(n: number, extra: Record<string, unknown> = {}) {
  return {
    kind: "terminal",
    tree: { kind: "leaf", cwd: `/w/${n}` },
    customTitle: `t${n}`,
    ...extra,
  };
}

describe("serializeSpace / hydrateSpace", () => {
  it("round-trips groups with name, colour, collapse and order", () => {
    const tabs = [
      term(1),
      term(2, { groupId: "G1" }),
      term(3, { groupId: "G1" }),
      term(4, { groupId: "G2" }),
    ];
    const groups = [
      group("G1", { name: "Messungen", color: 4, collapsed: true }),
      group("G2"),
    ];
    const out = serializeSpace(tabs, groups);
    expect(out.groups).toEqual([
      { name: "Messungen", color: 4, collapsed: true },
      { color: 0 },
    ]);
    expect(out.tabs.map((t) => t.group)).toEqual([undefined, 0, 0, 1]);
    expect("group" in out.tabs[0]).toBe(false);

    const back = hydrateSpace({ ...out, activeTabIndex: 0 }, "a", counter());
    expect(stripOf(back)).toEqual([
      "t1",
      ["Messungen", true, 4, "t2", "t3"],
      ["", false, 0, "t4"],
    ]);
  });

  it("writes groups in strip order, not in the order of the group list", () => {
    const tabs = [term(1, { groupId: "G2" }), term(2, { groupId: "G1" })];
    const out = serializeSpace(tabs, [
      group("G1", { name: "one" }),
      group("G2", { name: "two" }),
    ]);
    expect(out.groups?.map((g) => g.name)).toEqual(["two", "one"]);
    expect(out.tabs.map((t) => t.group)).toEqual([0, 1]);
  });

  it("loads a file from before groups like hydrateTabs, writes no groups field", () => {
    const old = stored({ tabs: [storedTerm(1), storedTerm(2)] as never });
    const back = hydrateSpace(old, "a", counter());
    const plain = hydrateTabs(old.tabs, "a", counter());
    expect(back.groups).toEqual([]);
    expect(back.tabs).toEqual(plain);
    expect(back.tabs.every((t) => t.groupId === undefined)).toBe(true);

    const out = serializeSpace([term(1), term(2)], []);
    expect("groups" in out).toBe(false);
    expect(out.tabs.some((t) => "group" in t)).toBe(false);
  });

  it("never writes a group whose members are all private, nor its name", () => {
    const tabs = [
      term(1, { groupId: "G1", private: true } as Partial<Tab>),
      term(2, { groupId: "G1", private: true } as Partial<Tab>),
      term(3, { groupId: "G2" }),
      term(4, { groupId: "G2", private: true } as Partial<Tab>),
      term(5, { groupId: "G3" }),
    ];
    const groups = [
      group("G1", { name: "geheim" }),
      group("G2", { name: "zwei" }),
      group("G3", { name: "drei" }),
    ];
    const out = serializeSpace(tabs, groups);
    expect(out.groups).toHaveLength(2);
    expect(out.tabs.map((t) => t.group)).toEqual([0, 1]);
    expect(JSON.stringify(out)).not.toContain("geheim");

    const back = hydrateSpace({ ...out, activeTabIndex: 0 }, "a", counter());
    expect(stripOf(back)).toEqual([
      ["zwei", false, 0, "t3"],
      ["drei", false, 0, "t5"],
    ]);
  });

  it("ignores a ref to a group of another space when writing", () => {
    const out = serializeSpace(
      [term(1, { groupId: "Gb" })],
      [group("Gb", { spaceId: "b" })],
    );
    expect("groups" in out).toBe(false);
    expect("group" in out.tabs[0]).toBe(false);
  });
});

describe("hydrateSpace with damaged group data", () => {
  const three = [storedTerm(1), storedTerm(2), storedTerm(3)];

  it("(a) groups as text: state valid, every tab loose", () => {
    const st = stored({
      tabs: three.map((t, i) => ({ ...t, group: i })) as never,
      groups: "x" as never,
    });
    expect(isSpaceState(st)).toBe(true);
    const back = hydrateSpace(st, "a", counter());
    expect(back.tabs).toHaveLength(3);
    expect(back.groups).toEqual([]);
    expect(back.tabs.every((t) => t.groupId === undefined)).toBe(true);
  });

  it("(b) null and number entries: refs to them are loose, the object loads", () => {
    const st = stored({
      tabs: three.map((t, i) => ({ ...t, group: i })) as never,
      groups: [null, 3, { name: "A" }] as never,
    });
    expect(isSpaceState(st)).toBe(true);
    const back = hydrateSpace(st, "a", counter());
    expect(stripOf(back)).toEqual(["t1", "t2", ["A", false, 0, "t3"]]);
  });

  it("(c) refs as text, negative, fractional or out of range: loose", () => {
    const st = stored({
      tabs: [
        storedTerm(1, { group: "1" }),
        storedTerm(2, { group: -1 }),
        storedTerm(3, { group: 0.5 }),
        storedTerm(4, { group: 7 }),
      ] as never,
      groups: [{ color: 1 }, { color: 2 }] as never,
    });
    expect(isSpaceState(st)).toBe(true);
    const back = hydrateSpace(st, "a", counter());
    expect(back.tabs).toHaveLength(4);
    expect(back.tabs.every((t) => t.groupId === undefined)).toBe(true);
    expect(back.groups).toEqual([]);
  });

  it("(d) collapsed other than true: expanded", () => {
    const st = stored({
      tabs: [storedTerm(1, { group: 0 })] as never,
      groups: [{ color: 1, collapsed: "yes" }] as never,
    });
    expect(isSpaceState(st)).toBe(true);
    const back = hydrateSpace(st, "a", counter());
    expect(back.groups).toHaveLength(1);
    expect(back.groups[0].collapsed).toBe(false);
  });

  it("keeps the tabs around a corrupt tab entry", () => {
    const st = stored({
      tabs: [
        storedTerm(1, { group: 0 }),
        null,
        storedTerm(2, { group: 0 }),
      ] as never,
      groups: [{ name: "A", color: 2 }] as never,
    });
    const back = hydrateSpace(st, "a", counter());
    expect(stripOf(back)).toEqual([["A", false, 2, "t1", "t2"]]);
  });

  it("falls back to the first colour for anything but a palette index", () => {
    const colors: unknown[] = [1.5, -1, 8, "2", null, undefined, 3];
    const st = stored({
      tabs: colors.map((_, i) => storedTerm(i + 1, { group: i })) as never,
      groups: colors.map((c) =>
        c === undefined ? { name: "n" } : { color: c },
      ) as never,
    });
    const back = hydrateSpace(st, "a", counter());
    expect(back.groups.map((g) => g.color)).toEqual([0, 0, 0, 0, 0, 0, 3]);
  });

  it("re-joins members split apart in the file behind the first one", () => {
    const st = stored({
      tabs: [
        storedTerm(1, { group: 0 }),
        storedTerm(2),
        storedTerm(3, { group: 0 }),
      ] as never,
      groups: [{ name: "A", color: 1 }] as never,
    });
    const back = hydrateSpace(st, "a", counter());
    expect(stripOf(back)).toEqual([["A", false, 1, "t1", "t3"], "t2"]);
  });
});

describe("group names over the restart", () => {
  const emoji = "\u{1F600}";

  it("keeps a 32-unit name with emoji unchanged through save and load", () => {
    const name = `${emoji.repeat(15)}ab`;
    expect(name.length).toBe(32);
    const out = serializeSpace(
      [term(1, { groupId: "G1" })],
      [group("G1", { name })],
    );
    const back = hydrateSpace({ ...out, activeTabIndex: 0 }, "a", counter());
    expect(back.groups[0].name).toBe(name);
  });

  it("cuts a stored over-long name without leaving half an emoji", () => {
    const st = stored({
      tabs: [storedTerm(1, { group: 0 }), storedTerm(2, { group: 1 })] as never,
      groups: [
        { name: `${"x".repeat(31)}${emoji}`, color: 0 },
        { name: 5 },
      ] as never,
    });
    const back = hydrateSpace(st, "a", counter());
    expect(back.groups.map((g) => g.name)).toEqual(["x".repeat(31), ""]);
  });
});

describe("hydrateSpace across spaces", () => {
  it("gives the first group of each space its own id, members stay home", () => {
    const allocId = counter();
    const a = hydrateSpace(
      stored({
        tabs: [storedTerm(1, { group: 0 })] as never,
        groups: [{ name: "A", color: 0 }],
      }),
      "a",
      allocId,
    );
    const b = hydrateSpace(
      stored({
        tabs: [storedTerm(2, { group: 0 })] as never,
        groups: [{ name: "B", color: 0 }],
      }),
      "b",
      allocId,
    );
    const ga = a.groups[0];
    const gb = b.groups[0];
    expect(ga.id).not.toBe(gb.id);
    expect([ga.spaceId, ga.name]).toEqual(["a", "A"]);
    expect([gb.spaceId, gb.name]).toEqual(["b", "B"]);
    expect(a.tabs.map((t) => t.groupId)).toEqual([ga.id]);
    expect(b.tabs.map((t) => t.groupId)).toEqual([gb.id]);
    const ids = [...a.tabs, ...b.tabs].map((t) => t.id);
    expect(ids).not.toContain(Number(ga.id.slice(1)));
    expect(ids).not.toContain(Number(gb.id.slice(1)));
  });
});
