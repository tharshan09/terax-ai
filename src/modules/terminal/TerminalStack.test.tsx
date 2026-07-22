// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TerminalTab } from "@/modules/tabs";
import type { SearchAddon } from "@xterm/addon-search";

// Count how often each mounted leaf's heavy content (the xterm-backed pane)
// renders. The mock is a plain component (no React.memo), so React re-runs it
// whenever its parent actually reconciles it — which is exactly the O(N)-vs-O(1)
// signal this test guards. `leafId` keys the counter.
const paneRenderCounts = new Map<number, number>();
vi.mock("./TerminalPane", () => ({
  TerminalPane: ({ leafId }: { leafId: number }) => {
    paneRenderCounts.set(leafId, (paneRenderCounts.get(leafId) ?? 0) + 1);
    return null;
  },
}));

// Keep the tree hermetic: the real preferences store hydrates from disk/Tauri.
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (
    selector: (s: {
      activePaneMarker: string;
      inactivePaneStyle: string;
      paneHeaders: boolean;
    }) => unknown,
  ) =>
    selector({
      activePaneMarker: "off",
      inactivePaneStyle: "dim",
      paneHeaders: false,
    }),
}));

import { TerminalStack } from "./TerminalStack";

const LEAF_BASE = 1000;

function makeTabs(n: number): TerminalTab[] {
  return Array.from({ length: n }, (_, i) => {
    const id = i + 1;
    const leafId = LEAF_BASE + id;
    return {
      id,
      spaceId: "s1",
      kind: "terminal",
      title: `t${id}`,
      paneTree: { kind: "leaf", id: leafId },
      activeLeafId: leafId,
    } satisfies TerminalTab;
  });
}

const noop = () => {};
const noopSearch = (_leafId: number, _addon: SearchAddon) => {};

function element(tabs: TerminalTab[], activeId: number) {
  return (
    <TerminalStack
      tabs={tabs}
      activeId={activeId}
      registerHandle={noop}
      onSearchReady={noopSearch}
      onCwd={noop}
      onExit={noop}
      onFocusLeaf={noop}
      movePane={noop}
    />
  );
}

describe("TerminalStack tab-switch render isolation (W3)", () => {
  beforeEach(() => paneRenderCounts.clear());
  afterEach(cleanup);

  it("re-renders only the two involved tabs on a bare activeId switch", () => {
    const tabs = makeTabs(20);
    const { rerender } = render(element(tabs, 1));

    // Every mounted leaf renders exactly once on mount.
    for (let i = 1; i <= 20; i++) {
      expect(paneRenderCounts.get(LEAF_BASE + i)).toBe(1);
    }

    // Pure tab switch: SAME `tabs` array reference, only `activeId` flips 1 -> 2.
    rerender(element(tabs, 2));

    // Only the outgoing tab (1) and incoming tab (2) re-render; the other 18
    // stay at their mount count. This is what keeps switch cost off the tab
    // count.
    expect(paneRenderCounts.get(LEAF_BASE + 1)).toBe(2);
    expect(paneRenderCounts.get(LEAF_BASE + 2)).toBe(2);
    for (let i = 3; i <= 20; i++) {
      expect(paneRenderCounts.get(LEAF_BASE + i)).toBe(1);
    }
  });

  it("re-renders only the touched tab when one leaf's cwd changes (cd)", () => {
    const tabs = makeTabs(20);
    const { rerender } = render(element(tabs, 1));
    for (let i = 1; i <= 20; i++) {
      expect(paneRenderCounts.get(LEAF_BASE + i)).toBe(1);
    }

    // A `cd` on tab 5's leaf: the store rebuilds only tab 5's object (structural
    // sharing keeps every other tab's identity), so the parent hands a new
    // `tabs` array in which just tab 5 differs.
    const changedLeaf = LEAF_BASE + 5;
    const next = tabs.map((t) =>
      t.id === 5
        ? {
            ...t,
            paneTree: { kind: "leaf" as const, id: changedLeaf, cwd: "/new" },
          }
        : t,
    );
    rerender(element(next, 1));

    // Only the touched tab re-renders its pane; the rest bail.
    expect(paneRenderCounts.get(changedLeaf)).toBe(2);
    for (const i of [1, 2, 3, 4, 6, 10, 20]) {
      expect(paneRenderCounts.get(LEAF_BASE + i)).toBe(1);
    }
  });
});
