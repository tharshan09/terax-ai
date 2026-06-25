import type { SpaceMeta, SpaceState } from "./store";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Narrow a persisted JSON value to a SpaceMeta. Persisted state can be stale,
 * partially written, or hand-edited, so a malformed entry must be dropped
 * rather than cast blindly and crash hydration downstream. */
export function isSpaceMeta(v: unknown): v is SpaceMeta {
  if (!isObject(v)) return false;
  if (typeof v.id !== "string" || typeof v.name !== "string") return false;
  if (!(v.root === null || typeof v.root === "string")) return false;
  if (!isObject(v.env) || typeof v.env.kind !== "string") return false;
  return typeof v.createdAt === "number" && typeof v.updatedAt === "number";
}

export function isSpaceState(v: unknown): v is SpaceState {
  return (
    isObject(v) &&
    Array.isArray(v.tabs) &&
    typeof v.activeTabIndex === "number"
  );
}
