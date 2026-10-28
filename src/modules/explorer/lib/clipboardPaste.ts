import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { basename } from "@/lib/utils";
import {
  isTerminalPasteChord,
  type TerminalKeyEvent,
} from "@/modules/terminal/lib/keymap";
import type { WorkspaceEnv } from "@/modules/workspace";
import { dirname } from "./paths";
import type { RefreshOptions } from "./useFileTree";

// One paste at a time; a second request says so instead of silently doing
// nothing. `release` frees the lock early, never one a later paste took.
export async function pasteExclusively(
  busy: { current: boolean },
  paste: (release: () => void) => Promise<void>,
): Promise<void> {
  if (busy.current) {
    toast.message("A paste is already running");
    return;
  }
  busy.current = true;
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    busy.current = false;
  };
  try {
    await paste(release);
  } finally {
    release();
  }
}

// Files come from the macOS pasteboard only, so other platforms get no shortcut;
// holding Cmd+V repeats keydown, and only the first press pastes.
export function pasteKeyAction(
  e: TerminalKeyEvent & Pick<KeyboardEvent, "repeat">,
  isMac: boolean,
): "paste" | "swallow" | null {
  if (!isMac || !isTerminalPasteChord(e, { isMac })) return null;
  return e.repeat ? "swallow" : "paste";
}

export type CopyResult = {
  created: string[];
  // `maybePlaced`: cut off while publishing, so the item may be in place.
  failed: { source: string; message: string; maybePlaced?: boolean }[];
  aborted?: string | null;
};

// `unresolved` counts file URLs whose file is gone (deleted since the copy).
type ClipboardFiles = { paths: string[]; unresolved: number };

// The root and workspace an explorer action started under, current by identity.
export type ExplorerScope = {
  readonly rootPath: string;
  readonly workspace: WorkspaceEnv;
};

type PasteOptions = {
  scope: ExplorerScope;
  isCurrent: (scope: ExplorerScope) => boolean;
  isExpanded: (dir: string) => boolean;
  // Both settle once the folder's re-read shows in the tree.
  refresh: (dir: string, options?: RefreshOptions) => Promise<void>;
  expand: (dir: string) => Promise<void>;
  hasRow: (path: string) => boolean;
  select: (path: string) => void;
  // Called once fs_copy returns: only the copy itself needs the paste lock.
  onCopySettled: () => void;
};

// A target under a folder collapsed meanwhile is neither opened nor selected.
function inView(
  dir: string,
  root: string,
  isExpanded: (dir: string) => boolean,
): boolean {
  for (let path = dir; path !== root; ) {
    const parent = dirname(path);
    if (parent === path) return false;
    if (parent !== root && !isExpanded(parent)) return false;
    path = parent;
  }
  return true;
}

// An open folder is re-read after a copy; after a lost connection only if
// something landed, and then a failing re-read keeps the last good listing.
export function rereadAfterCopy(
  result: CopyResult,
  dir: string,
  root: string,
  isExpanded: (dir: string) => boolean,
): RefreshOptions | null {
  if (dir !== root && !isExpanded(dir)) return null;
  if (!result.aborted) return {};
  return result.created.length > 0 ? { keepOnError: true } : null;
}

function missingItems(unresolved: number): string {
  return unresolved === 1
    ? "1 copied item no longer exists"
    : `${unresolved} copied items no longer exist`;
}

function maybePlacedNote(failed: CopyResult["failed"]): string | null {
  const placed = failed.filter((f) => f.maybePlaced);
  if (placed.length === 0) return null;
  const more = placed.length > 1 ? ` and ${placed.length - 1} more` : "";
  return `${basename(placed[0].source)}${more} may already be in place.`;
}

// A lost connection explains every failure after it, so it beats the first one.
export function reportCopyFailures(result: CopyResult, unresolved = 0): void {
  const count = result.failed.length + unresolved;
  if (count === 0) return;
  const first = result.failed[0];
  const reason =
    result.aborted ??
    (first ? `${first.source}: ${first.message}` : missingItems(unresolved));
  const note = maybePlacedNote(result.failed);
  toast.error(`Could not copy ${count} ${count === 1 ? "item" : "items"}`, {
    description: note ? `${reason.replace(/\.$/, "")}. ${note}` : reason,
  });
}

function cancelled(): string[] {
  toast.message("Paste cancelled: the explorer changed");
  return [];
}

// Nothing touches the tree once `scope` is no longer current.
export async function pasteClipboardFiles(
  destDir: string,
  {
    scope,
    isCurrent: isCurrentScope,
    isExpanded,
    refresh,
    expand,
    hasRow,
    select,
    onCopySettled,
  }: PasteOptions,
): Promise<string[]> {
  const isCurrent = () => isCurrentScope(scope);
  if (!isCurrent()) return cancelled();
  let unresolved = 0;
  try {
    const clipboard = await invoke<ClipboardFiles>("fs_clipboard_paths");
    const sources = clipboard.paths;
    unresolved = clipboard.unresolved;
    if (!isCurrent()) return cancelled();
    if (sources.length === 0) {
      if (unresolved > 0)
        reportCopyFailures({ created: [], failed: [] }, unresolved);
      else toast.message("No files on the clipboard");
      return [];
    }
    let result: CopyResult;
    try {
      result = await invoke<CopyResult>("fs_copy", {
        sources,
        destDir,
        workspace: scope.workspace,
        renameOnConflict: true,
      });
    } finally {
      onCopySettled();
    }
    reportCopyFailures(result, unresolved);
    if (!isCurrent()) return [];
    // A collapsed folder is read when it opens, so it gets no extra re-read.
    const reread = rereadAfterCopy(result, destDir, scope.rootPath, isExpanded);
    const shown = inView(destDir, scope.rootPath, isExpanded);
    if (reread) await refresh(destDir, reread);
    else if (!result.aborted && result.created.length > 0 && shown)
      await expand(destDir);
    else return result.aborted ? [] : result.created;
    if (!isCurrent()) return [];
    const row = result.created[0];
    if (row && hasRow(row)) select(row);
    return result.created;
  } catch (err) {
    if (unresolved > 0)
      toast.error("Paste failed", {
        description: `${String(err)} · ${missingItems(unresolved)}`,
      });
    else toast.error(`Paste failed: ${String(err)}`);
    return [];
  }
}
