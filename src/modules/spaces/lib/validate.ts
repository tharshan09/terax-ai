import { normalizeGroupName } from "@/modules/tabs/lib/tabGroups";
import type { SerializedGroup } from "./serialize";
import { SPACE_COLORS } from "./spaceColor";
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

function readGroupEntry(v: unknown): SerializedGroup | null {
  if (!isObject(v) || Array.isArray(v)) return null;
  const color =
    Number.isInteger(v.color) &&
    (v.color as number) >= 0 &&
    (v.color as number) < SPACE_COLORS.length
      ? (v.color as number)
      : 0;
  return {
    name: typeof v.name === "string" ? normalizeGroupName(v.name) : "",
    color,
    collapsed: v.collapsed === true,
  };
}

/** Persisted group entries, field by field lenient: only a non-object entry is
 *  invalid (null), positions stay as in the file so `group` refs still line
 *  up. Anything but a list means no groups. */
export function readGroupEntries(v: unknown): Array<SerializedGroup | null> {
  return Array.isArray(v) ? v.map(readGroupEntry) : [];
}

/** The entry position a persisted `group` ref points at, or null when the ref
 *  is no integer within the list or names an invalid entry. */
export function readGroupRef(
  v: unknown,
  entries: ReadonlyArray<SerializedGroup | null>,
): number | null {
  if (!Number.isInteger(v)) return null;
  const i = v as number;
  return i >= 0 && i < entries.length && entries[i] !== null ? i : null;
}
