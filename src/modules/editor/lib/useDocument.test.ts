// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
const toastError = vi.fn();
const toastWarning = vi.fn();
const toastMessage = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
    message: (...args: unknown[]) => toastMessage(...args),
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
const LEFT = "Not saved: notes.txt was moved or closed";
const WAITING = "Waiting for the previous save to finish";

beforeEach(() => {
  invokeMock.mockReset();
  toastError.mockReset();
  toastWarning.mockReset();
  toastMessage.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

function mountMovable() {
  return renderHook(({ path }) => useDocument({ path }), {
    initialProps: { path: PATH },
  });
}

// Reads PATH at once and every other path never, like a file the editor moved to.
function readOnlyPath(args: { path: string }) {
  return args.path === PATH ? TEXT : new Promise(() => {});
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function save(result: ReturnType<typeof mount>["result"]) {
  await act(async () => {
    await result.current.save();
  });
}

describe("useDocument save", () => {
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

  it("never writes beside a hung write, hints once after 5 s, then runs next", async () => {
    const disk = slowDisk();
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => result.current.onChange("ab"));
    let first: Promise<boolean> = Promise.resolve(true);
    let second: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      first = result.current.save();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls("fs_write_file")).toHaveLength(1);
    act(() => result.current.onChange("abc"));
    await act(async () => {
      second = result.current.save();
      await vi.advanceTimersByTimeAsync(4_999);
    });
    expect(toastMessage).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(toastMessage).toHaveBeenCalledTimes(1);
    expect(toastMessage).toHaveBeenCalledWith(WAITING, expect.anything());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600_000);
    });
    expect(calls("fs_write_file")).toHaveLength(1);
    expect(toastMessage).toHaveBeenCalledTimes(1);
    await act(async () => {
      disk.land();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(calls("fs_write_file")).toHaveLength(2);
    await act(async () => {
      disk.land();
      await vi.advanceTimersByTimeAsync(0);
      await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    });
    expect(writtenContents()).toEqual(["ab", "abc"]);
    expect(toastWarning).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reports a save whose file the editor left during the conflict check", async () => {
    let finishStat: (stat: unknown) => void = () => {};
    invokeMock.mockImplementation(
      async (cmd: string, args: { path: string }) => {
        switch (cmd) {
          case "fs_read_file":
            return readOnlyPath(args);
          case "fs_stat":
            return new Promise((resolve) => {
              finishStat = resolve;
            });
          case "fs_write_file":
            return 2;
          default:
            throw new Error(`unexpected command ${cmd}`);
        }
      },
    );
    const { result, rerender } = mountMovable();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    let saved: Promise<boolean> = Promise.resolve(true);
    act(() => {
      saved = result.current.save();
    });
    await waitFor(() => expect(calls("fs_stat")).toHaveLength(1));
    rerender({ path: OTHER });
    await act(async () => {
      finishStat({ size: 1, mtime: 1, kind: "file" });
      await expect(saved).resolves.toBe(false);
    });
    expect(calls("fs_write_file")).toHaveLength(0);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(LEFT);
  });

  it("reports an Overwrite for a file the editor has since left", async () => {
    invokeMock.mockImplementation(
      async (cmd: string, args: { path: string }) => {
        switch (cmd) {
          case "fs_read_file":
            return readOnlyPath(args);
          case "fs_stat":
            return { size: 1, mtime: 2, kind: "file" };
          case "fs_write_file":
            return 3;
          default:
            throw new Error(`unexpected command ${cmd}`);
        }
      },
    );
    const { result, rerender } = mountMovable();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    await save(result);
    const [, conflict] = toastWarning.mock.calls[0] as [
      string,
      { action: { onClick: () => void } },
    ];
    rerender({ path: OTHER });
    await act(async () => {
      conflict.action.onClick();
      await flush();
    });
    expect(calls("fs_write_file")).toHaveLength(0);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith(LEFT);
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
  it("keeps a save that lands while a reload read is still in flight", async () => {
    let mtime = 1;
    let reads = 0;
    let finishReload: (res: unknown) => void = () => {};
    invokeMock.mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "fs_read_file":
          reads += 1;
          if (reads === 1) return TEXT;
          return new Promise((resolve) => {
            finishReload = resolve;
          });
        case "fs_stat":
          return { size: 1, mtime, kind: "file" };
        case "fs_write_file":
          mtime += 1;
          return mtime;
        default:
          throw new Error(`unexpected command ${cmd}`);
      }
    });
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => {
      result.current.reload();
    });
    await waitFor(() => expect(reads).toBe(2));
    act(() => result.current.onChange("ab"));
    await save(result);
    await waitFor(() => expect(result.current.dirty).toBe(false));
    await act(async () => {
      finishReload({ kind: "text", content: "a", size: 1, mtime: 1 });
      await flush();
    });
    act(() => result.current.onChange("abc"));
    await save(result);
    expect(writtenContents()).toEqual(["ab", "abc"]);
    expect(toastWarning).not.toHaveBeenCalled();
  });

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
      await flush();
    });
    expect(result.current.doc).toEqual({
      status: "ready",
      content: "other",
      size: 5,
    });
  });
});
