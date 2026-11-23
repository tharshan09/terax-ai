// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => ({
  value: null as null | {
    spaces: unknown[];
    activeId: string | null;
    states: Map<string, unknown>;
  },
}));

vi.mock("./store", () => ({
  loadAll: () => Promise.resolve(loaded.value),
  saveActiveId: vi.fn(() => Promise.resolve()),
  saveSpacesList: vi.fn(() => Promise.resolve()),
}));
vi.mock("./useSpaces", () => ({
  useSpaces: { getState: () => ({ hydrate: vi.fn() }) },
}));
vi.mock("@/modules/ai/lib/native", () => ({
  native: { workspaceAuthorize: vi.fn(() => Promise.resolve()) },
}));
// useTabs (for DEFAULT_SPACE_ID) pulls these in; mocked to keep xterm and the
// tauri bridge out of the run.
vi.mock("@/modules/terminal/lib/useTerminalSession", () => ({
  disposeSession: vi.fn(),
}));
vi.mock("@/modules/terminal/lib/tmux", () => ({
  killTmuxSession: vi.fn(),
  listTmuxSessions: vi.fn(() => Promise.resolve([])),
  sanitizeSessionName: (n: string) => n,
  isValidSessionName: (n: string) => n.length > 0,
}));
vi.mock("@/modules/terminal/lib/managedTmux", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  reapOrphanedManagedSessions: vi.fn(() => Promise.resolve()),
}));

import type { TabGroup } from "@/modules/tabs/lib/tabGroups";
import type { Tab } from "@/modules/tabs/lib/useTabs";
import { useSpacesBoot } from "./useSpacesBoot";

function storedTerm(n: number, group?: number) {
  return {
    kind: "terminal",
    tree: { kind: "leaf", cwd: `/w/${n}` },
    customTitle: `t${n}`,
    ...(group !== undefined && { group }),
  };
}

const space = {
  id: "a",
  name: "A",
  root: null,
  env: { kind: "local" },
  createdAt: 1,
  updatedAt: 1,
};

async function boot(activeTabIndex: number) {
  loaded.value = {
    spaces: [space],
    activeId: "a",
    states: new Map([
      [
        "a",
        {
          tabs: [
            storedTerm(1),
            storedTerm(2, 0),
            storedTerm(3, 0),
            storedTerm(4, 1),
            storedTerm(5),
          ],
          groups: [
            { name: "G1", color: 1, collapsed: true },
            { name: "G2", color: 2, collapsed: true },
          ],
          activeTabIndex,
        },
      ],
    ]),
  };
  let n = 100;
  const replaceTabs = vi.fn(
    (_tabs: Tab[], _activeId: number, _groups?: TabGroup[]) => {},
  );
  renderHook(() =>
    useSpacesBoot({
      ready: true,
      launchCwd: "/w",
      home: "/home",
      allocId: () => n++,
      replaceTabs,
      markBooted: () => {},
      setActiveSpaceForNewTabs: () => {},
      adoptWorkspaceEnv: () => Promise.resolve(null),
    }),
  );
  await waitFor(() => expect(replaceTabs).toHaveBeenCalledTimes(1));
  const [tabs, activeId, groups] = replaceTabs.mock.calls[0];
  const title = (id: number) => {
    const t = tabs.find((x) => x.id === id);
    return t?.kind === "terminal" ? t.customTitle : undefined;
  };
  return { tabs, groups: groups ?? [], activeTitle: title(activeId) };
}

describe("useSpacesBoot with groups", () => {
  afterEach(cleanup);

  it("hands every tab and the collapsed groups to replaceTabs", async () => {
    const { tabs, groups } = await boot(3);
    expect(tabs).toHaveLength(5);
    expect(groups.map((g) => [g.name, g.collapsed])).toEqual([
      ["G1", true],
      ["G2", true],
    ]);
    expect(tabs.map((t) => t.groupId)).toEqual([
      undefined,
      groups[0].id,
      groups[0].id,
      groups[1].id,
      undefined,
    ]);
  });

  it("picks the active tab counting every stored tab, not the visible ones", async () => {
    expect((await boot(3)).activeTitle).toBe("t4");
    cleanup();
    expect((await boot(4)).activeTitle).toBe("t5");
  });
});
