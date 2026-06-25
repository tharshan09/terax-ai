import type { WorkspaceEnv } from "@/modules/workspace";
import type { EditorTab, Tab } from "./useTabs";

export type ResolveFileTabOpenOptions = {
  /** Allocates the id for a newly created tab. Only called when a tab is added. */
  makeId: () => number;
  spaceId: string;
  /** Env the file lives in, captured by the caller at open time. */
  workspace: WorkspaceEnv;
  /** Display title for a newly created tab (typically `basename(path)`). */
  title: string;
};

export type ResolveFileTabOpenResult = {
  tabs: Tab[];
  targetId: number;
};

/**
 * Pure decision logic behind `useTabs().openFileTab`. Given the current tab
 * list and a path, returns the next tab list plus the tab to activate. Kept
 * side-effect free (id allocation is delegated to `makeId`) so the three
 * VSCode-style invariants are unit-testable without a React host:
 *
 *  1. `pin = true` — opens or activates a **persistent** tab. A matching
 *     preview tab is promoted in-place (preview → false); an existing
 *     persistent tab is reused unchanged.
 *  2. `pin = false` — VSCode-style **preview** open. A single shared preview
 *     slot is reused: the new path replaces whatever the slot showed, or a new
 *     slot is appended when none exists.
 *  3. `pin = false` — a persistent tab for the path takes priority over the
 *     preview slot and is activated without touching the slot.
 */
export function resolveFileTabOpen(
  curr: Tab[],
  path: string,
  pin: boolean,
  opts: ResolveFileTabOpenOptions,
): ResolveFileTabOpenResult {
  const { makeId, spaceId, workspace, title } = opts;

  if (pin) {
    // Persistent open: find any existing editor tab, pin it if needed.
    const existing = curr.find((t) => t.kind === "editor" && t.path === path);
    if (existing) {
      if ((existing as EditorTab).preview) {
        return {
          tabs: curr.map((t) =>
            t.id === existing.id ? { ...t, preview: false } : t,
          ),
          targetId: existing.id,
        };
      }
      return { tabs: curr, targetId: existing.id };
    }
    const id = makeId();
    return {
      tabs: [
        ...curr,
        {
          id,
          kind: "editor",
          spaceId,
          title,
          path,
          dirty: false,
          preview: false,
          workspace,
        } satisfies EditorTab,
      ],
      targetId: id,
    };
  }

  // Preview open: persistent tab for this path takes priority.
  const persistent = curr.find(
    (t) => t.kind === "editor" && t.path === path && !(t as EditorTab).preview,
  );
  if (persistent) return { tabs: curr, targetId: persistent.id };
  // Reuse the slot if it already shows the same path.
  const existingPreview = curr.find(
    (t) => t.kind === "editor" && t.path === path && (t as EditorTab).preview,
  );
  if (existingPreview) return { tabs: curr, targetId: existingPreview.id };
  // Replace the current preview slot, or append a new one.
  const previewIdx = curr.findIndex(
    (t) => t.kind === "editor" && (t as EditorTab).preview,
  );
  const id = makeId();
  const tab: EditorTab = {
    id,
    kind: "editor",
    spaceId,
    title,
    path,
    dirty: false,
    preview: true,
    workspace,
  };
  if (previewIdx === -1) return { tabs: [...curr, tab], targetId: id };
  const next = [...curr];
  next[previewIdx] = tab;
  return { tabs: next, targetId: id };
}
