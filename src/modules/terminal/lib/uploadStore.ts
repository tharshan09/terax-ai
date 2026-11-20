import type { CopyResult } from "@/lib/copyFailure";
import type { WorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { create } from "zustand";
import {
  clipboardImageName,
  type DroppedItem,
  dropPaneUploads,
  EMPTY_UPLOAD_QUEUES,
  enqueueUpload,
  finishUpload,
  pasteDecision,
  runningUpload,
  selectUploads,
  type UploadOutcome,
  type UploadQueues,
  uploadErrorOutcome,
  uploadOutcome,
} from "./terminalUpload";

export type SshEnv = Extract<WorkspaceEnv, { kind: "ssh" }>;

// Wired by the terminal session module; injected so the pane view can read
// the queue without pulling in the session and renderer machinery.
export type UploadHost = {
  // Null once the pane is closed.
  leafWorkspace: (leafId: number) => WorkspaceEnv | null;
  paste: (leafId: number, text: string) => void;
};

let host: UploadHost = { leafWorkspace: () => null, paste: () => {} };

export function configureTerminalUploads(next: UploadHost): void {
  host = next;
}

type UploadState = { queues: UploadQueues };

export const useTerminalUploadStore = create<UploadState>(() => ({
  queues: EMPTY_UPLOAD_QUEUES,
}));

// `files` sizes the hint; `sources` are the local paths to send.
type UploadRequest = { files: string[]; sources: string[] };

type UploadTask = { env: SshEnv; sources: string[] };

const NOTHING: UploadOutcome = { paste: null, toast: null };

const tasks = new Map<number, UploadTask>();
const intake = new Map<number, Promise<void>>();
let nextJobId = 1;

function paneOpen(leafId: number): boolean {
  return host.leafWorkspace(leafId) !== null;
}

export function sshEnvOf(leafId: number): SshEnv | null {
  const env = host.leafWorkspace(leafId);
  return env?.kind === "ssh" ? env : null;
}

function queues(): UploadQueues {
  return useTerminalUploadStore.getState().queues;
}

function setQueues(next: UploadQueues): void {
  useTerminalUploadStore.setState({ queues: next });
}

async function transfer(
  leafId: number,
  task: UploadTask,
): Promise<UploadOutcome> {
  try {
    if (!paneOpen(leafId)) return NOTHING;
    const destDir = await invoke<string>("ssh_prepare_upload_dir", {
      host: task.env.host,
    });
    if (!paneOpen(leafId)) return NOTHING;
    const result = await invoke<CopyResult>("fs_copy", {
      sources: task.sources,
      destDir,
      workspace: task.env,
      renameOnConflict: true,
    });
    return uploadOutcome(result, destDir, paneOpen(leafId));
  } catch (err) {
    return uploadErrorOutcome(err, paneOpen(leafId));
  }
}

function deliver(leafId: number, outcome: UploadOutcome): void {
  if (outcome.paste !== null) host.paste(leafId, outcome.paste);
  if (outcome.toast)
    toast.error(outcome.toast.title, {
      description: outcome.toast.description,
    });
}

function forgetPane(leafId: number): void {
  for (const job of queues().get(leafId) ?? []) tasks.delete(job.id);
  setQueues(dropPaneUploads(queues(), leafId));
}

async function runPane(leafId: number): Promise<void> {
  for (
    let job = runningUpload(queues(), leafId);
    job !== null;
    job = runningUpload(queues(), leafId)
  ) {
    const task = tasks.get(job.id);
    tasks.delete(job.id);
    deliver(leafId, task ? await transfer(leafId, task) : NOTHING);
    if (!paneOpen(leafId)) {
      forgetPane(leafId);
      return;
    }
    setQueues(finishUpload(queues(), leafId, job.id));
  }
}

function startUpload(leafId: number, env: SshEnv, req: UploadRequest): void {
  const job = { id: nextJobId++, files: req.files };
  tasks.set(job.id, { env, sources: req.sources });
  const next = enqueueUpload(queues(), leafId, job);
  setQueues(next);
  if (runningUpload(next, leafId)?.id === job.id) void runPane(leafId);
}

// Triggers prepare in parallel but join the pane's queue in trigger order.
function queueInOrder(
  leafId: number,
  env: SshEnv,
  prepared: Promise<UploadRequest | null>,
): Promise<void> {
  const turn = (intake.get(leafId) ?? Promise.resolve())
    .then(() => prepared)
    .then(
      (req) => {
        if (req && paneOpen(leafId)) startUpload(leafId, env, req);
      },
      () => {},
    );
  intake.set(leafId, turn);
  void turn.then(() => {
    if (intake.get(leafId) === turn) intake.delete(leafId);
  });
  return turn;
}

// Joins the queue only once an image is staged, so an empty clipboard never
// shows the hint.
async function prepareClipboardImage(
  leafId: number,
  name: string,
): Promise<UploadRequest | null> {
  let staged: string | null;
  try {
    staged = await invoke<string | null>("fs_clipboard_image", { name });
  } catch (err) {
    deliver(leafId, uploadErrorOutcome(err, paneOpen(leafId)));
    return null;
  }
  if (staged === null) return null;
  return { files: [name], sources: [staged] };
}

export function uploadClipboardImage(
  leafId: number,
  env: SshEnv,
  now: Date = new Date(),
): Promise<void> {
  const name = clipboardImageName(now);
  return queueInOrder(leafId, env, prepareClipboardImage(leafId, name));
}

type StatResult = { size: number; kind: "file" | "dir" | "symlink" };

// A path that can't be stat'ed still goes to fs_copy, which reports why.
async function statDropped(path: string): Promise<DroppedItem> {
  try {
    const stat = await invoke<StatResult>("fs_stat", {
      path,
      workspace: { kind: "local" },
    });
    return { path, size: stat.size, isDir: stat.kind === "dir" };
  } catch {
    return { path, size: 0, isDir: false };
  }
}

async function prepareDrop(
  leafId: number,
  paths: string[],
): Promise<UploadRequest | null> {
  const items = await Promise.all(paths.map(statDropped));
  if (!paneOpen(leafId)) return null;
  const { upload, notices } = selectUploads(items);
  for (const notice of notices) toast.error(notice);
  if (upload.length === 0) return null;
  return { files: upload, sources: upload };
}

export function uploadDroppedFiles(
  leafId: number,
  env: SshEnv,
  paths: string[],
): Promise<void> {
  return queueInOrder(leafId, env, prepareDrop(leafId, paths));
}

// WebKit may hide image flavors from the paste event, so any paste without
// text is offered to fs_clipboard_image, which is the real image check.
export function interceptTerminalPaste(
  leafId: number,
  data: DataTransfer | null,
): boolean {
  const env = sshEnvOf(leafId);
  if (!env) return false;
  const text = data?.getData("text/plain") ?? "";
  if (pasteDecision(env, { hasImage: true, text }) !== "upload") return false;
  void uploadClipboardImage(leafId, env);
  return true;
}
