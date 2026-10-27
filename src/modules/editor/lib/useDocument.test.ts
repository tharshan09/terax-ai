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

  it("[AC-8] withholds the write when the file changed on disk", async () => {
    fakeDisk(TEXT, 2);
    const { result } = mount();
    await waitFor(() => expect(result.current.doc.status).toBe("ready"));
    act(() => result.current.onChange("ab"));
    expect(await save(result)).toBe("conflict");
    expect(calls("fs_write_file")).toHaveLength(0);
  });
});
