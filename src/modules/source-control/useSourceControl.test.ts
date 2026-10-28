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

const trackedStatus: GitStatusSnapshot = { ...status, upstream: "origin/main" };
const tracked: GitPanelSnapshot = {
  repo: {
    repoRoot: "/repo",
    branch: "main",
    upstream: "origin/main",
    isDetached: false,
  },
  status: trackedStatus,
};

describe("useSourceControl context switches", () => {
  it("drops a snapshot that lands after nobody watches and the context left its repo", async () => {
    let land = (_s: GitPanelSnapshot) => {};
    native.gitPanelSnapshot.mockImplementation(
      () =>
        new Promise<GitPanelSnapshot>((resolve) => {
          land = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ path, live }) => useSourceControl(path, true, { live }),
      { initialProps: { path: "/repo/app", live: true } },
    );
    await settle();
    expect(native.gitPanelSnapshot).toHaveBeenCalledWith("/repo/app");

    await act(async () => rerender({ path: "/other", live: false }));
    await settle(1000);
    await act(async () => land(snapshot));
    await settle();
    expect(result.current.repo).toBeNull();
    expect(result.current.hasRepo).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(gitStatusRuns()).toBe(1);
  });

  it("refreshes a new context while a refresh of the old one is running", async () => {
    const answer = new Map<string, (s: GitPanelSnapshot) => void>();
    native.gitPanelSnapshot.mockImplementation(
      (cwd: string) =>
        new Promise<GitPanelSnapshot>((resolve) => answer.set(cwd, resolve)),
    );
    const { result, rerender } = renderHook(
      ({ path }) => useSourceControl(path),
      { initialProps: { path: "/repo/app" } },
    );
    await settle();
    expect(native.gitPanelSnapshot).toHaveBeenCalledWith("/repo/app");

    await act(async () => rerender({ path: "/other" }));
    await settle(1000);
    expect(native.gitPanelSnapshot).toHaveBeenCalledWith("/other");

    const other: GitPanelSnapshot = {
      repo: {
        repoRoot: "/other",
        branch: "main",
        upstream: null,
        isDetached: false,
      },
      status: { ...status, repoRoot: "/other" },
    };
    await act(async () => answer.get("/other")?.(other));
    await act(async () => answer.get("/repo/app")?.(snapshot));
    await settle();
    expect(result.current.repo?.repoRoot).toBe("/other");
  });

  it("keeps a failed remote action's error while consumers come and go", async () => {
    native.gitPanelSnapshot.mockResolvedValue(tracked);
    native.gitPush.mockRejectedValue("push rejected");
    const statusAnswers: Array<() => void> = [];
    native.gitStatus.mockImplementation(
      () =>
        new Promise<GitStatusSnapshot>((resolve) =>
          statusAnswers.push(() => resolve(trackedStatus)),
        ),
    );
    const { result, rerender } = renderHook(
      ({ path, live }) => useSourceControl(path, true, { live }),
      { initialProps: { path: "/repo/app", live: true } },
    );
    await settle(1000);
    act(() => {
      void result.current.runRemoteAction("push");
    });
    await settle();
    await act(async () => {
      for (const answer of statusAnswers.splice(0)) answer();
    });
    await settle();
    expect(result.current.lastRemoteError).toBe("push rejected");

    await act(async () => rerender({ path: "/repo/app", live: false }));
    await settle(1000);
    await act(async () => rerender({ path: "/repo/app", live: true }));
    await settle(3000);
    expect(result.current.lastRemoteError).toBe("push rejected");

    await act(async () => rerender({ path: "/elsewhere", live: true }));
    await settle(1000);
    expect(result.current.lastRemoteError).toBeNull();
  });

  it("keeps a running remote action through a clear and never writes the old repo back", async () => {
    native.gitPanelSnapshot.mockImplementation(async (cwd: string) =>
      cwd === "/repo/app" ? tracked : { repo: null, status: null },
    );
    let finishPush = () => {};
    native.gitPush.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishPush = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ path, live }) => useSourceControl(path, true, { live }),
      { initialProps: { path: "/repo/app", live: true } },
    );
    await settle(1000);
    act(() => {
      void result.current.runRemoteAction("push");
    });
    await settle();
    expect(result.current.busyAction).toBe("push");

    await act(async () => rerender({ path: "/other", live: false }));
    await settle(1000);
    expect(result.current.hasRepo).toBe(false);
    expect(result.current.busyAction).toBe("push");

    await act(async () => finishPush());
    await settle();
    expect(native.gitStatus).not.toHaveBeenCalled();
    expect(native.gitPanelSnapshot).toHaveBeenLastCalledWith("/other");
    expect(result.current.status).toBeNull();
    expect(result.current.busyAction).toBeNull();
  });

  it("lands the status after a push when the context moved within the repo", async () => {
    native.gitPanelSnapshot.mockResolvedValue({
      ...tracked,
      status: { ...trackedStatus, ahead: 3 },
    });
    native.gitStatus.mockResolvedValue({ ...trackedStatus, ahead: 0 });
    let finishPush = () => {};
    native.gitPush.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishPush = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ path }) => useSourceControl(path),
      { initialProps: { path: "/repo/app" } },
    );
    await settle();
    expect(result.current.ahead).toBe(3);
    act(() => {
      void result.current.runRemoteAction("push");
    });
    await settle();

    await act(async () => rerender({ path: "/repo/lib" }));
    await settle();
    expect(native.gitStatus).not.toHaveBeenCalled();

    await act(async () => finishPush());
    await settle();
    expect(native.gitStatus).toHaveBeenCalledWith("/repo");
    expect(result.current.ahead).toBe(0);
  });

  it("does not count a dropped refresh as fresh", async () => {
    native.gitPanelSnapshot.mockResolvedValue(tracked);
    native.gitStatus.mockResolvedValue(trackedStatus);
    let landStale = () => {};
    native.gitStatus.mockImplementationOnce(
      () =>
        new Promise<GitStatusSnapshot>((resolve) => {
          landStale = () => resolve(trackedStatus);
        }),
    );
    const { result, rerender } = renderHook(
      ({ path, live }) => useSourceControl(path, true, { live }),
      { initialProps: { path: "/repo/app", live: true } },
    );
    await settle();
    await settle(5000);
    act(() => {
      void result.current.refresh();
    });
    await settle();
    expect(native.gitStatus).toHaveBeenCalledTimes(1);

    await act(async () => rerender({ path: "/repo/lib", live: false }));
    await settle();
    await act(async () => landStale());
    await settle();

    await act(async () => rerender({ path: "/repo/lib", live: true }));
    await settle(1000);
    expect(native.gitStatus).toHaveBeenCalledTimes(2);
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
