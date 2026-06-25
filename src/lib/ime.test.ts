import { describe, expect, it } from "vitest";
import { isImeComposing } from "./ime";

describe("isImeComposing", () => {
  it("is true while the IME is composing", () => {
    expect(isImeComposing({ isComposing: true })).toBe(true);
  });

  it("is true for the keyCode 229 Process key", () => {
    expect(isImeComposing({ keyCode: 229 })).toBe(true);
  });

  it("is false for an ordinary Enter key", () => {
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
  });

  it("is false for an empty event", () => {
    expect(isImeComposing({})).toBe(false);
  });
});
