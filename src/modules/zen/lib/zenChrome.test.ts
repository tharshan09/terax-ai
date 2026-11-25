import { describe, expect, it } from "vitest";
import {
  aiToggleAllowed,
  type TabKind,
  type ZenChrome,
  zenChrome,
} from "./zenChrome";

// Written out by hand from the tab kinds in useTabs.ts, independent of the
// table inside zenChrome.ts.
const ALL_KINDS: (TabKind | undefined)[] = [
  "terminal",
  "editor",
  "preview",
  "markdown",
  "html",
  "ai-diff",
  "git-diff",
  "git-history",
  "git-commit-file",
  undefined,
];

const SHOWN: ZenChrome = {
  header: true,
  statusBar: true,
  sidebar: true,
  resizeHandle: true,
  surfacePadding: true,
  paneFrame: true,
  inputBar: true,
};

const HIDDEN: ZenChrome = {
  header: false,
  statusBar: false,
  sidebar: false,
  resizeHandle: false,
  surfacePadding: false,
  paneFrame: false,
  inputBar: false,
};

describe("zenChrome", () => {
  it.each(ALL_KINDS)(
    "[AC-2] shows everything with zen off (active tab %s)",
    (kind) => {
      expect(zenChrome(false, kind)).toEqual(SHOWN);
    },
  );

  it("[AC-2] keeps only the input bar in a terminal tab with zen on", () => {
    expect(zenChrome(true, "terminal")).toEqual({ ...HIDDEN, inputBar: true });
  });

  it.each(ALL_KINDS.filter((k) => k !== "terminal"))(
    "[AC-2] hides everything, input bar included, with zen on (active tab %s)",
    (kind) => {
      expect(zenChrome(true, kind)).toEqual(HIDDEN);
    },
  );

  it("[AC-2] returns a fresh object, so a caller cannot change the zen-off layout", () => {
    const a = zenChrome(false, "editor");
    a.header = false;
    expect(zenChrome(false, "editor").header).toBe(true);
  });
});

describe("aiToggleAllowed", () => {
  it.each(ALL_KINDS)("acts as before with zen off (active tab %s)", (kind) => {
    expect(aiToggleAllowed(false, kind)).toBe(true);
  });

  it("acts in a terminal tab with zen on (the input bar is shown)", () => {
    expect(aiToggleAllowed(true, "terminal")).toBe(true);
  });

  it.each(ALL_KINDS.filter((k) => k !== "terminal"))(
    "does nothing with zen on while the input bar is hidden (active tab %s)",
    (kind) => {
      expect(aiToggleAllowed(true, kind)).toBe(false);
    },
  );
});
