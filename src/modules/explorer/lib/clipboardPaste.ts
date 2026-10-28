import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  isTerminalPasteChord,
  type TerminalKeyEvent,
} from "@/modules/terminal/lib/keymap";
import type { WorkspaceEnv } from "@/modules/workspace";

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
  failed: { source: string; message: string }[];
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
  refresh: (dir: string) => Promise<void>;
  expand: (dir: string) => Promise<void>;
  hasRow: (path: string) => boolean;
  select: (path: string) => void;
  // Called once fs_copy returns: only the copy itself needs the paste lock.
  onCopySettled: () => void;
};

function missingItems(unresolved: number): string {
  return unresolved === 1
    ? "1 copied item no longer exists"
    : `${unresolved} copied items no longer exist`;
}

// A lost connection explains every failure after it, so it beats the first one.
export function reportCopyFailures(result: CopyResult, unresolved = 0): void {
  const count = result.failed.length + unresolved;
  if (count === 0) return;
  const first = result.failed[0];
  toast.error(`Could not copy ${count} ${count === 1 ? "item" : "items"}`, {
    description:
      result.aborted ??
      (first ? `${first.source}: ${first.message}` : missingItems(unresolved)),
  });
}

function cancelled(): string[] {
  toast.message("Paste cancelled: the explorer changed");
  return [];
}

// Copies the clipboard's files into `destDir` and selects the first new row;
// nothing touches the tree once `scope` is no longer current.
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
  // A collapsed folder is read when it opens, so it gets no extra re-read.
  const isOpen = () => destDir === scope.rootPath || isExpanded(destDir);
  let copyStarted = false;
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
    copyStarted = true;
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
    if (isOpen()) await refresh(destDir);
    else if (result.created.length > 0) await expand(destDir);
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
    if (copyStarted && isCurrent() && isOpen()) await refresh(destDir);
    return [];
  }
}
