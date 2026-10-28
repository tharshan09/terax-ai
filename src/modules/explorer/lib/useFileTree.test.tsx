// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
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
  watchAdd: vi.fn(),
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
  const node = tree.nodes[dir];
  return node?.status === "loaded"
    ? node.entries.map((e) => e.name)
    : node?.status;
}

beforeEach(() => vi.resetAllMocks());
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
    let stale: Promise<void> | undefined;
    act(() => {
      stale = result.current.refresh("/a");
    });
    rerender({ root: "/b" });
    expect(pending.map((r) => r.path)).toEqual(["/a", "/a", "/b"]);
    await act(async () => {
      pending[0].resolve([entry("from-a")]);
      pending[1].resolve([entry("from-a")]);
    });
    await act(async () => {
      await stale;
    });
    expect(result.current.nodes["/a"]).toBeUndefined();
    await act(async () => pending[2].resolve([entry("from-b")]));
    expect(listing(result.current, "/b")).toEqual(["from-b"]);
  });
});

describe("useFileTree read promises", () => {
  it("settles refresh only once the read shows in the rendered tree", async () => {
    const pending = reads();
    let rendered: string[] | string | undefined;
    const { result } = renderHook(() => {
      const tree = useFileTree("/ws");
      rendered = listing(tree, "/ws");
      return tree;
    });
    await act(async () => pending[0].resolve([entry("a")]));

    let seen: string[] | string | undefined;
    act(() => {
      void result.current.refresh("/ws").then(() => {
        seen = rendered;
      });
    });
    await act(async () => {});
    expect(seen).toBeUndefined();
    await act(async () => pending[1].resolve([entry("a"), entry("b")]));
    await vi.waitFor(() => expect(seen).toEqual(["a", "b"]));
  });

  it("settles an overtaken read together with the newest one", async () => {
    const pending = reads();
    const { result } = renderHook(() => useFileTree("/ws"));
    await act(async () => pending[0].resolve([entry("a")]));

    const settled: string[] = [];
    act(() => {
      void result.current.refresh("/ws").then(() => settled.push("older"));
      void result.current.refresh("/ws").then(() => settled.push("newer"));
    });
    const [older, newer] = pending.slice(1);
    await act(async () => older.resolve([entry("old")]));
    expect(settled).toEqual([]);
    await act(async () => newer.resolve([entry("new")]));
    await vi.waitFor(() => expect(settled.sort()).toEqual(["newer", "older"]));
    expect(listing(result.current, "/ws")).toEqual(["new"]);
  });

  it("settles a read finishing after the newer one landed only once that listing rendered", async () => {
    const pending = reads();
    let rendered: string[] | string | undefined;
    const { result } = renderHook(() => {
      const tree = useFileTree("/ws");
      rendered = listing(tree, "/ws");
      return tree;
    });
    await act(async () => pending[0].resolve([entry("a")]));
    const hasRow = (name: string) =>
      Array.isArray(rendered) && rendered.includes(name);

    let sawNewRow: boolean | undefined;
    act(() => {
      void result.current.refresh("/ws").then(() => {
        sawNewRow = hasRow("new");
      });
      void result.current.refresh("/ws");
    });
    const [older, newer] = pending.slice(1);
    // Inside act React holds the render back, so the newer listing has landed
    // but is not on screen when the older read answers.
    const tick = () => new Promise((done) => setTimeout(done, 0));
    await act(async () => {
      newer.resolve([entry("a"), entry("new")]);
      await tick();
      older.resolve([entry("a"), entry("old")]);
      await tick();
      expect(sawNewRow).toBeUndefined();
    });
    await vi.waitFor(() => expect(sawNewRow).toBe(true));
    expect(listing(result.current, "/ws")).toEqual(["a", "new"]);
  });

  it("settles expand once the folder's listing is in the tree", async () => {
    const pending = reads();
    const { result } = renderHook(() => useFileTree("/ws"));
    await act(async () => pending[0].resolve([entry("docs", "dir")]));

    let expanding: Promise<void> | undefined;
    act(() => {
      expanding = result.current.expand("/ws/docs");
    });
    expect(result.current.isExpanded("/ws/docs")).toBe(true);
    await act(async () => pending[1].resolve([entry("a.txt")]));
    await act(async () => {
      await expanding;
    });
    expect(listing(result.current, "/ws/docs")).toEqual(["a.txt"]);

    await act(async () => {
      await result.current.expand("/ws/docs");
    });
    expect(pending).toHaveLength(2);
  });
});
