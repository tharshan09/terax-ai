import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { basename } from "@/lib/utils";
import {
  isTerminalPasteChord,
  type TerminalKeyEvent,
} from "@/modules/terminal/lib/keymap";
import type { WorkspaceEnv } from "@/modules/workspace";
import { dirname } from "./useFileTree";

export function pasteTargetDir(
  selected: string | null,
  isDir: (path: string) => boolean | undefined,
  rootPath: string,
): string {
  if (!selected) return rootPath;
  return isDir(selected) ? selected : dirname(selected);
}

// One paste at a time; a second request says so instead of silently doing nothing.
export async function pasteExclusively(
  busy: { current: boolean },
  paste: () => Promise<void>,
): Promise<void> {
  if (busy.current) {
    toast.message("A paste is already running");
    return;
  }
  busy.current = true;
  try {
    await paste();
  } finally {
    busy.current = false;
  }
}

// Files come from the macOS pasteboard only, so other platforms get no shortcut.
export function isPasteShortcut(e: TerminalKeyEvent, isMac: boolean): boolean {
  return isMac && isTerminalPasteChord(e, { isMac });
}

// Holding Cmd+V repeats keydown: only the first press pastes.
export function pasteKeyAction(
  e: TerminalKeyEvent & Pick<KeyboardEvent, "repeat">,
  isMac: boolean,
): "paste" | "swallow" | null {
  if (!isPasteShortcut(e, isMac)) return null;
  return e.repeat ? "swallow" : "paste";
}

type FolderState = { status: string } | undefined;

export type PendingPaste = "select" | "wait" | "drop";

// A re-read that leaves the folder listing unchanged causes no tree update, so
// a name the listing filters out (hidden while show-hidden is off) drops at once.
export function pendingPasteAction(
  path: string,
  inTree: boolean,
  folder: FolderState,
  folderAtPaste: FolderState,
  showHidden: boolean,
): PendingPaste {
  if (inTree) return "select";
  if (!showHidden && basename(path).startsWith(".")) return "drop";
  const reread =
    folder !== folderAtPaste &&
    (folder?.status === "loaded" || folder?.status === "error");
  return reread ? "drop" : "wait";
}

export type CopyResult = {
  created: string[];
  failed: { source: string; message: string }[];
};

type PasteOptions = {
  workspace: WorkspaceEnv;
  rootPath: string;
  isCurrent: () => boolean;
  isExpanded: (dir: string) => boolean;
  isWatched: (dir: string) => boolean;
  refresh: (dir: string) => void;
  expand: (dir: string) => void;
};

// The local watcher reports a publish into a watched folder; SSH has no watcher.
export function rereadUnlessWatched(
  dir: string,
  isWatched: (dir: string) => boolean,
  refresh: (dir: string) => void,
): void {
  if (!isWatched(dir)) refresh(dir);
}

export function reportCopyFailures(result: CopyResult): void {
  if (result.failed.length === 0) return;
  const first = result.failed[0];
  const count = result.failed.length;
  toast.error(`Could not copy ${count} ${count === 1 ? "item" : "items"}`, {
    description: `${first.source}: ${first.message}`,
  });
}

// Copies the files on the OS clipboard into `destDir` and returns the created
// paths, or nothing once the explorer has moved to another root or workspace.
export async function pasteClipboardFiles(
  destDir: string,
  {
    workspace,
    rootPath,
    isCurrent,
    isExpanded,
    isWatched,
    refresh,
    expand,
  }: PasteOptions,
): Promise<string[]> {
  // A collapsed folder is read when it opens, so it gets no extra re-read.
  const isOpen = () => destDir === rootPath || isExpanded(destDir);
  const reread = () => rereadUnlessWatched(destDir, isWatched, refresh);
  let copyStarted = false;
  try {
    const sources = await invoke<string[]>("fs_clipboard_paths");
    if (!isCurrent()) return [];
    if (sources.length === 0) {
      toast.message("No files on the clipboard");
      return [];
    }
    copyStarted = true;
    const result = await invoke<CopyResult>("fs_copy", {
      sources,
      destDir,
      workspace,
      renameOnConflict: true,
    });
    reportCopyFailures(result);
    if (!isCurrent()) return [];
    if (isOpen()) reread();
    else if (result.created.length > 0) expand(destDir);
    return result.created;
  } catch (err) {
    toast.error(`Paste failed: ${String(err)}`);
    if (copyStarted && isCurrent() && isOpen()) reread();
    return [];
  }
}
