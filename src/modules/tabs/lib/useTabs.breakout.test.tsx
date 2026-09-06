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

import { useTabs } from "./useTabs";

/** The whole point of these two: `breakOutPane` reports what the state updater
 *  DID, not what a plan predicted, and the caller acts on that answer (it
 *  re-keys the pane's agent session and offers an undo). If React ever stopped
 *  running the updater eagerly here, the return would go quiet and the feature
 *  would half-work in a way no pure-function test could see. */
describe("useTabs break-out through React", () => {
  afterEach(cleanup);

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
    let undo = null as ReturnType<typeof hook.result.current.breakOutPane>;
    act(() => {
      undo = hook.result.current.breakOutPane(leafId, 0);
    });
    expect(undo).not.toBeNull();
    expect(hook.result.current.tabs).toHaveLength(2);
    expect(hook.result.current.activeId).toBe(undo?.tabId);
    // The pane is alone in the new tab, and gone from the old one.
    const born = hook.result.current.tabs.find((t) => t.id === undo?.tabId);
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
    let undo = null as ReturnType<typeof hook.result.current.breakOutPane>;
    act(() => {
      undo = hook.result.current.breakOutPane(leafId, 0);
    });
    expect(undo).toBeNull();
    expect(hook.result.current.tabs).toHaveLength(1);
  });

  it("puts the pane back and closes the tab it was born into", () => {
    const { hook, tabId, leafId } = splitTab();
    const before = hook.result.current.tabs.find((t) => t.id === tabId);
    const layout = before?.kind === "terminal" ? before.paneTree : null;
    let undo = null as ReturnType<typeof hook.result.current.breakOutPane>;
    act(() => {
      undo = hook.result.current.breakOutPane(leafId, 0);
    });
    if (!undo) throw new Error("expected a break-out");
    const record = undo;
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
    let undo = null as ReturnType<typeof hook.result.current.breakOutPane>;
    act(() => {
      undo = hook.result.current.breakOutPane(leafId, 0);
    });
    if (!undo) throw new Error("expected a break-out");
    const record = undo;
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
    let undo = null as ReturnType<typeof hook.result.current.breakOutPane>;
    act(() => {
      undo = hook.result.current.breakOutPane(leafId, 0);
    });
    if (!undo) throw new Error("expected a break-out");
    const record = undo;
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
    let undo = null as ReturnType<typeof hook.result.current.breakOutPane>;
    act(() => {
      undo = hook.result.current.breakOutPane(leafId, 0);
    });
    if (!undo) throw new Error("expected a break-out");
    const record = undo;
    expect(exists()).toBe(true);
    act(() => {
      hook.result.current.undoBreakOutPane(record);
    });
    expect(exists()).toBe(true);
  });
});
