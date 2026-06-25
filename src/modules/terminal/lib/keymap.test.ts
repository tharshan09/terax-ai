import { describe, expect, it } from "vitest";

import {
  isTerminalCopyChord,
  isTerminalPasteChord,
  terminalDeleteSequence,
  terminalLineNavigationSequence,
  terminalWordNavigationSequence,
  type TerminalKeyEvent,
} from "./keymap";

const evt = (partial: Partial<TerminalKeyEvent>): TerminalKeyEvent => ({
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  key: "",
  code: "",
  ...partial,
});

describe("terminalWordNavigationSequence", () => {
  it("maps Option+Left to readline word-left", () => {
    expect(
      terminalWordNavigationSequence(
        evt({ altKey: true, key: "ArrowLeft", code: "ArrowLeft" }),
      ),
    ).toBe("\x1bb");
  });

  it("maps Option+Right to readline word-right", () => {
    expect(
      terminalWordNavigationSequence(
        evt({ altKey: true, key: "ArrowRight", code: "ArrowRight" }),
      ),
    ).toBe("\x1bf");
  });

  it("does not remap plain arrows", () => {
    expect(
      terminalWordNavigationSequence(
        evt({ key: "ArrowLeft", code: "ArrowLeft" }),
      ),
    ).toBeNull();
  });
});

describe("terminalLineNavigationSequence", () => {
  it("maps Cmd+Left to readline line-start on macOS", () => {
    expect(
      terminalLineNavigationSequence(
        evt({ metaKey: true, key: "ArrowLeft", code: "ArrowLeft" }),
        { isMac: true },
      ),
    ).toBe("\x01");
  });

  it("maps Cmd+Right to readline line-end on macOS", () => {
    expect(
      terminalLineNavigationSequence(
        evt({ metaKey: true, key: "ArrowRight", code: "ArrowRight" }),
        { isMac: true },
      ),
    ).toBe("\x05");
  });

  it("does not remap Cmd+Arrow off macOS", () => {
    expect(
      terminalLineNavigationSequence(
        evt({ metaKey: true, key: "ArrowLeft", code: "ArrowLeft" }),
        { isMac: false },
      ),
    ).toBeNull();
  });

  it("does not remap Cmd+Option+Arrow (selection-style combos pass through)", () => {
    expect(
      terminalLineNavigationSequence(
        evt({ metaKey: true, altKey: true, key: "ArrowLeft", code: "ArrowLeft" }),
        { isMac: true },
      ),
    ).toBeNull();
  });
});

describe("terminalDeleteSequence", () => {
  it("maps Cmd+Backspace to kill-to-line-start on macOS", () => {
    expect(
      terminalDeleteSequence(
        evt({ metaKey: true, key: "Backspace", code: "Backspace" }),
        { isMac: true },
      ),
    ).toBe("\x15");
  });

  it("maps Option+Backspace to kill-word-backward on macOS", () => {
    expect(
      terminalDeleteSequence(
        evt({ altKey: true, key: "Backspace", code: "Backspace" }),
        { isMac: true },
      ),
    ).toBe("\x17");
  });

  it("maps Ctrl+Backspace to kill-word-backward off macOS", () => {
    expect(
      terminalDeleteSequence(
        evt({ ctrlKey: true, key: "Backspace", code: "Backspace" }),
        { isMac: false },
      ),
    ).toBe("\x17");
  });

  it("does not remap Ctrl+Backspace on macOS (reserved for native readline binding)", () => {
    expect(
      terminalDeleteSequence(
        evt({ ctrlKey: true, key: "Backspace", code: "Backspace" }),
        { isMac: true },
      ),
    ).toBeNull();
  });

  it("does not remap Cmd+Backspace off macOS", () => {
    expect(
      terminalDeleteSequence(
        evt({ metaKey: true, key: "Backspace", code: "Backspace" }),
        { isMac: false },
      ),
    ).toBeNull();
  });

  it("does not remap plain Backspace", () => {
    expect(
      terminalDeleteSequence(
        evt({ key: "Backspace", code: "Backspace" }),
        { isMac: true },
      ),
    ).toBeNull();
  });
});

describe("isTerminalCopyChord", () => {
  it("matches Cmd+C on macOS", () => {
    expect(
      isTerminalCopyChord(evt({ metaKey: true, code: "KeyC" }), { isMac: true }),
    ).toBe(true);
  });

  it("matches Ctrl+C off macOS", () => {
    expect(
      isTerminalCopyChord(evt({ ctrlKey: true, code: "KeyC" }), {
        isMac: false,
      }),
    ).toBe(true);
  });

  it("matches via key as well as code (layout-independent)", () => {
    expect(
      isTerminalCopyChord(evt({ ctrlKey: true, key: "c" }), { isMac: false }),
    ).toBe(true);
  });

  it("does not match Ctrl+C on macOS (that is SIGINT)", () => {
    expect(
      isTerminalCopyChord(evt({ ctrlKey: true, code: "KeyC" }), {
        isMac: true,
      }),
    ).toBe(false);
  });

  it("does not match Cmd+C off macOS", () => {
    expect(
      isTerminalCopyChord(evt({ metaKey: true, code: "KeyC" }), {
        isMac: false,
      }),
    ).toBe(false);
  });

  it("does not match the explicit Ctrl+Shift+C shortcut", () => {
    expect(
      isTerminalCopyChord(evt({ ctrlKey: true, shiftKey: true, code: "KeyC" }), {
        isMac: false,
      }),
    ).toBe(false);
  });

  it("does not match when Alt is held", () => {
    expect(
      isTerminalCopyChord(evt({ ctrlKey: true, altKey: true, code: "KeyC" }), {
        isMac: false,
      }),
    ).toBe(false);
  });

  it("does not match a different key", () => {
    expect(
      isTerminalCopyChord(evt({ ctrlKey: true, code: "KeyX" }), {
        isMac: false,
      }),
    ).toBe(false);
  });
});

describe("isTerminalPasteChord", () => {
  it("matches Cmd+V on macOS", () => {
    expect(
      isTerminalPasteChord(evt({ metaKey: true, code: "KeyV" }), {
        isMac: true,
      }),
    ).toBe(true);
  });

  it("matches Ctrl+V off macOS", () => {
    expect(
      isTerminalPasteChord(evt({ ctrlKey: true, code: "KeyV" }), {
        isMac: false,
      }),
    ).toBe(true);
  });

  it("does not match Ctrl+V on macOS", () => {
    expect(
      isTerminalPasteChord(evt({ ctrlKey: true, code: "KeyV" }), {
        isMac: true,
      }),
    ).toBe(false);
  });

  it("does not match the explicit Ctrl+Shift+V shortcut", () => {
    expect(
      isTerminalPasteChord(
        evt({ ctrlKey: true, shiftKey: true, code: "KeyV" }),
        { isMac: false },
      ),
    ).toBe(false);
  });
});
