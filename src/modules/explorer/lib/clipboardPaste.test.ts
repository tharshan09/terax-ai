import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPasteShortcut,
  parentDir,
  pasteClipboardFiles,
  pasteTargetDir,
} from "@/modules/explorer/lib/clipboardPaste";

const { invoke, toast } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { message: vi.fn(), error: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => vi.resetAllMocks());

describe("pasteTargetDir", () => {
  const dirs = new Set(["/ws/docs", "/ws/b"]);
  const isDir = (p: string) => dirs.has(p);

  it("pastes into a selected folder, beside a selected file, else at the root", () => {
    expect(pasteTargetDir("/ws/docs", isDir, "/ws")).toBe("/ws/docs");
    expect(pasteTargetDir("/ws/docs/x.md", isDir, "/ws")).toBe("/ws/docs");
    expect(pasteTargetDir(null, isDir, "/ws")).toBe("/ws");
  });

  it("uses the right-clicked row, not the selection, for the row menu", () => {
    const selected = "/ws/a.md";
    expect(pasteTargetDir(selected, isDir, "/ws")).toBe("/ws");
    expect(pasteTargetDir("/ws/b", () => true, "/ws")).toBe("/ws/b");
  });

  it.each([
    ["C:/a.txt", "C:/"],
    ["C:/repo/a.txt", "C:/repo"],
    ["/a.txt", "/"],
    ["//server/share/a.txt", "//server/share"],
  ])("keeps absolute roots for %s", (path, parent) => {
    expect(parentDir(path, "fallback")).toBe(parent);
  });
});

describe("isPasteShortcut", () => {
  const key = (k: Partial<KeyboardEvent>) => ({
    key: "v",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...k,
  });

  it("accepts only Cmd+V on macOS", () => {
    expect(isPasteShortcut(key({ metaKey: true }), true)).toBe(true);
    expect(isPasteShortcut(key({ key: "V", metaKey: true }), true)).toBe(true);
    expect(isPasteShortcut(key({ metaKey: true, shiftKey: true }), true)).toBe(
      false,
    );
    expect(isPasteShortcut(key({ metaKey: true, altKey: true }), true)).toBe(
      false,
    );
    expect(isPasteShortcut(key({ ctrlKey: true }), true)).toBe(false);
    expect(isPasteShortcut(key({ metaKey: true, ctrlKey: true }), true)).toBe(
      false,
    );
    expect(isPasteShortcut(key({ key: "c", metaKey: true }), true)).toBe(false);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function options() {
  return {
    workspace: { kind: "ssh" as const, host: "litha-claude" },
    isCurrent: vi.fn(() => true),
    refresh: vi.fn((_path: string) => {}),
  };
}

describe("pasteClipboardFiles", () => {
  it("copies with Finder naming in the captured workspace", async () => {
    invoke
      .mockResolvedValueOnce(["/tmp/a.txt", "/tmp/b.txt"])
      .mockResolvedValueOnce({
        created: ["/ws/docs/a.txt", "/ws/docs/b.txt"],
        failed: [],
      });
    const opts = options();
    expect(await pasteClipboardFiles("/ws/docs", opts)).toEqual([
      "/ws/docs/a.txt",
      "/ws/docs/b.txt",
    ]);
    expect(invoke).toHaveBeenLastCalledWith("fs_copy", {
      sources: ["/tmp/a.txt", "/tmp/b.txt"],
      destDir: "/ws/docs",
      workspace: { kind: "ssh", host: "litha-claude" },
      renameOnConflict: true,
    });
    expect(opts.refresh).toHaveBeenCalledWith("/ws/docs");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("stops with a hint when the clipboard holds no files", async () => {
    invoke.mockResolvedValueOnce([]);
    const opts = options();
    expect(await pasteClipboardFiles("/ws", opts)).toEqual([]);
    expect(toast.message).toHaveBeenCalledWith("No files on the clipboard");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(opts.refresh).not.toHaveBeenCalled();
  });

  it("reports partial failures with the first reason and keeps the rest", async () => {
    invoke
      .mockResolvedValueOnce(["/x/gone.txt", "/x/b", "/x/ok"])
      .mockResolvedValueOnce({
        created: ["/ws/ok"],
        failed: [
          { source: "/x/gone.txt", message: "No such file or directory" },
          { source: "/x/b", message: "Permission denied" },
        ],
      });
    const opts = options();
    expect(await pasteClipboardFiles("/ws", opts)).toEqual(["/ws/ok"]);
    expect(toast.error).toHaveBeenCalledWith("Could not copy 2 items", {
      description: "/x/gone.txt: No such file or directory",
    });
    expect(opts.refresh).toHaveBeenCalledWith("/ws");
  });

  it("uses the singular for one failed item and selects nothing when all fail", async () => {
    invoke.mockResolvedValueOnce(["/x/gone.txt"]).mockResolvedValueOnce({
      created: [],
      failed: [{ source: "/x/gone.txt", message: "No such file or directory" }],
    });
    expect(await pasteClipboardFiles("/ws", options())).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith("Could not copy 1 item", {
      description: "/x/gone.txt: No such file or directory",
    });
  });

  it("re-reads the folder after a whole-call copy failure", async () => {
    invoke
      .mockResolvedValueOnce(["/x/a"])
      .mockRejectedValueOnce("copy at most 1024 items at a time");
    const opts = options();
    expect(await pasteClipboardFiles("/ws", opts)).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(
      "Paste failed: copy at most 1024 items at a time",
    );
    expect(opts.refresh).toHaveBeenCalledWith("/ws");
  });

  it("reports a clipboard failure without copying or re-reading", async () => {
    invoke.mockRejectedValueOnce("clipboard read timed out or was cancelled");
    const opts = options();
    expect(await pasteClipboardFiles("/ws", opts)).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(
      "Paste failed: clipboard read timed out or was cancelled",
    );
    expect(toast.message).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(opts.refresh).not.toHaveBeenCalled();
  });

  it("cancels before copying when the root changed during the clipboard read", async () => {
    const clipboard = deferred<string[]>();
    invoke.mockReturnValueOnce(clipboard.promise);
    const opts = options();
    const paste = pasteClipboardFiles("/ws-a", opts);
    opts.isCurrent.mockReturnValue(false);
    clipboard.resolve(["/x/a"]);
    expect(await paste).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("returns nothing after a root change during the copy, but still reports failures", async () => {
    const copy = deferred<unknown>();
    invoke
      .mockResolvedValueOnce(["/x/a", "/x/b"])
      .mockReturnValueOnce(copy.promise);
    const opts = options();
    const paste = pasteClipboardFiles("/ws-a", opts);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    opts.isCurrent.mockReturnValue(false);
    copy.resolve({
      created: ["/ws-a/a"],
      failed: [{ source: "/x/b", message: "boom" }],
    });
    expect(await paste).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith("Could not copy 1 item", {
      description: "/x/b: boom",
    });
    expect(opts.refresh).not.toHaveBeenCalled();
  });
});
