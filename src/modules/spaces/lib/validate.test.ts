import { describe, expect, it } from "vitest";
import { isSpaceMeta, isSpaceState } from "./validate";

const validMeta = {
  id: "s1",
  name: "Space",
  root: "/home/me/proj",
  env: { kind: "local" },
  createdAt: 1,
  updatedAt: 2,
};

describe("isSpaceMeta", () => {
  it("accepts a well-formed meta (including null root)", () => {
    expect(isSpaceMeta(validMeta)).toBe(true);
    expect(isSpaceMeta({ ...validMeta, root: null })).toBe(true);
  });

  it("rejects non-objects and missing/typed-wrong fields", () => {
    expect(isSpaceMeta(null)).toBe(false);
    expect(isSpaceMeta("nope")).toBe(false);
    expect(isSpaceMeta({ ...validMeta, id: 42 })).toBe(false);
    expect(isSpaceMeta({ ...validMeta, root: 5 })).toBe(false);
    expect(isSpaceMeta({ ...validMeta, createdAt: "soon" })).toBe(false);
  });

  it("rejects a meta whose env has no kind", () => {
    expect(isSpaceMeta({ ...validMeta, env: {} })).toBe(false);
    expect(isSpaceMeta({ ...validMeta, env: null })).toBe(false);
  });
});

describe("isSpaceState", () => {
  it("accepts a well-formed state", () => {
    expect(isSpaceState({ tabs: [], activeTabIndex: 0 })).toBe(true);
  });

  it("rejects malformed state", () => {
    expect(isSpaceState(null)).toBe(false);
    expect(isSpaceState({ tabs: "x", activeTabIndex: 0 })).toBe(false);
    expect(isSpaceState({ tabs: [] })).toBe(false);
  });
});
