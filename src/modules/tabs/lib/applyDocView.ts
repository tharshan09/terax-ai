import { isHtmlPath, isMarkdownPath } from "@/lib/utils";
import type { Tab } from "./useTabs";

/**
 * Pure transform behind `useTabs().setDocView`. Toggles a single tab between
 * its rendered doc kind (markdown / html) and a raw editor, in place, keeping
 * the same id. The target raw/rendered kind is derived from the file
 * extension, so the shared toggle UI doesn't need to pass it. Tabs that don't
 * match `id`, or whose path isn't a markdown/html file, are returned unchanged.
 *
 * Invariants (locked by tests):
 *  - rendered -> raw turns a markdown/html tab into an editor tab.
 *  - raw -> rendered is refused while the editor is dirty (no silent data loss).
 *  - the tab's id, spaceId, cold flag, path and workspace survive every toggle.
 */
export function applyDocView(t: Tab, id: number, mode: "rendered" | "raw") {
  const path = (t as { path?: string }).path ?? "";
  const html = isHtmlPath(path);
  if (t.id !== id || (!isMarkdownPath(path) && !html)) return t;
  if (mode === "raw" && t.kind === "markdown") {
    return {
      ...t,
      kind: "editor" as const,
      dirty: false,
      preview: false,
      overrideLanguage:
        (t as { overrideLanguage?: string | null }).overrideLanguage ?? null,
    };
  }
  if (mode === "raw" && t.kind === "html") {
    return {
      id: t.id,
      kind: "editor" as const,
      spaceId: t.spaceId,
      cold: t.cold,
      title: t.title,
      path: t.path,
      workspace: t.workspace,
      dirty: false,
      preview: false,
      overrideLanguage: null,
    };
  }
  if (mode === "rendered" && t.kind === "editor") {
    if (t.dirty) return t;
    if (html) {
      return {
        id: t.id,
        kind: "html" as const,
        spaceId: t.spaceId,
        cold: t.cold,
        title: t.title,
        path: t.path,
        workspace: t.workspace,
      };
    }
    return {
      id: t.id,
      kind: "markdown" as const,
      spaceId: t.spaceId,
      cold: t.cold,
      title: t.title,
      path: t.path,
      workspace: t.workspace,
      overrideLanguage: t.overrideLanguage ?? null,
    };
  }
  return t;
}
