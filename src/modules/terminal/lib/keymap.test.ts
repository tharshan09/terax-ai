import { describe, expect, it } from "vitest";

import {
  isLinuxImeDuplicateKeydown,
  terminalDeleteSequence,
  terminalLineNavigationSequence,
  terminalWordNavigationSequence,
  type TerminalKeyEvent,
} from "./keymap";

const evt = (partial: Partial<TerminalKeyEvent>): TerminalKeyEvent => ({
  altKey: false,
  ctrlKey: false,
  metaKey: false,
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

describe("isLinuxImeDuplicateKeydown", () => {
  it("suppresses a bare non-Latin char on Linux (accented latin)", () => {
    expect(isLinuxImeDuplicateKeydown(evt({ key: "ñ" }), { isLinux: true })).toBe(
      true,
    );
  });

  it("suppresses Cyrillic and CJK on Linux", () => {
    expect(isLinuxImeDuplicateKeydown(evt({ key: "д" }), { isLinux: true })).toBe(
      true,
    );
    expect(isLinuxImeDuplicateKeydown(evt({ key: "中" }), { isLinux: true })).toBe(
      true,
    );
  });

  it("leaves ASCII keys alone", () => {
    expect(isLinuxImeDuplicateKeydown(evt({ key: "a" }), { isLinux: true })).toBe(
      false,
    );
  });

  it("leaves modified keys alone (Ctrl/Alt/AltGr/Meta)", () => {
    expect(
      isLinuxImeDuplicateKeydown(evt({ key: "ñ", ctrlKey: true }), {
        isLinux: true,
      }),
    ).toBe(false);
    // AltGr surfaces as Ctrl+Alt; must not be swallowed.
    expect(
      isLinuxImeDuplicateKeydown(evt({ key: "@", ctrlKey: true, altKey: true }), {
        isLinux: true,
      }),
    ).toBe(false);
  });

  it("never fires off Linux (macOS/Windows deliver such input once)", () => {
    expect(
      isLinuxImeDuplicateKeydown(evt({ key: "ñ" }), { isLinux: false }),
    ).toBe(false);
  });

  it("ignores named keys and empty key strings", () => {
    expect(
      isLinuxImeDuplicateKeydown(evt({ key: "Enter" }), { isLinux: true }),
    ).toBe(false);
    expect(
      isLinuxImeDuplicateKeydown(evt({ key: "ArrowLeft" }), { isLinux: true }),
    ).toBe(false);
    expect(isLinuxImeDuplicateKeydown(evt({ key: "" }), { isLinux: true })).toBe(
      false,
    );
  });
});
