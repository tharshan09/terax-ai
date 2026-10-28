// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GitPanelSnapshot,
  GitStatusSnapshot,
} from "@/modules/ai/lib/native";

const { native } = vi.hoisted(() => ({
  native: {
    gitStatus: vi.fn(),
    gitPanelSnapshot: vi.fn(),
    gitFetch: vi.fn(),
    gitPullFfOnly: vi.fn(),
    gitPush: vi.fn(),
  },
}));
vi.mock("@/modules/ai/lib/native", () => ({ native }));
vi.mock("@/modules/workspace", () => ({
  useWorkspaceEnvStore: (select: (s: { env: { kind: "local" } }) => unknown) =>
    select({ env: { kind: "local" } }),
  workspaceScopeKey: () => "local",
}));

import { planContextRefresh, useSourceControl } from "./useSourceControl";

const status: GitStatusSnapshot = {
  repoRoot: "/repo",
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  isDetached: false,
  insertions: 0,
  deletions: 0,
  truncated: false,
  changedFiles: [],
};
const snapshot: GitPanelSnapshot = {
  repo: {
    repoRoot: "/repo",
    branch: "main",
    upstream: null,
    isDetached: false,
  },
  status,
};

// Both commands run `git status` on the native side.
const gitStatusRuns = () =>
  native.gitStatus.mock.calls.length +
  native.gitPanelSnapshot.mock.calls.length;

async function settle(ms = 0) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

// Past the focus debounce and the minimum interval between refreshes.
async function focusWindow() {
  await settle(2000);
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
  });
  await settle(1000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  native.gitPanelSnapshot.mockResolvedValue(snapshot);
  native.gitStatus.mockResolvedValue(status);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useSourceControl live option", () => {
  // [AC-6]
  it("runs no git status until live, then exactly one, then refreshes on focus", async () => {
    const { rerender } = renderHook(
      ({ live }) => useSourceControl("/repo/app", true, { live }),
      { initialProps: { live: false } },
    );
    await settle(1000);
    for (let i = 0; i < 3; i++) await focusWindow();
    expect(gitStatusRuns()).toBe(0);

    await act(async () => rerender({ live: true }));
    await settle(1000);
    expect(gitStatusRuns()).toBe(1);

    await focusWindow();
    expect(gitStatusRuns()).toBe(2);
  });

  it("stops refreshing on focus once no consumer is left", async () => {
    const { rerender } = renderHook(
      ({ live }) => useSourceControl("/repo/app", true, { live }),
      { initialProps: { live: true } },
    );
    await settle(1000);
    expect(gitStatusRuns()).toBe(1);

    await act(async () => rerender({ live: false }));
    await settle(1000);
    for (let i = 0; i < 3; i++) await focusWindow();
    expect(gitStatusRuns()).toBe(1);
  });

  it("refreshes on focus by default", async () => {
    renderHook(() => useSourceControl("/repo/app"));
    await settle(1000);
    expect(gitStatusRuns()).toBe(1);
    await focusWindow();
    expect(gitStatusRuns()).toBe(2);
  });
});

describe("planContextRefresh", () => {
  const loaded = {
    live: true,
    contextPath: "/repo/app",
    repoRoot: "/repo",
    hasRepo: true,
    ageMs: 60_000,
  };

  it("runs git for a live consumer when the data is old or missing", () => {
    expect(planContextRefresh(loaded)).toBe("refresh");
    expect(
      planContextRefresh({ ...loaded, repoRoot: null, hasRepo: false }),
    ).toBe("refresh");
  });

  it("reuses very fresh data inside the same repository only", () => {
    expect(planContextRefresh({ ...loaded, ageMs: 500 })).toBe("reuse");
    expect(
      planContextRefresh({ ...loaded, ageMs: 500, contextPath: "/other" }),
    ).toBe("refresh");
    expect(
      planContextRefresh({ ...loaded, ageMs: 500, contextPath: "/repo-two" }),
    ).toBe("refresh");
  });

  it("never runs git while no consumer is live", () => {
    for (const ageMs of [0, 500, 60_000, 3_600_000]) {
      for (const contextPath of ["/repo/app", "/other", null]) {
        expect(
          planContextRefresh({ ...loaded, live: false, ageMs, contextPath }),
        ).not.toBe("refresh");
      }
    }
  });

  it("keeps the snapshot inside its repository and drops it outside", () => {
    expect(planContextRefresh({ ...loaded, live: false })).toBe("keep");
    expect(
      planContextRefresh({ ...loaded, live: false, contextPath: "/other" }),
    ).toBe("clear");
    expect(
      planContextRefresh({ ...loaded, live: false, contextPath: null }),
    ).toBe("clear");
    expect(
      planContextRefresh({
        ...loaded,
        live: false,
        repoRoot: null,
        hasRepo: false,
      }),
    ).toBe("keep");
  });
});
