import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { currentWorkspaceEnv } from "@/modules/workspace";

const FS_CHANGED_EVENT = "fs:changed";

type FsChangedPayload = { paths: string[] };

export function watchAdd(paths: string[]): void {
  if (paths.length === 0) return;
  void invoke("fs_watch_add", {
    paths,
    workspace: currentWorkspaceEnv(),
  }).catch(() => {});
}

export function watchRemove(paths: string[]): void {
  if (paths.length === 0) return;
  void invoke("fs_watch_remove", {
    paths,
    workspace: currentWorkspaceEnv(),
  }).catch(() => {});
}

export function listenFsChanged(
  handler: (paths: string[]) => void,
): Promise<() => void> {
  return getCurrentWebviewWindow().listen<FsChangedPayload>(
    FS_CHANGED_EVENT,
    (e) => handler(e.payload.paths),
  );
}
