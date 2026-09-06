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
});
