import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform", () => ({ IS_WINDOWS: true }));

import {
  clipboardImageName,
  dropPaneUploads,
  EMPTY_UPLOAD_QUEUES,
  enqueueUpload,
  finishUpload,
  pasteDecision,
  pendingUploadCount,
  runningUpload,
  selectUploads,
  UPLOAD_LIMIT_BYTES,
  uploadErrorOutcome,
  uploadFailureText,
  uploadHint,
  uploadOutcome,
  uploadPasteText,
} from "./terminalUpload";

const ssh = { kind: "ssh", host: "devbox" } as const;

describe("pasteDecision", () => {
  it("uploads an image-only clipboard in an SSH pane", () => {
    expect(pasteDecision(ssh, { hasImage: true, text: "" })).toBe("upload");
  });

  it("pastes text whenever the clipboard has any", () => {
    expect(pasteDecision(ssh, { hasImage: true, text: "hello" })).toBe("text");
    expect(pasteDecision(ssh, { hasImage: false, text: "hello" })).toBe("text");
  });

  it("never uploads from local or WSL panes", () => {
    for (const env of [
      { kind: "local" },
      { kind: "wsl", distro: "Ubuntu" },
    ] as const) {
      expect(pasteDecision(env, { hasImage: true, text: "" })).toBe("text");
      expect(pasteDecision(env, { hasImage: false, text: "x" })).toBe("text");
    }
  });
});

describe("clipboardImageName", () => {
  it("stamps the local time with zero padding", () => {
    expect(clipboardImageName(new Date(2026, 10, 20, 9, 5, 7))).toBe(
      "clipboard-20261120-090507.png",
    );
  });
});

describe("selectUploads", () => {
  it("keeps files up to 100 MB in drop order and names what was left out", () => {
    expect(UPLOAD_LIMIT_BYTES).toBe(104857600);
    const selection = selectUploads([
      { path: "/Users/me/a.png", size: 104857600, isDir: false },
      { path: "/Users/me/fotos", size: 0, isDir: true },
      { path: "/Users/me/big.mov", size: 104857601, isDir: false },
      { path: "/Users/me/b.pdf", size: 10, isDir: false },
    ]);
    expect(selection.upload).toEqual(["/Users/me/a.png", "/Users/me/b.pdf"]);
    expect(selection.notices).toEqual([
      "big.mov is larger than 100 MB and was not uploaded.",
      "Folders can't be uploaded to a terminal. Use the explorer.",
    ]);
  });

  it("says the folder notice once for several folders", () => {
    const selection = selectUploads([
      { path: "/a", size: 0, isDir: true },
      { path: "/b", size: 0, isDir: true },
    ]);
    expect(selection).toEqual({
      upload: [],
      notices: ["Folders can't be uploaded to a terminal. Use the explorer."],
    });
  });
});

const DIR = "/home/u/.terax/uploads";

describe("uploadPasteText", () => {
  it("quotes server paths POSIX-style even on a Windows client, as one paste", () => {
    expect(
      uploadPasteText(
        ["/home/u/.terax/uploads/a.png", "/home/u/.terax/uploads/my shot.png"],
        DIR,
      ),
    ).toBe(
      "/home/u/.terax/uploads/a.png '/home/u/.terax/uploads/my shot.png' ",
    );
  });

  it("quotes a backslash, which a POSIX shell would eat", () => {
    expect(uploadPasteText(["/home/u/.terax/uploads/a\\b.png"], DIR)).toBe(
      "'/home/u/.terax/uploads/a\\b.png' ",
    );
  });

  it("pastes nothing when no file landed", () => {
    expect(uploadPasteText([], DIR)).toBeNull();
  });

  it("pastes only direct children of the confirmed upload folder", () => {
    expect(
      uploadPasteText(
        [
          "/etc/passwd",
          "/home/u/.terax/uploads",
          "/home/u/.terax/uploads/",
          "/home/u/.terax/uploads-evil/a.png",
          "/home/u/.terax/uploads/../x.png",
          "/home/u/.terax/uploads/sub/a.png",
          "/home/u/.terax/uploads/..",
          "/home/u/.terax/uploads/ok.png",
        ],
        DIR,
      ),
    ).toBe("/home/u/.terax/uploads/ok.png ");
    expect(
      uploadPasteText(["~/.terax/uploads/a.png"], "~/.terax/uploads"),
    ).toBeNull();
  });
});

describe("upload queues", () => {
  it("counts pending files per pane and hides the hint at zero", () => {
    let queues = enqueueUpload(EMPTY_UPLOAD_QUEUES, 7, {
      id: 1,
      files: ["/x/a.png"],
    });
    queues = enqueueUpload(queues, 7, { id: 2, files: ["/x/b.png", "/x/c"] });
    expect(uploadHint(pendingUploadCount(queues, 7))).toBe(
      "Uploading 3 files...",
    );
    expect(uploadHint(pendingUploadCount(queues, 8))).toBeNull();

    queues = finishUpload(queues, 7, 1);
    queues = finishUpload(queues, 7, 2);
    expect(uploadHint(pendingUploadCount(queues, 7))).toBeNull();
    expect(uploadHint(1)).toBe("Uploading 1 file...");
    expect(uploadHint(0)).toBeNull();
  });

  it("runs jobs of one pane in trigger order", () => {
    let queues = enqueueUpload(EMPTY_UPLOAD_QUEUES, 7, {
      id: 1,
      files: ["/x/first.png"],
    });
    queues = enqueueUpload(queues, 7, { id: 2, files: ["/x/second.png"] });
    expect(runningUpload(queues, 7)?.id).toBe(1);
    queues = finishUpload(queues, 7, 1);
    expect(runningUpload(queues, 7)?.id).toBe(2);
    queues = finishUpload(queues, 7, 2);
    expect(runningUpload(queues, 7)).toBeNull();
  });

  it("leaves other panes untouched and forgets a closed pane", () => {
    let queues = enqueueUpload(EMPTY_UPLOAD_QUEUES, 7, {
      id: 1,
      files: ["/x/a"],
    });
    queues = enqueueUpload(queues, 8, { id: 2, files: ["/x/b"] });
    queues = dropPaneUploads(queues, 7);
    expect(pendingUploadCount(queues, 7)).toBe(0);
    expect(pendingUploadCount(queues, 8)).toBe(1);
    expect(finishUpload(queues, 7, 1)).toBe(queues);
  });
});

describe("uploadOutcome", () => {
  const partial = {
    created: ["/home/u/.terax/uploads/a.png"],
    failed: [
      { source: "/Users/me/b.png", message: "Permission denied" },
      {
        source: "/Users/me/c.zip",
        message: "connection lost while publishing",
        maybePlaced: true,
      },
    ],
  };

  it("pastes only what landed and names every failed file", () => {
    expect(uploadOutcome(partial, DIR, true)).toEqual({
      paste: "/home/u/.terax/uploads/a.png ",
      toast: {
        title: "Upload failed: b.png: Permission denied",
        description: "Not uploaded: b.png, c.zip",
      },
    });
  });

  it("names a lost connection before the first failed file", () => {
    const outcome = uploadOutcome(
      { ...partial, aborted: "connection lost" },
      DIR,
      true,
    );
    expect(outcome.toast?.title).toBe("Upload failed: connection lost");
    expect(outcome.paste).toBe("/home/u/.terax/uploads/a.png ");

    expect(
      uploadOutcome(
        {
          created: [],
          failed: [{ source: "/Users/me/b.png", message: "x" }],
          aborted: "connection lost",
        },
        DIR,
        true,
      ),
    ).toEqual({
      paste: null,
      toast: {
        title: "Upload failed: connection lost",
        description: "Not uploaded: b.png",
      },
    });
  });

  it("shows no toast when everything landed", () => {
    expect(
      uploadOutcome(
        { created: ["/home/u/.terax/uploads/a.png"], failed: [] },
        DIR,
        true,
      ).toast,
    ).toBeNull();
  });

  it("gives a pane closed during the upload neither paste nor toast", () => {
    expect(uploadOutcome(partial, DIR, false)).toEqual({
      paste: null,
      toast: null,
    });
    expect(uploadErrorOutcome("Permission denied", false)).toEqual({
      paste: null,
      toast: null,
    });
  });

  it("treats a created path outside the upload folder as failed", () => {
    expect(
      uploadOutcome(
        {
          created: ["/home/u/.terax/uploads/a.png", "/home/u/elsewhere/b.png"],
          failed: [],
        },
        DIR,
        true,
      ),
    ).toEqual({
      paste: "/home/u/.terax/uploads/a.png ",
      toast: {
        title: "Upload failed: b.png: landed outside the upload folder",
        description: "Not uploaded: b.png",
      },
    });
  });

  it("names a refused secret file with its reason and pastes nothing for it", () => {
    const reason =
      'secret paths are never uploaded; ".env" matches a sensitive-file pattern';
    expect(
      uploadOutcome(
        {
          created: ["/home/u/.terax/uploads/a.png"],
          failed: [{ source: "/Users/me/app/.env", message: reason }],
        },
        DIR,
        true,
      ),
    ).toEqual({
      paste: "/home/u/.terax/uploads/a.png ",
      toast: {
        title: `Upload failed: .env: ${reason}`,
        description: "Not uploaded: .env",
      },
    });
  });

  it("says what a lost connection or a killed helper means", () => {
    const lost = uploadOutcome(
      {
        created: [],
        failed: [{ source: "/Users/me/b.png", message: "ssh command failed" }],
        aborted: "ssh command failed",
      },
      DIR,
      true,
    );
    expect(lost.toast?.title).toBe(
      "Upload failed: connection to the server was lost",
    );
    const killed = uploadOutcome(
      {
        created: [],
        failed: [
          {
            source: "/Users/me/big.mov",
            message: "remote helper exited with status 137",
          },
        ],
      },
      DIR,
      true,
    );
    expect(killed.toast?.title).toBe(
      "Upload failed: big.mov: the server ran out of memory (large files need about four times their size in free memory)",
    );
    expect(uploadErrorOutcome("ssh command failed", true).toast?.title).toBe(
      "Upload failed: connection to the server was lost",
    );
  });

  it("reports a failed upload as a whole with its reason", () => {
    expect(uploadErrorOutcome("Permission denied", true)).toEqual({
      paste: null,
      toast: { title: "Upload failed: Permission denied" },
    });
  });
});

describe("uploadFailureText", () => {
  it("translates a lost connection and an out-of-memory kill", () => {
    expect(uploadFailureText("ssh command failed")).toBe(
      "connection to the server was lost",
    );
    const oom =
      "the server ran out of memory (large files need about four times their size in free memory)";
    expect(uploadFailureText("remote helper exited with status 137")).toBe(oom);
    expect(
      uploadFailureText(
        "remote helper exited with status 137 (stderr: Killed)",
      ),
    ).toBe(oom);
  });

  it("passes every other message through unchanged", () => {
    for (const message of [
      "ssh: Connection refused",
      "ssh command failed (stderr: x)",
      "remote helper exited with status 143",
      "Permission denied",
      "",
    ])
      expect(uploadFailureText(message)).toBe(message);
  });
});
