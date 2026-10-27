// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const toastWarning = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("sonner", () => ({
  toast: {
    error: () => {},
    warning: (...args: unknown[]) => toastWarning(...args),
  },
}));
vi.mock("@/modules/workspace", () => ({
  currentWorkspaceEnv: () => ({ kind: "local" }),
}));
vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: (
    selector: (s: {
      editorAutoSave: boolean;
      editorAutoSaveDelay: number;
    }) => unknown,
  ) => selector({ editorAutoSave: false, editorAutoSaveDelay: 1000 }),
}));

import { useDocument } from "./useDocument";

const PATH = "/work/notes.txt";
const OTHER = "/work/other.txt";
const TEXT = { kind: "text", content: "a", size: 1, mtime: 1 };

function fakeDisk(read: unknown, statMtime = 1) {
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "fs_read_file":
        return read;
      case "fs_stat":
        return { size: 1, mtime: statMtime, kind: "file" };
      case "fs_write_file":
        return 2;
      default:
        throw new Error(`unexpected command ${cmd}`);
    }
  });
}

function calls(cmd: string) {
  return invokeMock.mock.calls.filter(([name]) => name === cmd);
}

function writtenContents() {
  return calls("fs_write_file").map(
    ([, args]) => (args as { content: string }).content,
  );
}

// Each write bumps the disk mtime at once but resolves only on `land()`, like a
// slow remote write whose file is already replaced.
function slowDisk() {
  let mtime = 1;
  const pending: Array<() => void> = [];
  invokeMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "fs_read_file":
        return TEXT;
      case "fs_stat":
        return { size: 1, mtime, kind: "file" };
      case "fs_write_file": {
        mtime += 1;
        const written = mtime;
        await new Promise<void>((resolve) => pending.push(resolve));
        return written;
      }
      default:
        throw new Error(`unexpected command ${cmd}`);
    }
  });
  return { land: () => pending.shift()?.() };
}

function mount() {
  return renderHook(() => useDocument({ path: PATH }));
}

async function save(result: ReturnType<typeof mount>["result"]) {
  await act(async () => {
    await result.current.save();
  });
}

describe("useDocument save", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    toastWarning.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("writes nothing while the file is still loading", async () => {
    fakeDisk(new Promise(() => {}));
    const { result } = mount();
    expect(result.current.doc.status).toBe("loading");
    await save(result);
    expect(calls("fs_write_file")).toHaveLength(0);
  });

  it("writes nothing for a binary file", async () => {
    fakeDisk({ kind: "binary", size: 10 });
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("binary"));
    await save(result);
    expect(calls("fs_write_file")).toHaveLength(0);
  });

  it("writes nothing for a clean text buffer", async () => {
    fakeDisk(TEXT);
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    await save(result);
    expect(calls("fs_stat")).toHaveLength(0);
    expect(calls("fs_write_file")).toHaveLength(0);
  });

  it("[AC-8] writes an edited buffer once", async () => {
    fakeDisk(TEXT);
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    await save(result);
    expect(calls("fs_stat")).toHaveLength(1);
    expect(calls("fs_write_file")).toEqual([
      ["fs_write_file", expect.objectContaining({ path: PATH, content: "ab" })],
    ]);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("[AC-8] runs an overlapping save after the running write, without a conflict", async () => {
    const disk = slowDisk();
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    await act(async () => {
      const first = result.current.save();
      await vi.waitFor(() => expect(calls("fs_write_file")).toHaveLength(1));
      result.current.onChange("abc");
      const second = result.current.save();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(calls("fs_write_file")).toHaveLength(1);
      disk.land();
      await vi.waitFor(() => expect(calls("fs_write_file")).toHaveLength(2));
      disk.land();
      await Promise.all([first, second]);
    });
    expect(writtenContents()).toEqual(["ab", "abc"]);
    expect(calls("fs_stat")).toHaveLength(2);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("[AC-8] lets a repeated save find the buffer already written", async () => {
    const disk = slowDisk();
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    await act(async () => {
      const both = Promise.all([result.current.save(), result.current.save()]);
      await vi.waitFor(() => expect(calls("fs_write_file")).toHaveLength(1));
      disk.land();
      await both;
    });
    expect(calls("fs_stat")).toHaveLength(1);
    expect(calls("fs_write_file")).toHaveLength(1);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("runs the next save once a hung write has had 15 s", async () => {
    let writes = 0;
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "fs_read_file":
          return TEXT;
        case "fs_stat":
          return { size: 1, mtime: 1, kind: "file" };
        case "fs_write_file":
          writes += 1;
          return writes === 1 ? new Promise(() => {}) : 2;
        default:
          throw new Error(`unexpected command ${cmd}`);
      }
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => result.current.onChange("ab"));
    await act(async () => {
      void result.current.save();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls("fs_write_file")).toHaveLength(1);
    let next: Promise<unknown> = Promise.resolve();
    await act(async () => {
      next = result.current.save();
      await vi.advanceTimersByTimeAsync(14_999);
    });
    expect(calls("fs_write_file")).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await next;
    });
    expect(writtenContents()).toEqual(["ab", "ab"]);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("writes nothing while the next file loads after a path change", async () => {
    invokeMock.mockImplementation(
      async (cmd: string, args: { path: string }) => {
        switch (cmd) {
          case "fs_read_file":
            return args.path === PATH ? TEXT : new Promise(() => {});
          case "fs_stat":
            return { size: 1, mtime: 1, kind: "file" };
          case "fs_write_file":
            return 2;
          default:
            throw new Error(`unexpected command ${cmd}`);
        }
      },
    );
    const { result, rerender } = renderHook(
      ({ path }) => useDocument({ path }),
      { initialProps: { path: PATH } },
    );
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    rerender({ path: OTHER });
    expect(result.current.doc.status).toBe("loading");
    await save(result);
    expect(calls("fs_stat")).toHaveLength(0);
    expect(calls("fs_write_file")).toHaveLength(0);
  });

  it("[AC-8] withholds the write when the file changed on disk", async () => {
    fakeDisk(TEXT, 2);
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    await save(result);
    expect(calls("fs_write_file")).toHaveLength(0);
    expect(toastWarning).toHaveBeenCalledTimes(1);
    expect(toastWarning).toHaveBeenCalledWith(
      "File changed on disk",
      expect.anything(),
    );
  });
});

describe("useDocument reload", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(cleanup);

  it("drops a late reload read of a file the editor has since left", async () => {
    let pathReads = 0;
    let finishReload: (res: unknown) => void = () => {};
    invokeMock.mockImplementation(
      async (cmd: string, args: { path: string }) => {
        if (cmd !== "fs_read_file")
          throw new Error(`unexpected command ${cmd}`);
        if (args.path === OTHER) {
          return { kind: "text", content: "other", size: 5, mtime: 1 };
        }
        pathReads += 1;
        if (pathReads === 1) return TEXT;
        return new Promise((resolve) => {
          finishReload = resolve;
        });
      },
    );
    const { result, rerender } = renderHook(
      ({ path }) => useDocument({ path }),
      { initialProps: { path: PATH } },
    );
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    let started = false;
    act(() => {
      started = result.current.reload();
    });
    expect(started).toBe(true);
    await waitFor(() => expect(pathReads).toBe(2));
    rerender({ path: OTHER });
    await waitFor(() =>
      expect(result.current.doc).toMatchObject({ content: "other" }),
    );
    await act(async () => {
      finishReload({ kind: "text", content: "stale", size: 5, mtime: 2 });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(result.current.doc).toEqual({
      status: "ready",
      content: "other",
      size: 5,
    });
  });
});
