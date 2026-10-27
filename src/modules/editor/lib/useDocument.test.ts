// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));
vi.mock("sonner", () => ({
  toast: { error: () => {}, warning: () => {} },
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

import { type SaveOutcome, useDocument } from "./useDocument";

const PATH = "/work/notes.txt";
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

async function save(
  result: ReturnType<typeof mount>["result"],
): Promise<SaveOutcome | undefined> {
  let outcome: SaveOutcome | undefined;
  await act(async () => {
    outcome = await result.current.save();
  });
  return outcome;
}

describe("useDocument save outcome", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  afterEach(cleanup);

  it("writes nothing while the file is still loading", async () => {
    fakeDisk(new Promise(() => {}));
    const { result } = mount();
    expect(result.current.doc.status).toBe("loading");
    expect(await save(result)).toBe("unchanged");
    expect(calls("fs_write_file")).toHaveLength(0);
  });

  it("writes nothing for a binary file", async () => {
    fakeDisk({ kind: "binary", size: 10 });
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("binary"));
    expect(await save(result)).toBe("unchanged");
    expect(calls("fs_write_file")).toHaveLength(0);
  });

  it("writes nothing for a clean text buffer", async () => {
    fakeDisk(TEXT);
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    expect(await save(result)).toBe("unchanged");
    expect(calls("fs_stat")).toHaveLength(0);
    expect(calls("fs_write_file")).toHaveLength(0);
  });

  it("[AC-8] reports a real write of an edited buffer", async () => {
    fakeDisk(TEXT);
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    expect(await save(result)).toBe("written");
    expect(calls("fs_write_file")).toEqual([
      ["fs_write_file", expect.objectContaining({ path: PATH, content: "ab" })],
    ]);
  });

  it("[AC-8] runs an overlapping save after the running write, without a conflict", async () => {
    const disk = slowDisk();
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    let outcomes: SaveOutcome[] = [];
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
      outcomes = await Promise.all([first, second]);
    });
    expect(outcomes).toEqual(["written", "written"]);
    expect(
      calls("fs_write_file").map(
        ([, args]) => (args as { content: string }).content,
      ),
    ).toEqual(["ab", "abc"]);
  });

  it("[AC-8] lets a repeated save find the buffer already written", async () => {
    const disk = slowDisk();
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    let outcomes: SaveOutcome[] = [];
    await act(async () => {
      const both = Promise.all([result.current.save(), result.current.save()]);
      await vi.waitFor(() => expect(calls("fs_write_file")).toHaveLength(1));
      disk.land();
      outcomes = await both;
    });
    expect(outcomes).toEqual(["written", "unchanged"]);
    expect(calls("fs_write_file")).toHaveLength(1);
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
    rerender({ path: "/work/other.txt" });
    expect(result.current.doc.status).toBe("loading");
    expect(await save(result)).toBe("unchanged");
    expect(calls("fs_stat")).toHaveLength(0);
    expect(calls("fs_write_file")).toHaveLength(0);
  });

  it("[AC-8] withholds the write when the file changed on disk", async () => {
    fakeDisk(TEXT, 2);
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    expect(await save(result)).toBe("conflict");
    expect(calls("fs_write_file")).toHaveLength(0);
  });
});
