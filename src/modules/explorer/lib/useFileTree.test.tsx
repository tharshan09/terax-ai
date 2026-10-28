// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, watchAdd } = vi.hoisted(() => ({
  invoke: vi.fn(),
  watchAdd: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => ({ kind: "local" }),
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (select: (s: object) => unknown) =>
    select({ showHidden: false, explorerGitDecorations: false }),
}));
vi.mock("./watch", () => ({
  watchAdd,
  watchRemove: vi.fn(),
  listenFsChanged: () => Promise.resolve(() => {}),
}));

import { type DirEntry, useFileTree } from "./useFileTree";

type Read = {
  path: string;
  resolve: (entries: DirEntry[]) => void;
  reject: (error: unknown) => void;
};

function reads(): Read[] {
  const pending: Read[] = [];
  invoke.mockImplementation((cmd: string, args: { path: string }) => {
    if (cmd !== "fs_read_dir") return Promise.resolve();
    return new Promise<DirEntry[]>((resolve, reject) => {
      pending.push({ path: args.path, resolve, reject });
    });
  });
  return pending;
}

const entry = (name: string, kind: DirEntry["kind"] = "file"): DirEntry => ({
  name,
  kind,
  size: 0,
  mtime: 0,
  gitignored: false,
});

type Tree = ReturnType<typeof useFileTree>;

function listing(tree: Tree, dir: string): string[] | string | undefined {
  const node = tree.nodeAt(dir);
  return node?.status === "loaded"
    ? node.entries.map((e) => e.name)
    : node?.status;
}

beforeEach(() => {
  vi.resetAllMocks();
  watchAdd.mockResolvedValue([]);
});
afterEach(cleanup);

describe("useFileTree folder reads", () => {
  it("keeps only the newest listing when reads of a folder finish out of order", async () => {
    const pending = reads();
    const { result } = renderHook(() => useFileTree("/ws"));
    await act(async () => pending[0].resolve([entry("first")]));

    act(() => {
      result.current.refresh("/ws");
      result.current.refresh("/ws");
    });
    const [older, newer] = pending.slice(1);
    await act(async () => newer.resolve([entry("new")]));
    await act(async () => older.resolve([entry("old")]));
    expect(listing(result.current, "/ws")).toEqual(["new"]);

    act(() => {
      result.current.refresh("/ws");
      result.current.refresh("/ws");
    });
    const [failing, fresh] = pending.slice(3);
    await act(async () => fresh.resolve([entry("fresh")]));
    await act(async () => failing.reject("Permission denied"));
    expect(listing(result.current, "/ws")).toEqual(["fresh"]);
  });

  it("drops a read that answers after the root changed", async () => {
    const pending = reads();
    const { result, rerender } = renderHook(({ root }) => useFileTree(root), {
      initialProps: { root: "/a" },
    });
    rerender({ root: "/b" });
    expect(pending.map((r) => r.path)).toEqual(["/a", "/b"]);
    await act(async () => pending[0].resolve([entry("from-a")]));
    expect(result.current.nodeAt("/a")).toBeUndefined();
    await act(async () => pending[1].resolve([entry("from-b")]));
    expect(listing(result.current, "/b")).toEqual(["from-b"]);
  });
});

describe("useFileTree watch state", () => {
  it("counts a folder as watched once the watcher reports its key and it is loaded", async () => {
    const pending = reads();
    watchAdd.mockImplementation(async (paths: string[]) =>
      paths.filter((p) => p !== "/ws/build"),
    );
    const { result } = renderHook(() => useFileTree("/ws"));
    expect(result.current.isWatched("/ws")).toBe(false);
    await act(async () =>
      pending[0].resolve([entry("docs", "dir"), entry("build", "dir")]),
    );
    expect(result.current.isWatched("/ws")).toBe(true);

    act(() => {
      result.current.expand("/ws/docs");
      result.current.expand("/ws/build");
    });
    expect(result.current.isExpanded("/ws/docs")).toBe(true);
    await act(async () => {
      pending[1].resolve([]);
      pending[2].resolve([]);
    });
    expect(result.current.isWatched("/ws/docs")).toBe(true);
    expect(result.current.isWatched("/ws/build")).toBe(false);

    act(() => result.current.toggle("/ws/docs"));
    expect(result.current.isExpanded("/ws/docs")).toBe(false);
    expect(result.current.isWatched("/ws/docs")).toBe(false);
  });
});
