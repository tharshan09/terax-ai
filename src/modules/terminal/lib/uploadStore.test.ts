import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceEnv } from "@/modules/workspace";
import { pendingUploadCount } from "@/modules/terminal/lib/terminalUpload";
import {
  configureTerminalUploads,
  interceptTerminalPaste,
  type SshEnv,
  uploadClipboardImage,
  uploadDroppedFiles,
  useTerminalUploadStore,
} from "@/modules/terminal/lib/uploadStore";

const { invoke, toast } = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { error: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/platform", () => ({ IS_WINDOWS: true }));

const DIR = "/home/u/.terax/uploads";
const DEVBOX: SshEnv = { kind: "ssh", host: "devbox" };

const panes = new Map<number, WorkspaceEnv>();
const paste = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function pending(leafId: number): number {
  return pendingUploadCount(useTerminalUploadStore.getState().queues, leafId);
}

type Stat = { size: number; kind: "file" | "dir" };

function serve(
  stats: Record<string, Stat>,
  copy: (sources: string[]) => unknown,
) {
  invoke.mockImplementation(
    async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === "fs_stat") {
        const stat = stats[args.path as string];
        if (!stat) throw new Error("No such file or directory");
        return { ...stat, mtime: 0 };
      }
      if (cmd === "ssh_prepare_upload_dir") return DIR;
      if (cmd === "fs_copy") return copy(args.sources as string[]);
      throw new Error(`unexpected ${cmd}`);
    },
  );
}

function calls(cmd: string) {
  return invoke.mock.calls.filter(([c]) => c === cmd);
}

beforeEach(() => {
  vi.resetAllMocks();
  panes.clear();
  configureTerminalUploads({
    leafWorkspace: (id) => panes.get(id) ?? null,
    paste,
  });
});

describe("uploadDroppedFiles", () => {
  it("uploads through fs_copy into the absolute upload folder and pastes the server paths once", async () => {
    panes.set(7, DEVBOX);
    const copied = deferred<unknown>();
    serve(
      {
        "/Users/me/shot.png": { size: 10, kind: "file" },
        "/Users/me/b.pdf": { size: 10, kind: "file" },
      },
      () => copied.promise,
    );
    await uploadDroppedFiles(7, DEVBOX, [
      "/Users/me/shot.png",
      "/Users/me/b.pdf",
    ]);
    expect(pending(7)).toBe(2);
    await vi.waitFor(() => expect(calls("fs_copy")).toHaveLength(1));
    expect(calls("ssh_prepare_upload_dir")[0][1]).toEqual({ host: "devbox" });
    expect(calls("fs_copy")[0][1]).toEqual({
      sources: ["/Users/me/shot.png", "/Users/me/b.pdf"],
      destDir: DIR,
      workspace: DEVBOX,
      renameOnConflict: true,
      refuseSecrets: true,
    });
    copied.resolve({
      created: [`${DIR}/shot copy.png`, `${DIR}/b.pdf`],
      failed: [],
      aborted: null,
    });
    await vi.waitFor(() => expect(pending(7)).toBe(0));
    expect(paste).toHaveBeenCalledTimes(1);
    expect(paste).toHaveBeenCalledWith(
      7,
      `'${DIR}/shot copy.png' ${DIR}/b.pdf `,
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("skips folders and files over 100 MB with a notice and still uploads the rest", async () => {
    panes.set(8, DEVBOX);
    serve(
      {
        "/Users/me/a.png": { size: 104_857_600, kind: "file" },
        "/Users/me/fotos": { size: 0, kind: "dir" },
        "/Users/me/big.mov": { size: 104_857_601, kind: "file" },
      },
      (sources) => ({
        created: sources.map((s) => `${DIR}/${s.split("/").pop()}`),
        failed: [],
      }),
    );
    await uploadDroppedFiles(8, DEVBOX, [
      "/Users/me/a.png",
      "/Users/me/fotos",
      "/Users/me/big.mov",
    ]);
    expect(toast.error).toHaveBeenCalledWith(
      "big.mov is larger than 100 MB and was not uploaded.",
    );
    expect(toast.error).toHaveBeenCalledWith(
      "Folders can't be uploaded to a terminal. Use the explorer.",
    );
    await vi.waitFor(() =>
      expect(paste).toHaveBeenCalledWith(8, `${DIR}/a.png `),
    );
    expect(calls("fs_copy")[0][1]).toMatchObject({
      sources: ["/Users/me/a.png"],
    });
  });

  it("starts no transfer when nothing is left to upload", async () => {
    panes.set(9, DEVBOX);
    serve({ "/Users/me/fotos": { size: 0, kind: "dir" } }, () => ({
      created: [],
      failed: [],
    }));
    await uploadDroppedFiles(9, DEVBOX, ["/Users/me/fotos"]);
    expect(pending(9)).toBe(0);
    expect(calls("ssh_prepare_upload_dir")).toHaveLength(0);
    expect(calls("fs_copy")).toHaveLength(0);
  });

  it("pastes what landed and names the rest in one toast", async () => {
    panes.set(10, DEVBOX);
    serve(
      {
        "/Users/me/a.png": { size: 1, kind: "file" },
        "/Users/me/b.png": { size: 1, kind: "file" },
      },
      () => ({
        created: [`${DIR}/a.png`],
        failed: [{ source: "/Users/me/b.png", message: "Permission denied" }],
      }),
    );
    await uploadDroppedFiles(10, DEVBOX, [
      "/Users/me/a.png",
      "/Users/me/b.png",
    ]);
    await vi.waitFor(() => expect(pending(10)).toBe(0));
    expect(paste).toHaveBeenCalledWith(10, `${DIR}/a.png `);
    expect(toast.error).toHaveBeenCalledWith(
      "Upload failed: b.png: Permission denied",
      { description: "Not uploaded: b.png" },
    );
  });

  it("always asks fs_copy to refuse secret paths, for drops and clipboard images", async () => {
    panes.set(14, DEVBOX);
    invoke.mockImplementation(
      async (cmd: string, args: Record<string, unknown>) => {
        if (cmd === "fs_clipboard_image") return `/tmp/terax/${args.name}`;
        if (cmd === "fs_stat") return { size: 1, kind: "file", mtime: 0 };
        if (cmd === "ssh_prepare_upload_dir") return DIR;
        if (cmd === "fs_copy") return { created: [], failed: [] };
        throw new Error(`unexpected ${cmd}`);
      },
    );
    await uploadDroppedFiles(14, DEVBOX, ["/Users/me/a.png"]);
    await uploadClipboardImage(14, DEVBOX);
    await uploadDroppedFiles(14, DEVBOX, ["/Users/me/.env", "/Users/me/b"]);
    await vi.waitFor(() => expect(calls("fs_copy")).toHaveLength(3));
    for (const [, args] of calls("fs_copy"))
      expect(args).toMatchObject({ refuseSecrets: true });
  });

  it("names a refused secret file in the toast and pastes only the rest", async () => {
    panes.set(15, DEVBOX);
    const reason =
      'secret paths are never uploaded; ".env" matches a sensitive-file pattern';
    serve(
      {
        "/Users/me/.env": { size: 1, kind: "file" },
        "/Users/me/a.png": { size: 1, kind: "file" },
      },
      () => ({
        created: [`${DIR}/a.png`],
        failed: [{ source: "/Users/me/.env", message: reason }],
      }),
    );
    await uploadDroppedFiles(15, DEVBOX, ["/Users/me/.env", "/Users/me/a.png"]);
    await vi.waitFor(() => expect(pending(15)).toBe(0));
    expect(paste.mock.calls).toEqual([[15, `${DIR}/a.png `]]);
    expect(toast.error).toHaveBeenCalledWith(`Upload failed: .env: ${reason}`, {
      description: "Not uploaded: .env",
    });
  });

  it("reports a failing upload folder and pastes nothing", async () => {
    panes.set(11, DEVBOX);
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "fs_stat") return { size: 1, kind: "file", mtime: 0 };
      if (cmd === "ssh_prepare_upload_dir") throw "mkdir: Permission denied";
      throw new Error(`unexpected ${cmd}`);
    });
    await uploadDroppedFiles(11, DEVBOX, ["/Users/me/a.png"]);
    await vi.waitFor(() => expect(pending(11)).toBe(0));
    expect(paste).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Upload failed: mkdir: Permission denied",
      { description: undefined },
    );
  });

  it("gives a pane closed during the upload neither a paste nor a toast", async () => {
    panes.set(12, DEVBOX);
    const copied = deferred<unknown>();
    serve(
      { "/Users/me/a.png": { size: 1, kind: "file" } },
      () => copied.promise,
    );
    await uploadDroppedFiles(12, DEVBOX, ["/Users/me/a.png"]);
    await vi.waitFor(() => expect(calls("fs_copy")).toHaveLength(1));
    panes.delete(12);
    copied.resolve({
      created: [`${DIR}/a.png`],
      failed: [{ source: "/Users/me/b.png", message: "boom" }],
    });
    await vi.waitFor(() => expect(pending(12)).toBe(0));
    expect(paste).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("runs uploads of one pane one after another and pastes in trigger order", async () => {
    panes.set(13, DEVBOX);
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const copies = [first, second];
    serve(
      {
        "/Users/me/one.png": { size: 1, kind: "file" },
        "/Users/me/two.png": { size: 1, kind: "file" },
        "/Users/me/three.png": { size: 1, kind: "file" },
      },
      () => copies.shift()?.promise,
    );
    await uploadDroppedFiles(13, DEVBOX, ["/Users/me/one.png"]);
    await uploadDroppedFiles(13, DEVBOX, [
      "/Users/me/two.png",
      "/Users/me/three.png",
    ]);
    expect(pending(13)).toBe(3);
    await vi.waitFor(() => expect(calls("fs_copy")).toHaveLength(1));
    second.resolve({
      created: [`${DIR}/two.png`, `${DIR}/three.png`],
      failed: [],
    });
    first.resolve({ created: [`${DIR}/one.png`], failed: [] });
    await vi.waitFor(() => expect(pending(13)).toBe(0));
    expect(paste.mock.calls).toEqual([
      [13, `${DIR}/one.png `],
      [13, `${DIR}/two.png ${DIR}/three.png `],
    ]);
  });
});

describe("interceptTerminalPaste", () => {
  const clipboard = (text: string) =>
    ({ getData: () => text }) as unknown as DataTransfer;

  it("leaves local and WSL panes to the normal paste", () => {
    panes.set(20, { kind: "local" });
    panes.set(21, { kind: "wsl", distro: "Ubuntu" });
    expect(interceptTerminalPaste(20, clipboard(""))).toBe(false);
    expect(interceptTerminalPaste(21, clipboard(""))).toBe(false);
    expect(interceptTerminalPaste(99, clipboard(""))).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("lets any text win in an SSH pane", () => {
    panes.set(22, DEVBOX);
    expect(interceptTerminalPaste(22, clipboard("shot.png"))).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("claims a paste without text in an SSH pane and reads the clipboard image", async () => {
    panes.set(23, DEVBOX);
    invoke.mockResolvedValue(null);
    expect(interceptTerminalPaste(23, clipboard(""))).toBe(true);
    expect(invoke).toHaveBeenCalledWith("fs_clipboard_image", {
      name: expect.stringMatching(/^clipboard-\d{8}-\d{6}\.png$/),
    });
  });
});

describe("uploadClipboardImage", () => {
  it("uploads the staged PNG and pastes its server path", async () => {
    panes.set(30, DEVBOX);
    const copied = deferred<unknown>();
    invoke.mockImplementation(
      async (cmd: string, args: Record<string, unknown>) => {
        if (cmd === "fs_clipboard_image") return `/tmp/terax/${args.name}`;
        if (cmd === "ssh_prepare_upload_dir") return DIR;
        if (cmd === "fs_copy") return copied.promise;
        throw new Error(`unexpected ${cmd}`);
      },
    );
    await uploadClipboardImage(30, DEVBOX, new Date(2026, 10, 20, 9, 5, 7));
    expect(pending(30)).toBe(1);
    await vi.waitFor(() => expect(calls("fs_copy")).toHaveLength(1));
    copied.resolve({
      created: [`${DIR}/clipboard-20261120-090507.png`],
      failed: [],
    });
    await vi.waitFor(() => expect(pending(30)).toBe(0));
    expect(calls("fs_copy")[0][1]).toEqual({
      sources: ["/tmp/terax/clipboard-20261120-090507.png"],
      destDir: DIR,
      workspace: DEVBOX,
      renameOnConflict: true,
      refuseSecrets: true,
    });
    expect(paste).toHaveBeenCalledWith(
      30,
      `${DIR}/clipboard-20261120-090507.png `,
    );
  });

  it("shows nothing while the clipboard is read and nothing when it holds no image", async () => {
    panes.set(31, DEVBOX);
    const read = deferred<string | null>();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "fs_clipboard_image") return read.promise;
      throw new Error(`unexpected ${cmd}`);
    });
    const done = uploadClipboardImage(31, DEVBOX);
    await vi.waitFor(() => expect(calls("fs_clipboard_image")).toHaveLength(1));
    expect(pending(31)).toBe(0);
    read.resolve(null);
    await done;
    expect(pending(31)).toBe(0);
    expect(calls("fs_copy")).toHaveLength(0);
    expect(paste).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports a failed clipboard read without ever showing the hint", async () => {
    panes.set(32, DEVBOX);
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "fs_clipboard_image")
        throw "clipboard read timed out or was cancelled";
      throw new Error(`unexpected ${cmd}`);
    });
    await uploadClipboardImage(32, DEVBOX);
    expect(pending(32)).toBe(0);
    expect(paste).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Upload failed: clipboard read timed out or was cancelled",
      { description: undefined },
    );
  });

  it("keeps trigger order when a drop answers before an earlier image read", async () => {
    panes.set(33, DEVBOX);
    const read = deferred<string | null>();
    invoke.mockImplementation(
      async (cmd: string, args: Record<string, unknown>) => {
        if (cmd === "fs_clipboard_image") return read.promise;
        if (cmd === "fs_stat") return { size: 1, kind: "file", mtime: 0 };
        if (cmd === "ssh_prepare_upload_dir") return DIR;
        if (cmd === "fs_copy")
          return {
            created: (args.sources as string[]).map(
              (s) => `${DIR}/${s.split("/").pop()}`,
            ),
            failed: [],
          };
        throw new Error(`unexpected ${cmd}`);
      },
    );
    const image = uploadClipboardImage(
      33,
      DEVBOX,
      new Date(2026, 10, 20, 9, 5, 7),
    );
    const drop = uploadDroppedFiles(33, DEVBOX, ["/Users/me/b.pdf"]);
    await vi.waitFor(() => expect(calls("fs_stat")).toHaveLength(1));
    expect(pending(33)).toBe(0);
    read.resolve("/tmp/terax/clipboard-20261120-090507.png");
    await Promise.all([image, drop]);
    await vi.waitFor(() => expect(pending(33)).toBe(0));
    expect(paste.mock.calls).toEqual([
      [33, `${DIR}/clipboard-20261120-090507.png `],
      [33, `${DIR}/b.pdf `],
    ]);
  });

  it("pastes nothing that landed outside the confirmed upload folder", async () => {
    panes.set(34, DEVBOX);
    serve({ "/Users/me/a.png": { size: 1, kind: "file" } }, () => ({
      created: ["/home/u/a.png"],
      failed: [],
    }));
    await uploadDroppedFiles(34, DEVBOX, ["/Users/me/a.png"]);
    await vi.waitFor(() => expect(pending(34)).toBe(0));
    expect(paste).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      "Upload failed: a.png: landed outside the upload folder",
      { description: "Not uploaded: a.png" },
    );
  });
});
