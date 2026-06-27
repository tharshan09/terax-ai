import { describe, expect, it } from "vitest";
import {
  autoSessionName,
  isCurrentTmuxTarget,
  isValidSessionName,
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
