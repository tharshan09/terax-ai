// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaneNode } from "@/modules/terminal/lib/panes";

// Spy on the pane-tree walk so we can prove it does NOT run per agent-store
// change. The real implementation is preserved via importActual.
vi.mock("@/modules/terminal/lib/panes", async () => {
  const actual =
    await vi.importActual<typeof import("@/modules/terminal/lib/panes")>(
      "@/modules/terminal/lib/panes",
    );
  return { ...actual, leafIds: vi.fn(actual.leafIds) };
});

import { useAgentStore } from "@/modules/agents/store/agentStore";
import { leafIds } from "@/modules/terminal/lib/panes";
import { TabActivityIndicator } from "./TabActivityIndicator";
import { selectTabAgentStatus } from "./lib/selectTabAgentStatus";

const leafIdsMock = leafIds as unknown as ReturnType<typeof vi.fn>;

describe("TabActivityIndicator selector (W3)", () => {
  beforeEach(() => {
    leafIdsMock.mockClear();
    useAgentStore.setState({ sessions: {}, notifications: [], localAgent: null });
  });
  afterEach(cleanup);

  it("does not re-walk the pane tree on agent-store changes irrelevant to the tab", () => {
    const paneTree: PaneNode = { kind: "leaf", id: 7 };
    render(<TabActivityIndicator paneTree={paneTree} />);

    // The tree is walked exactly once (the memoized derivation), regardless of
    // how many store transitions follow. The OLD selector called leafIds inline,
    // so it re-walked on every one of these dispatches.
    expect(leafIdsMock).toHaveBeenCalledTimes(1);

    act(() => {
      // Agent churn on a DIFFERENT tab's leaf (999) — irrelevant to leaf 7.
      useAgentStore.getState().start(999, 42, "claude");
      useAgentStore.getState().setStatus(999, "working");
      useAgentStore.getState().setStatus(999, "waiting");
      useAgentStore.getState().finish(999);
    });

    // Still one walk: the memoized id list absorbed all four store changes and
    // the primitive selector result stayed `null`, so nothing re-rendered.
    expect(leafIdsMock).toHaveBeenCalledTimes(1);
  });

  it("still reflects this tab's own agent status", () => {
    const paneTree: PaneNode = { kind: "leaf", id: 7 };
    const { container } = render(<TabActivityIndicator paneTree={paneTree} />);
    expect(container.querySelector("[aria-label]")).toBeNull();

    act(() => {
      useAgentStore.getState().start(7, 1, "claude");
      useAgentStore.getState().setStatus(7, "working");
    });
    expect(
      container.querySelector('[aria-label="Agent working"]'),
    ).not.toBeNull();
  });
});

describe("selectTabAgentStatus (W3)", () => {
  const session = (status: "idle" | "working" | "waiting") => ({
    leafId: 0,
    tabId: 0,
    agent: "claude",
    origin: "osc" as const,
    status,
    startedAt: 0,
    lastActivityAt: 0,
    attentionSince: null,
  });

  it("returns a referentially stable primitive across reads (no per-read array)", () => {
    const sessions = { 7: session("waiting") };
    const ids = [7, 8];
    const a = selectTabAgentStatus(sessions, ids);
    const b = selectTabAgentStatus(sessions, ids);
    expect(a).toBe("waiting");
    expect(a).toBe(b);
  });

  it('collapses statuses with "working" winning over "waiting"', () => {
    const sessions = { 1: session("waiting"), 2: session("working") };
    expect(selectTabAgentStatus(sessions, [1, 2])).toBe("working");
    expect(selectTabAgentStatus(sessions, [1])).toBe("waiting");
    expect(selectTabAgentStatus(sessions, [3])).toBeNull();
    expect(selectTabAgentStatus({ 1: session("idle") }, [1])).toBeNull();
  });
});
