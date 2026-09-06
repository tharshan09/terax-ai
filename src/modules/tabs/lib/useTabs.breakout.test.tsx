// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The hook only reaches these on an explicit close, which this suite never
// does; they are mocked to keep xterm and the tauri bridge out of the run.
vi.mock("@/modules/terminal/lib/useTerminalSession", () => ({
  disposeSession: vi.fn(),
}));
vi.mock("@/modules/terminal/lib/tmux", () => ({
  killTmuxSession: vi.fn(),
  listTmuxSessions: vi.fn(() => Promise.resolve([])),
  sanitizeSessionName: (n: string) => n,
  isValidSessionName: (n: string) => n.length > 0,
}));

import { leafIds } from "@/modules/terminal/lib/panes";
import type { BreakOutRefusal, BrokenOutPane } from "./useTabs";
import { useTabs } from "./useTabs";

/** The whole point of these two: `breakOutPane` reports what the state updater
 *  DID, not what a plan predicted, and the caller acts on that answer (it
 *  re-keys the pane's agent session and offers an undo). If React ever stopped
 *  running the updater eagerly here, the return would go quiet and the feature
 *  would half-work in a way no pure-function test could see. */
describe("useTabs break-out through React", () => {
  afterEach(cleanup);

  /** Break a pane out and hand back the undo record, narrowed. */
  function breakOut(
    hook: ReturnType<typeof renderHook<ReturnType<typeof useTabs>, unknown>>,
    leafId: number,
    gap = 0,
  ): BrokenOutPane {
    let out: BrokenOutPane | BreakOutRefusal = "collapsed";
    act(() => {
      out = hook.result.current.breakOutPane(leafId, gap);
    });
    if (typeof out === "string") throw new Error(`refused: ${out}`);
    return out;
  }

  function splitTab() {
    const hook = renderHook(() => useTabs());
    const tabId = hook.result.current.activeId;
    let leafId = 0;
    act(() => {
      leafId = hook.result.current.splitActivePane(tabId, "row") ?? 0;
    });
    expect(leafId).toBeGreaterThan(0);
    return { hook, tabId, leafId };
  }

  it("reports the break-out it committed, and switches to the new tab", () => {
    const { hook, leafId } = splitTab();
    const record = breakOut(hook, leafId);
    expect(hook.result.current.tabs).toHaveLength(2);
    expect(hook.result.current.activeId).toBe(record.tabId);
    // The pane is alone in the new tab, and gone from the old one.
    const born = hook.result.current.tabs.find((t) => t.id === record.tabId);
    expect(born?.kind === "terminal" && born.paneTree).toEqual({
      kind: "leaf",
      id: leafId,
      cwd: undefined,
    });
  });

  it("reports nothing when there is no split to break out of", () => {
    const hook = renderHook(() => useTabs());
    const only = hook.result.current.tabs[0];
    const leafId =
      only.kind === "terminal" && only.paneTree.kind === "leaf"
        ? only.paneTree.id
        : -1;
    let out: BrokenOutPane | BreakOutRefusal = "space-changed";
    act(() => {
      out = hook.result.current.breakOutPane(leafId, 0);
    });
    expect(out).toBe("collapsed");
    expect(hook.result.current.tabs).toHaveLength(1);
  });

  it("puts the pane back and closes the tab it was born into", () => {
    const { hook, tabId, leafId } = splitTab();
    const before = hook.result.current.tabs.find((t) => t.id === tabId);
    const layout = before?.kind === "terminal" ? before.paneTree : null;
    const record = breakOut(hook, leafId);
    let refusal: string | null = null;
    act(() => {
      refusal = hook.result.current.undoBreakOutPane(record);
    });
    expect(refusal).toBeNull();
    expect(hook.result.current.tabs).toHaveLength(1);
    expect(hook.result.current.activeId).toBe(tabId);
    const after = hook.result.current.tabs.find((t) => t.id === tabId);
    expect(after?.kind === "terminal" && after.paneTree).toEqual(layout);
  });

  it("refuses to undo over a layout the user changed after the drop", () => {
    const { hook, tabId, leafId } = splitTab();
    const record = breakOut(hook, leafId);
    act(() => {
      hook.result.current.splitActivePane(tabId, "col");
    });
    let refusal: string | null = null;
    act(() => {
      refusal = hook.result.current.undoBreakOutPane(record);
    });
    expect(refusal).toBe("invalid");
    expect(hook.result.current.tabs).toHaveLength(2);
  });

  it("refuses to undo a pane whose tab is already gone", () => {
    const { hook, leafId } = splitTab();
    const record = breakOut(hook, leafId);
    // The broken-out pane's shell exits while the toast still stands.
    act(() => {
      hook.result.current.closePaneByLeaf(record.leafId);
    });
    let refusal: string | null = null;
    act(() => {
      refusal = hook.result.current.undoBreakOutPane(record);
    });
    expect(refusal).toBe("invalid");
  });

  it("never leaves activeId naming a tab that is gone", () => {
    const { hook, leafId } = splitTab();
    const exists = () =>
      hook.result.current.tabs.some(
        (t) => t.id === hook.result.current.activeId,
      );
    const record = breakOut(hook, leafId);
    expect(exists()).toBe(true);
    act(() => {
      hook.result.current.undoBreakOutPane(record);
    });
    expect(exists()).toBe(true);
  });

  it("leaves the focus alone when the user moved on before undoing", () => {
    const { hook, tabId, leafId } = splitTab();
    const record = breakOut(hook, leafId);
    // The user switches to another tab while the toast still stands.
    let other = 0;
    act(() => {
      other = hook.result.current.newTab();
    });
    expect(hook.result.current.activeId).toBe(other);
    act(() => {
      hook.result.current.undoBreakOutPane(record);
    });
    // The pane went home, but the tab being worked in was untouched by it.
    expect(hook.result.current.activeId).toBe(other);
    const src = hook.result.current.tabs.find((t) => t.id === tabId);
    const home = src?.kind === "terminal" ? leafIds(src.paneTree) : [];
    expect(home).toHaveLength(2);
    expect(home).toContain(leafId);
  });

  it("refuses when the user changed space mid-drag", () => {
    const { hook, leafId } = splitTab();
    // The space shortcuts keep working while a pane is being dragged, so the
    // strip the drop is measured against can belong to another space by the
    // time the button comes up.
    act(() => {
      hook.result.current.setActiveSpaceForNewTabs("elsewhere");
    });
    let out: BrokenOutPane | BreakOutRefusal = "collapsed";
    act(() => {
      out = hook.result.current.breakOutPane(leafId, 0);
    });
    expect(out).toBe("space-changed");
    expect(hook.result.current.tabs).toHaveLength(1);
  });

  it("does not pull the user back from a tab they switched to mid-drag", () => {
    const { hook, leafId } = splitTab();
    // The tab shortcuts keep working while a pane is being dragged.
    let other = 0;
    act(() => {
      other = hook.result.current.newTab();
    });
    const record = breakOut(hook, leafId);
    // The pane got its tab, but the user stays where they were looking.
    expect(hook.result.current.activeId).toBe(other);
    expect(hook.result.current.tabs.some((t) => t.id === record.tabId)).toBe(
      true,
    );
  });

  it("swaps two panes without rebuilding the split", () => {
    const { hook, tabId, leafId } = splitTab();
    const before = hook.result.current.tabs.find((t) => t.id === tabId);
    const order = before?.kind === "terminal" ? leafIds(before.paneTree) : [];
    const split =
      before?.kind === "terminal" && before.paneTree.kind === "split"
        ? before.paneTree
        : null;
    expect(order).toHaveLength(2);
    act(() => {
      hook.result.current.swapPanes(order[1], order[0]);
    });
    const after = hook.result.current.tabs.find((t) => t.id === tabId);
    if (after?.kind !== "terminal") throw new Error("expected a terminal tab");
    expect(leafIds(after.paneTree)).toEqual([order[1], order[0]]);
    // Same split node, same direction: nothing was rebuilt, so the sizes the
    // user dragged are still the ones react-resizable-panels knows.
    expect(after.paneTree.kind).toBe("split");
    if (after.paneTree.kind === "split") {
      expect(after.paneTree.id).toBe(split?.id);
      expect(after.paneTree.dir).toBe(split?.dir);
    }
    // The focus goes with the pane that was dragged.
    expect(after.activeLeafId).toBe(order[1]);
    expect(hook.result.current.tabs).toHaveLength(1);
    expect(leafId).toBe(order[1]);
  });

  it("ignores a swap that names one pane twice or a pane from elsewhere", () => {
    const { hook, tabId, leafId } = splitTab();
    const snapshot = hook.result.current.tabs.find((t) => t.id === tabId);
    const tree = snapshot?.kind === "terminal" ? snapshot.paneTree : null;
    act(() => {
      hook.result.current.swapPanes(leafId, leafId);
    });
    act(() => {
      hook.result.current.swapPanes(leafId, 9999);
    });
    const after = hook.result.current.tabs.find((t) => t.id === tabId);
    expect(after?.kind === "terminal" && after.paneTree).toBe(tree);
  });

  // The pane subtree is keyed by SLOT, so a swap re-points a mounted pane at
  // another leaf instead of remounting it. Any React state living inside that
  // subtree is therefore positional, and the blocks overlay holds exactly such
  // state (a block id, a watermark flag). It is safe only because a blocks tab
  // can never hold a split, so its panes can never be swapped. This test guards
  // that assumption: if splitting a blocks tab is ever allowed, it fails here
  // rather than silently handing one pane's search bar to another.
  it("refuses to split a blocks tab, which is what keeps pane state per leaf", () => {
    const hook = renderHook(() => useTabs());
    let blocksTab = 0;
    act(() => {
      blocksTab = hook.result.current.newBlockTab();
    });
    let created: number | null = 0;
    act(() => {
      created = hook.result.current.splitActivePane(blocksTab, "row");
    });
    expect(created).toBeNull();
    const t = hook.result.current.tabs.find((x) => x.id === blocksTab);
    expect(t?.kind === "terminal" && leafIds(t.paneTree)).toHaveLength(1);
  });
});
