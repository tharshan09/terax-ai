import { type CopyResult, copyFailureReason } from "@/lib/copyFailure";
import { basename } from "@/lib/utils";
import type { WorkspaceEnv } from "@/modules/workspace";
import { formatDroppedPaths } from "./quoteShellPath";

export const UPLOAD_DIR = "~/.terax/uploads";
export const UPLOAD_LIMIT_BYTES = 104_857_600;
export const FOLDER_NOTICE =
  "Folders can't be uploaded to a terminal. Use the explorer.";

export type PasteDecision = "upload" | "text";

export type ClipboardContent = { hasImage: boolean; text: string };

// Any text wins, so a copy from an app that also offers an image pastes as today.
export function pasteDecision(
  env: Pick<WorkspaceEnv, "kind">,
  clipboard: ClipboardContent,
): PasteDecision {
  if (env.kind !== "ssh") return "text";
  return clipboard.hasImage && clipboard.text === "" ? "upload" : "text";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function clipboardImageName(now: Date): string {
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return `clipboard-${date}-${time}.png`;
}

export type DroppedItem = { path: string; size: number; isDir: boolean };

export type UploadSelection = { upload: string[]; notices: string[] };

export function oversizeNotice(path: string): string {
  return `${basename(path)} is larger than 100 MB and was not uploaded.`;
}

// Checked before any transfer; the folder notice is said once per drop.
export function selectUploads(items: DroppedItem[]): UploadSelection {
  const upload: string[] = [];
  const notices: string[] = [];
  let folders = false;
  for (const item of items) {
    if (item.isDir) folders = true;
    else if (item.size > UPLOAD_LIMIT_BYTES)
      notices.push(oversizeNotice(item.path));
    else upload.push(item.path);
  }
  if (folders) notices.push(FOLDER_NOTICE);
  return { upload, notices };
}

// The server is POSIX whatever the client OS; null when nothing landed.
export function uploadPasteText(serverPaths: string[]): string | null {
  if (serverPaths.length === 0) return null;
  return formatDroppedPaths(serverPaths, "posix");
}

export type UploadJob = { id: number; files: string[] };

export type UploadQueues = ReadonlyMap<number, readonly UploadJob[]>;

export const EMPTY_UPLOAD_QUEUES: UploadQueues = new Map();

// Jobs of one pane run in trigger order: only the head runs, so its paths
// are pasted before those of any job queued after it.
export function enqueueUpload(
  queues: UploadQueues,
  paneId: number,
  job: UploadJob,
): UploadQueues {
  const next = new Map(queues);
  next.set(paneId, [...(queues.get(paneId) ?? []), job]);
  return next;
}

export function runningUpload(
  queues: UploadQueues,
  paneId: number,
): UploadJob | null {
  return queues.get(paneId)?.[0] ?? null;
}

export function finishUpload(
  queues: UploadQueues,
  paneId: number,
  jobId: number,
): UploadQueues {
  const jobs = queues.get(paneId);
  if (!jobs?.some((j) => j.id === jobId)) return queues;
  const next = new Map(queues);
  const rest = jobs.filter((j) => j.id !== jobId);
  if (rest.length > 0) next.set(paneId, rest);
  else next.delete(paneId);
  return next;
}

export function dropPaneUploads(
  queues: UploadQueues,
  paneId: number,
): UploadQueues {
  if (!queues.has(paneId)) return queues;
  const next = new Map(queues);
  next.delete(paneId);
  return next;
}

export function pendingUploadCount(
  queues: UploadQueues,
  paneId: number,
): number {
  return (queues.get(paneId) ?? []).reduce((n, j) => n + j.files.length, 0);
}

export function uploadHint(pending: number): string | null {
  if (pending <= 0) return null;
  return `Uploading ${pending} ${pending === 1 ? "file" : "files"}...`;
}

export type UploadToast = { title: string; description?: string };

export type UploadOutcome = {
  paste: string | null;
  toast: UploadToast | null;
};

const NOTHING: UploadOutcome = { paste: null, toast: null };

function failureToast(result: CopyResult): UploadToast | null {
  const reason = copyFailureReason(result, basename);
  if (reason === null) return null;
  const title = `Upload failed: ${reason}`;
  if (result.failed.length === 0) return { title };
  const names = result.failed.map((f) => basename(f.source)).join(", ");
  return { title, description: `Not uploaded: ${names}` };
}

// A pane closed meanwhile gets neither a paste nor a toast.
export function uploadOutcome(
  result: CopyResult,
  paneOpen: boolean,
): UploadOutcome {
  if (!paneOpen) return NOTHING;
  return {
    paste: uploadPasteText(result.created),
    toast: failureToast(result),
  };
}

export function uploadErrorOutcome(
  error: unknown,
  paneOpen: boolean,
): UploadOutcome {
  if (!paneOpen) return NOTHING;
  return { paste: null, toast: { title: `Upload failed: ${String(error)}` } };
}
