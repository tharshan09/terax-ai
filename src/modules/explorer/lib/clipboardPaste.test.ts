import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CopyResult,
  type ExplorerScope,
  pasteClipboardFiles,
  pasteExclusively,
  pasteKeyAction,
  reportCopyFailures,
} from "@/modules/explorer/lib/clipboardPaste";
import { joinPath } from "@/modules/explorer/lib/paths";
import type { WorkspaceEnv } from "@/modules/workspace";

const { invoke, toast } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { message: vi.fn(), error: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => vi.resetAllMocks());

describe("pasteExclusively", () => {
  it("says a paste is running instead of starting a second one", async () => {
    const busy = { current: false };
    const first = deferred<void>();
    const paste = vi.fn(() => first.promise);
    const running = pasteExclusively(busy, paste);
    expect(busy.current).toBe(true);
    await pasteExclusively(busy, paste);
    expect(paste).toHaveBeenCalledTimes(1);
    expect(toast.message).toHaveBeenCalledWith("A paste is already running");
    first.resolve();
    await running;
    expect(busy.current).toBe(false);
  });

  it("frees the lock after a failed paste", async () => {
    const busy = { current: false };
    await expect(
      pasteExclusively(busy, () => Promise.reject(new Error("boom"))),
    ).rejects.toThrow("boom");
    expect(busy.current).toBe(false);
    const paste = vi.fn(async () => {});
    await pasteExclusively(busy, paste);
    expect(paste).toHaveBeenCalledTimes(1);
    expect(toast.message).not.toHaveBeenCalled();
  });

  it("lets the next paste start once released, and never frees that paste's lock", async () => {
    const busy = { current: false };
    const tail = deferred<void>();
    const first = pasteExclusively(busy, async (release) => {
      release();
      await tail.promise;
    });
    expect(busy.current).toBe(false);
    const second = deferred<void>();
    const running = pasteExclusively(busy, () => second.promise);
    expect(busy.current).toBe(true);
    tail.resolve();
    await first;
    expect(busy.current).toBe(true);
    second.resolve();
    await running;
    expect(busy.current).toBe(false);
    expect(toast.message).not.toHaveBeenCalled();
  });
});

describe("pasteKeyAction", () => {
  const key = (k: Partial<KeyboardEvent>) => ({
    key: "v",
    code: "KeyV",
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...k,
  });
  const pastes = (e: ReturnType<typeof key>, isMac: boolean) =>
    pasteKeyAction({ ...e, repeat: false }, isMac) === "paste";

  it("matches the physical V key on non-Latin layouts", () => {
    expect(pastes(key({ key: "м", metaKey: true }), true)).toBe(true);
    expect(pastes(key({ key: "м", code: "KeyM", metaKey: true }), true)).toBe(
      false,
    );
  });

  it("goes by the letter on Latin layouts, so Dvorak Cmd+K is no paste", () => {
    expect(pastes(key({ key: "k", metaKey: true }), true)).toBe(false);
    expect(pastes(key({ key: "v", code: "Period", metaKey: true }), true)).toBe(
      true,
    );
    expect(pastes(key({ metaKey: true }), true)).toBe(true);
  });

  it("offers no shortcut off macOS, where files cannot be read", () => {
    expect(pastes(key({ ctrlKey: true }), false)).toBe(false);
    expect(pastes(key({ metaKey: true }), false)).toBe(false);
  });

  it("accepts only Cmd+V on macOS", () => {
    expect(pastes(key({ metaKey: true }), true)).toBe(true);
    expect(pastes(key({ key: "V", metaKey: true }), true)).toBe(true);
    expect(pastes(key({ metaKey: true, shiftKey: true }), true)).toBe(false);
    expect(pastes(key({ metaKey: true, altKey: true }), true)).toBe(false);
    expect(pastes(key({ ctrlKey: true }), true)).toBe(false);
    expect(pastes(key({ metaKey: true, ctrlKey: true }), true)).toBe(false);
    expect(pastes(key({ key: "c", code: "KeyC", metaKey: true }), true)).toBe(
      false,
    );
  });

  it("pastes on the first Cmd+V and swallows the repeats of a held key", () => {
    const cmdV = key({ metaKey: true });
    expect(pasteKeyAction({ ...cmdV, repeat: false }, true)).toBe("paste");
    expect(pasteKeyAction({ ...cmdV, repeat: true }, true)).toBe("swallow");
    expect(pasteKeyAction({ ...cmdV, repeat: true }, false)).toBeNull();
    expect(
      pasteKeyAction({ ...key({ ctrlKey: true }), repeat: false }, true),
    ).toBeNull();
  });
});

describe("reportCopyFailures", () => {
  it("names the lost connection instead of the first failed item", () => {
    const lost =
      "SSH request to 'h' timed out after 30s (budget) and was killed: publish";
    reportCopyFailures({
      created: ["/ws/a.txt"],
      failed: [
        { source: "/x/b", message: "Permission denied" },
        { source: "/x/c", message: lost },
        { source: "/x/d", message: lost },
      ],
      aborted: lost,
    });
    expect(toast.error).toHaveBeenCalledWith("Could not copy 3 items", {
      description: lost,
    });

    reportCopyFailures({
      created: [],
      failed: [{ source: "/x/b", message: "Permission denied" }],
      aborted: null,
    });
    expect(toast.error).toHaveBeenLastCalledWith("Could not copy 1 item", {
      description: "/x/b: Permission denied",
    });
  });

  it("says which item may already be in place when the connection dropped during its publish", () => {
    const lost = "ssh: Connection timed out.";
    reportCopyFailures({
      created: [],
      failed: [
        {
          source: "/x/a.txt",
          message: "connection lost while publishing",
          maybePlaced: true,
        },
        { source: "/x/b.txt", message: lost, maybePlaced: false },
      ],
      aborted: lost,
    });
    expect(toast.error).toHaveBeenCalledWith("Could not copy 2 items", {
      description: "ssh: Connection timed out. a.txt may already be in place.",
    });
  });

  it("says so for a stopped helper too, where the batch went on", () => {
    const stopped = "remote helper stopped while publishing";
    reportCopyFailures({
      created: ["/ws/c.txt"],
      failed: [
        { source: "/x/a.txt", message: stopped, maybePlaced: true },
        { source: "/x/b.txt", message: "Permission denied" },
      ],
      aborted: null,
    });
    expect(toast.error).toHaveBeenLastCalledWith("Could not copy 2 items", {
      description: `/x/a.txt: ${stopped}. a.txt may already be in place.`,
    });

    reportCopyFailures({
      created: [],
      failed: ["a.txt", "b.txt", "c.txt"].map((name) => ({
        source: `/x/${name}`,
        message: stopped,
        maybePlaced: true,
      })),
    });
    expect(toast.error).toHaveBeenLastCalledWith("Could not copy 3 items", {
      description: `/x/a.txt: ${stopped}. a.txt and 2 more may already be in place.`,
    });
  });

  it("counts clipboard items that no longer resolve as failed copies", () => {
    reportCopyFailures({ created: ["/ws/a"], failed: [] }, 1);
    expect(toast.error).toHaveBeenLastCalledWith("Could not copy 1 item", {
      description: "1 copied item no longer exists",
    });

    reportCopyFailures(
      {
        created: [],
        failed: [{ source: "/x/b", message: "Permission denied" }],
      },
      2,
    );
    expect(toast.error).toHaveBeenLastCalledWith("Could not copy 3 items", {
      description: "/x/b: Permission denied",
    });

    reportCopyFailures({ created: [], failed: [] }, 0);
    expect(toast.error).toHaveBeenCalledTimes(2);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function clip(paths: string[], unresolved = 0) {
  return { paths, unresolved };
}

function options(
  workspace: WorkspaceEnv = { kind: "ssh", host: "litha-claude" },
) {
  return {
    scope: { rootPath: "/ws", workspace },
    isCurrent: vi.fn((_scope: ExplorerScope) => true),
    isExpanded: vi.fn((_dir: string) => false),
    refresh: vi.fn((_path: string) => Promise.resolve()),
    expand: vi.fn((_path: string) => Promise.resolve()),
    hasRow: vi.fn((_path: string) => true),
    select: vi.fn((_path: string) => {}),
    onCopySettled: vi.fn(() => {}),
  };
}

describe("pasteClipboardFiles", () => {
  it("copies with Finder naming in the captured workspace", async () => {
    invoke
      .mockResolvedValueOnce(clip(["/tmp/a.txt", "/tmp/b.txt"]))
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
    expect(opts.expand).toHaveBeenCalledTimes(1);
    expect(opts.expand).toHaveBeenCalledWith("/ws/docs");
    expect(opts.refresh).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("re-reads an open folder and leaves a collapsed one alone when nothing landed", async () => {
    const copied = { created: ["/ws/docs/a.txt"], failed: [] };
    invoke
      .mockResolvedValueOnce(clip(["/tmp/a.txt"]))
      .mockResolvedValueOnce(copied);
    const open = options();
    open.isExpanded.mockReturnValue(true);
    await pasteClipboardFiles("/ws/docs", open);
    expect(open.refresh).toHaveBeenCalledWith("/ws/docs");
    expect(open.expand).not.toHaveBeenCalled();

    invoke.mockResolvedValueOnce(clip(["/tmp/a.txt"])).mockResolvedValueOnce({
      created: [],
      failed: [{ source: "/tmp/a.txt", message: "Permission denied" }],
    });
    const collapsed = options();
    await pasteClipboardFiles("/ws/docs", collapsed);
    expect(collapsed.refresh).not.toHaveBeenCalled();
    expect(collapsed.expand).not.toHaveBeenCalled();
  });

  it("re-reads the folder locally and over SSH, then selects the first new row", async () => {
    for (const workspace of [
      { kind: "local" },
      { kind: "ssh", host: "litha-claude" },
    ] as WorkspaceEnv[]) {
      invoke.mockResolvedValueOnce(clip(["/tmp/a.txt"])).mockResolvedValueOnce({
        created: ["/ws/docs/a.txt", "/ws/docs/b.txt"],
        failed: [],
      });
      const opts = options(workspace);
      opts.isExpanded.mockReturnValue(true);
      await pasteClipboardFiles("/ws/docs", opts);
      expect(opts.refresh).toHaveBeenCalledWith("/ws/docs");
      expect(opts.select).toHaveBeenCalledTimes(1);
      expect(opts.select).toHaveBeenCalledWith("/ws/docs/a.txt");
    }
  });

  it("selects only after the re-read has landed", async () => {
    const reread = deferred<void>();
    invoke
      .mockResolvedValueOnce(clip(["/tmp/a.txt"]))
      .mockResolvedValueOnce({ created: ["/ws/a.txt"], failed: [] });
    const opts = options();
    opts.refresh.mockReturnValueOnce(reread.promise);
    const paste = pasteClipboardFiles("/ws", opts);
    await vi.waitFor(() => expect(opts.refresh).toHaveBeenCalledWith("/ws"));
    expect(opts.select).not.toHaveBeenCalled();
    reread.resolve();
    expect(await paste).toEqual(["/ws/a.txt"]);
    expect(opts.hasRow).toHaveBeenCalledWith("/ws/a.txt");
    expect(opts.select).toHaveBeenCalledWith("/ws/a.txt");
  });

  it("selects the row by its tree key, also under the root /", async () => {
    invoke
      .mockResolvedValueOnce(clip(["/tmp/a.txt"]))
      .mockResolvedValueOnce({ created: ["/a.txt"], failed: [] });
    const local = { kind: "local" } as WorkspaceEnv;
    const opts = {
      ...options(local),
      scope: { rootPath: "/", workspace: local },
    };
    const rows = new Set([joinPath("/", "a.txt")]);
    opts.hasRow.mockImplementation((path) => rows.has(path));
    expect(await pasteClipboardFiles("/", opts)).toEqual(["/a.txt"]);
    expect(opts.refresh).toHaveBeenCalledWith("/");
    expect(opts.hasRow).toHaveBeenCalledWith("/a.txt");
    expect(opts.select).toHaveBeenCalledWith("/a.txt");
  });

  it("selects nothing when the new row is not in the tree", async () => {
    invoke
      .mockResolvedValueOnce(clip(["/tmp/.env"]))
      .mockResolvedValueOnce({ created: ["/ws/.env"], failed: [] });
    const opts = options();
    opts.hasRow.mockReturnValue(false);
    expect(await pasteClipboardFiles("/ws", opts)).toEqual(["/ws/.env"]);
    expect(opts.select).not.toHaveBeenCalled();
  });

  it("selects nothing after a root change during the re-read", async () => {
    const reread = deferred<void>();
    invoke
      .mockResolvedValueOnce(clip(["/tmp/a.txt"]))
      .mockResolvedValueOnce({ created: ["/ws/a.txt"], failed: [] });
    const opts = options();
    opts.refresh.mockReturnValueOnce(reread.promise);
    const paste = pasteClipboardFiles("/ws", opts);
    await vi.waitFor(() => expect(opts.refresh).toHaveBeenCalled());
    opts.isCurrent.mockReturnValue(false);
    reread.resolve();
    expect(await paste).toEqual([]);
    expect(opts.select).not.toHaveBeenCalled();
  });

  it("stops with a hint when the clipboard holds no files", async () => {
    invoke.mockResolvedValueOnce(clip([]));
    const opts = options();
    expect(await pasteClipboardFiles("/ws", opts)).toEqual([]);
    expect(toast.message).toHaveBeenCalledWith("No files on the clipboard");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(opts.refresh).not.toHaveBeenCalled();
  });

  it("fails clearly when no file on the clipboard resolves", async () => {
    invoke.mockResolvedValueOnce(clip([], 2));
    const opts = options();
    expect(await pasteClipboardFiles("/ws", opts)).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith("Could not copy 2 items", {
      description: "2 copied items no longer exist",
    });
    expect(toast.message).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(opts.refresh).not.toHaveBeenCalled();
  });

  it("copies what resolves and counts the rest as failed", async () => {
    invoke
      .mockResolvedValueOnce(clip(["/x/a"], 1))
      .mockResolvedValueOnce({ created: ["/ws/a"], failed: [] });
    const opts = options();
    expect(await pasteClipboardFiles("/ws", opts)).toEqual(["/ws/a"]);
    expect(invoke).toHaveBeenLastCalledWith(
      "fs_copy",
      expect.objectContaining({ sources: ["/x/a"] }),
    );
    expect(toast.error).toHaveBeenCalledWith("Could not copy 1 item", {
      description: "1 copied item no longer exists",
    });
    expect(opts.select).toHaveBeenCalledWith("/ws/a");
  });

  it("reports partial failures with the first reason and keeps the rest", async () => {
    invoke
      .mockResolvedValueOnce(clip(["/x/gone.txt", "/x/b", "/x/ok"]))
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
    invoke.mockResolvedValueOnce(clip(["/x/gone.txt"])).mockResolvedValueOnce({
      created: [],
      failed: [{ source: "/x/gone.txt", message: "No such file or directory" }],
    });
    const opts = options();
    expect(await pasteClipboardFiles("/ws", opts)).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith("Could not copy 1 item", {
      description: "/x/gone.txt: No such file or directory",
    });
    expect(opts.select).not.toHaveBeenCalled();
  });

  it("re-reads the folder after a whole-call copy failure", async () => {
    invoke
      .mockResolvedValueOnce(clip(["/x/a"]))
      .mockRejectedValueOnce("copy at most 1024 items at a time");
    const opts = options();
    expect(await pasteClipboardFiles("/ws", opts)).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith(
      "Paste failed: copy at most 1024 items at a time",
    );
    expect(opts.refresh).toHaveBeenCalledWith("/ws");
  });

  it("names the clipboard items that no longer exist when the copy is refused", async () => {
    invoke
      .mockResolvedValueOnce(clip(["/x/a"], 1))
      .mockRejectedValueOnce("copy at most 1024 items at a time");
    expect(await pasteClipboardFiles("/ws", options())).toEqual([]);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith("Paste failed", {
      description:
        "copy at most 1024 items at a time · 1 copied item no longer exists",
    });

    invoke
      .mockResolvedValueOnce(clip(["/x/a"], 2))
      .mockRejectedValueOnce("destination is gone");
    await pasteClipboardFiles("/ws", options());
    expect(toast.error).toHaveBeenLastCalledWith("Paste failed", {
      description: "destination is gone · 2 copied items no longer exist",
    });
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

  it("says the paste is cancelled, reading nothing, when its scope is already stale", async () => {
    const opts = options();
    opts.isCurrent.mockReturnValue(false);
    expect(await pasteClipboardFiles("/ws/docs", opts)).toEqual([]);
    expect(opts.isCurrent).toHaveBeenCalledWith(opts.scope);
    expect(invoke).not.toHaveBeenCalled();
    expect(opts.refresh).not.toHaveBeenCalled();
    expect(opts.expand).not.toHaveBeenCalled();
    expect(opts.select).not.toHaveBeenCalled();
    expect(opts.onCopySettled).not.toHaveBeenCalled();
    expect(toast.message).toHaveBeenCalledTimes(1);
    expect(toast.message).toHaveBeenCalledWith(
      "Paste cancelled: the explorer changed",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("says the paste is cancelled when the root changed during the clipboard read", async () => {
    for (const files of [clip(["/x/a"]), clip([])]) {
      vi.resetAllMocks();
      const clipboard = deferred<ReturnType<typeof clip>>();
      invoke.mockReturnValueOnce(clipboard.promise);
      const opts = options();
      const paste = pasteClipboardFiles("/ws-a", opts);
      opts.isCurrent.mockReturnValue(false);
      clipboard.resolve(files);
      expect(await paste).toEqual([]);
      expect(invoke).toHaveBeenCalledTimes(1);
      expect(toast.message).toHaveBeenCalledTimes(1);
      expect(toast.message).toHaveBeenCalledWith(
        "Paste cancelled: the explorer changed",
      );
      expect(toast.error).not.toHaveBeenCalled();
      expect(opts.onCopySettled).not.toHaveBeenCalled();
    }
  });

  it("returns nothing after a root change during the copy, but still reports failures", async () => {
    const copy = deferred<unknown>();
    invoke
      .mockResolvedValueOnce(clip(["/x/a", "/x/b"]))
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
    expect(opts.expand).not.toHaveBeenCalled();
  });

  it("settles the copy once fs_copy returns, before the re-read and on failure", async () => {
    const copy = deferred<CopyResult>();
    invoke
      .mockResolvedValueOnce(clip(["/x/a"]))
      .mockReturnValueOnce(copy.promise);
    const opts = options();
    opts.isExpanded.mockReturnValue(true);
    let settledBeforeReread: boolean | undefined;
    opts.refresh.mockImplementation(async () => {
      settledBeforeReread = opts.onCopySettled.mock.calls.length === 1;
    });
    const paste = pasteClipboardFiles("/ws/docs", opts);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(opts.onCopySettled).not.toHaveBeenCalled();
    copy.resolve({ created: ["/ws/docs/a"], failed: [] });
    await paste;
    expect(settledBeforeReread).toBe(true);
    expect(opts.onCopySettled).toHaveBeenCalledTimes(1);

    invoke
      .mockResolvedValueOnce(clip(["/x/a"]))
      .mockRejectedValueOnce("copy at most 1024 items at a time");
    const failing = options();
    failing.isExpanded.mockReturnValue(true);
    await pasteClipboardFiles("/ws/docs", failing);
    expect(failing.onCopySettled).toHaveBeenCalledTimes(1);
    expect(failing.refresh).toHaveBeenCalledWith("/ws/docs");

    invoke.mockResolvedValueOnce(clip([]));
    const empty = options();
    await pasteClipboardFiles("/ws", empty);
    expect(empty.onCopySettled).not.toHaveBeenCalled();
  });

  it("lets a second paste start while the first one still re-reads", async () => {
    const busy = { current: false };
    const reread = deferred<void>();
    invoke
      .mockResolvedValueOnce(clip(["/x/a"]))
      .mockResolvedValueOnce({ created: ["/ws/a"], failed: [] });
    const opts = options();
    opts.refresh.mockReturnValueOnce(reread.promise);
    const first = pasteExclusively(busy, (release) =>
      pasteClipboardFiles("/ws", { ...opts, onCopySettled: release }).then(
        () => {},
      ),
    );
    await vi.waitFor(() => expect(opts.refresh).toHaveBeenCalled());
    expect(busy.current).toBe(false);

    const second = vi.fn(async () => {});
    await pasteExclusively(busy, second);
    expect(second).toHaveBeenCalledTimes(1);
    expect(toast.message).not.toHaveBeenCalled();
    reread.resolve();
    await first;
    expect(opts.select).toHaveBeenCalledWith("/ws/a");
  });
});
