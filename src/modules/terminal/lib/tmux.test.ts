import { describe, expect, it } from "vitest";
import { LOCAL_WORKSPACE } from "@/modules/workspace";
import {
  autoSessionName,
  isCurrentTmuxTarget,
  isValidSessionName,
  pickTmuxPollTarget,
  relativeTime,
  sanitizeSessionName,
} from "./tmux";

describe("isValidSessionName", () => {
  it("accepts allowlist-safe names", () => {
    for (const ok of ["main", "ti", "my-session", "work_1", "ABC123", "s1"]) {
      expect(isValidSessionName(ok)).toBe(true);
    }
  });

  it("rejects empty, leading-dash, and shell-metacharacter names", () => {
    for (const bad of [
      "",
      "   ",
      "-x",
      "--",
      "a b",
      "a;rm -rf",
      "$(id)",
      "a'b",
      'a"b',
      "a`id`",
      "a|b",
      "a&b",
      "a.b",
      "a/b",
      "a:b",
      "a$b",
      "a(b)",
      "a\nb",
    ]) {
      expect(isValidSessionName(bad)).toBe(false);
    }
  });
});

describe("autoSessionName", () => {
  it("returns s1 when nothing is taken", () => {
    expect(autoSessionName([])).toBe("s1");
  });

  it("skips names already taken", () => {
    expect(autoSessionName(["s1", "s2", "main"])).toBe("s3");
  });

  it("always returns an allowlist-safe name", () => {
    expect(isValidSessionName(autoSessionName(["s1", "s2", "s3"]))).toBe(true);
  });
});

describe("sanitizeSessionName", () => {
  it("coerces free-form input into an allowlist-safe name", () => {
    expect(sanitizeSessionName("test 1")).toBe("test-1");
    expect(sanitizeSessionName("  my.session  ")).toBe("my-session");
    expect(sanitizeSessionName("a/b c|d")).toBe("a-b-c-d");
    expect(sanitizeSessionName("--lead--")).toBe("lead");
    expect(sanitizeSessionName("keep-_ok")).toBe("keep-_ok");
  });

  it("returns empty when nothing usable remains", () => {
    expect(sanitizeSessionName("   ")).toBe("");
    expect(sanitizeSessionName("...")).toBe("");
  });
});

describe("isCurrentTmuxTarget", () => {
  const expected = { tabId: 1, leafId: 5, session: "main" };

  it("accepts the same tab, leaf, and session", () => {
    expect(
      isCurrentTmuxTarget({ id: 1, activeLeafId: 5, tmuxSession: "main" }, expected),
    ).toBe(true);
  });

  it("rejects a stale response after focus / leaf / session moved on", () => {
    // Switched to another tab.
    expect(
      isCurrentTmuxTarget({ id: 2, activeLeafId: 5, tmuxSession: "main" }, expected),
    ).toBe(false);
    // Split / focused a different leaf in the same tab.
    expect(
      isCurrentTmuxTarget({ id: 1, activeLeafId: 9, tmuxSession: "main" }, expected),
    ).toBe(false);
    // Reattached a different tmux session on the same leaf.
    expect(
      isCurrentTmuxTarget({ id: 1, activeLeafId: 5, tmuxSession: "other" }, expected),
    ).toBe(false);
    // No active terminal tab anymore.
    expect(isCurrentTmuxTarget(null, expected)).toBe(false);
    expect(isCurrentTmuxTarget(undefined, expected)).toBe(false);
  });

  it("rejects when the session binding is gone", () => {
    expect(
      isCurrentTmuxTarget({ id: 1, activeLeafId: 5, tmuxSession: undefined }, expected),
    ).toBe(false);
  });
});

describe("pickTmuxPollTarget", () => {
  const localTmux = {
    kind: "terminal",
    id: 1,
    workspace: { kind: "local" as const },
    tmuxSession: "terax-rs-1",
    activeLeafId: 5,
  };
  const sshTmux = {
    kind: "terminal",
    id: 2,
    workspace: { kind: "ssh" as const, host: "litha" },
    tmuxSession: "main",
    activeLeafId: 9,
  };
  const ssh = { kind: "ssh" as const, host: "litha" };

  it("tracks the active local tmux tab (restart-safe tabs are tmux)", () => {
    expect(pickTmuxPollTarget(localTmux, [localTmux], LOCAL_WORKSPACE)).toEqual({
      workspace: { kind: "local" },
      session: "terax-rs-1",
      leafId: 5,
      tabId: 1,
    });
  });

  it("tracks the active ssh tmux tab", () => {
    expect(pickTmuxPollTarget(sshTmux, [sshTmux], ssh)).toEqual({
      workspace: { kind: "ssh", host: "litha" },
      session: "main",
      leafId: 9,
      tabId: 2,
    });
  });

  it("defaults a missing workspace to local", () => {
    const noWs = {
      kind: "terminal",
      id: 4,
      tmuxSession: "terax-rs-2",
      activeLeafId: 3,
    };
    expect(
      pickTmuxPollTarget(noWs, [noWs], LOCAL_WORKSPACE)?.workspace,
    ).toEqual({ kind: "local" });
  });

  it("does not poll a plain (non-tmux) local shell", () => {
    const plain = {
      kind: "terminal",
      id: 3,
      workspace: { kind: "local" as const },
      activeLeafId: 7,
    };
    expect(pickTmuxPollTarget(plain, [plain], LOCAL_WORKSPACE)).toBeNull();
  });

  it("skips a leaf with no active pane", () => {
    const noLeaf = { ...localTmux, activeLeafId: null };
    expect(pickTmuxPollTarget(noLeaf, [noLeaf], LOCAL_WORKSPACE)).toBeNull();
  });

  it("excludes WSL tmux (no managed-session path there)", () => {
    const wsl = {
      kind: "terminal",
      id: 5,
      workspace: { kind: "wsl" as const, distro: "Ubuntu" },
      tmuxSession: "main",
      activeLeafId: 1,
    };
    expect(
      pickTmuxPollTarget(wsl, [wsl], { kind: "wsl", distro: "Ubuntu" }),
    ).toBeNull();
  });

  it("on an ssh workspace falls back to a background host terminal off a non-terminal tab", () => {
    const gitTab = { kind: "git-history", id: 8 };
    expect(pickTmuxPollTarget(gitTab, [gitTab, sshTmux], ssh)).toEqual({
      workspace: { kind: "ssh", host: "litha" },
      session: "main",
      leafId: 9,
      tabId: 2,
    });
  });

  it("does not fall back for a local workspace off a non-terminal tab", () => {
    const editor = { kind: "editor", id: 6 };
    expect(
      pickTmuxPollTarget(editor, [editor, localTmux], LOCAL_WORKSPACE),
    ).toBeNull();
  });

  it("prefers the active tab over the ssh background fallback", () => {
    const other = { ...sshTmux, id: 10, tmuxSession: "other", activeLeafId: 11 };
    expect(pickTmuxPollTarget(sshTmux, [sshTmux, other], ssh)?.tabId).toBe(2);
  });
});

describe("relativeTime", () => {
  const NOW = 1_700_000_000_000;
  const nowSec = NOW / 1000;

  it("formats buckets and handles null", () => {
    expect(relativeTime(null, NOW)).toBe("");
    expect(relativeTime(nowSec, NOW)).toBe("now");
    expect(relativeTime(nowSec - 10, NOW)).toBe("now");
    expect(relativeTime(nowSec - 310, NOW)).toBe("5m");
    expect(relativeTime(nowSec - 7200, NOW)).toBe("2h");
    expect(relativeTime(nowSec - 3 * 86400, NOW)).toBe("3d");
  });

  it("treats a future instant as now", () => {
    expect(relativeTime(nowSec + 500, NOW)).toBe("now");
  });
});
