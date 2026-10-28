import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import {
  isTerminalPasteChord,
  type TerminalKeyEvent,
} from "@/modules/terminal/lib/keymap";
import type { WorkspaceEnv } from "@/modules/workspace";
import { dirname } from "./useFileTree";

// The folder a row stands for when something lands on it: paste, drop or move.
export function pasteTargetDir<Root extends string | null>(
  selected: string | null | undefined,
  isDir: (path: string) => boolean | undefined,
  rootPath: Root,
): string | Root {
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

export type CopyResult = {
  created: string[];
  failed: { source: string; message: string }[];
  aborted?: string | null;
};

type PasteOptions = {
  workspace: WorkspaceEnv;
  rootPath: string;
  isCurrent: () => boolean;
  isExpanded: (dir: string) => boolean;
  // Both settle once the folder's re-read shows in the tree.
  refresh: (dir: string) => Promise<void>;
  expand: (dir: string) => Promise<void>;
  hasRow: (path: string) => boolean;
  select: (path: string) => void;
};

// A lost connection explains every failure after it, so it beats the first one.
export function reportCopyFailures(result: CopyResult): void {
  if (result.failed.length === 0) return;
  const first = result.failed[0];
  const count = result.failed.length;
  toast.error(`Could not copy ${count} ${count === 1 ? "item" : "items"}`, {
    description: result.aborted ?? `${first.source}: ${first.message}`,
  });
}

// Copies the files on the OS clipboard into `destDir`, re-reads it and selects
// the first new row. Returns the created paths, or nothing once the explorer
// has moved to another root or workspace.
export async function pasteClipboardFiles(
  destDir: string,
  {
    workspace,
    rootPath,
    isCurrent,
    isExpanded,
    refresh,
    expand,
    hasRow,
    select,
  }: PasteOptions,
): Promise<string[]> {
  // A collapsed folder is read when it opens, so it gets no extra re-read.
  const isOpen = () => destDir === rootPath || isExpanded(destDir);
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
    if (isOpen()) await refresh(destDir);
    else if (result.created.length > 0) await expand(destDir);
    if (!isCurrent()) return [];
    const first = result.created[0];
    if (first && hasRow(first)) select(first);
    return result.created;
  } catch (err) {
    toast.error(`Paste failed: ${String(err)}`);
    if (copyStarted && isCurrent() && isOpen()) await refresh(destDir);
    return [];
  }
}
