import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { basename } from "@/lib/utils";
import type { ReadResult } from "@/modules/ai/lib/native";
import { currentWorkspaceEnv, type WorkspaceEnv } from "@/modules/workspace";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { detectEol, type Eol, normalizeToLf, restoreEol } from "./eol";

type FileStat = { size: number; mtime: number; kind: string };

export type DocumentState =
  | { status: "loading" }
  | { status: "ready"; content: string; size: number }
  | { status: "binary"; size: number }
  | { status: "toolarge"; size: number; limit: number }
  | { status: "error"; message: string };

type Options = {
  path: string;
  /** Execution env the file lives in (e.g. an SSH host). Falls back to the
   *  ambient env. Passed by the editor tab so a remote file is read/written
   *  remotely even when the ambient env has moved on. */
  workspace?: WorkspaceEnv;
  onDirtyChange?: (dirty: boolean) => void;
};

// One per loaded file: a hung write of the previous file never holds up or
// race-checks the saves and reloads of the next one.
type DocTarget = {
  path: string;
  workspace?: WorkspaceEnv;
  // One save at a time: a later one waits, so its conflict check compares
  // against the mtime of our own write instead of reporting it as a conflict.
  queue: Promise<unknown>;
  // Bumped as each write starts and ends, so odd while one runs.
  writeGen: number;
  rereadPending: boolean;
};

function newTarget(path: string, workspace?: WorkspaceEnv): DocTarget {
  return {
    path,
    workspace,
    queue: Promise.resolve(),
    writeGen: 0,
    rereadPending: false,
  };
}

function isWriting(target: DocTarget): boolean {
  return target.writeGen % 2 === 1;
}

const SLOW_SAVE_HINT_MS = 5_000;

// No timeout: a second write beside a hung one could land in either order.
function afterPrevious(
  previous: Promise<unknown>,
  path: string,
): Promise<void> {
  const id = `save-wait:${path}`;
  let hinted = false;
  const hint = setTimeout(() => {
    hinted = true;
    toast.message("Waiting for the previous save to finish", { id });
  }, SLOW_SAVE_HINT_MS);
  return previous.then(() => {
    clearTimeout(hint);
    if (hinted) toast.dismiss(id);
  });
}

function enqueue<T>(target: DocTarget, task: () => Promise<T>): Promise<T> {
  const run = afterPrevious(target.queue, target.path).then(task);
  target.queue = run.catch(() => {});
  return run;
}

function notSaved(target: DocTarget): false {
  toast.error(`Not saved: ${basename(target.path)} was moved or closed`);
  return false;
}

function readFromDisk({ path, workspace }: DocTarget) {
  return invoke<ReadResult>("fs_read_file", {
    path,
    workspace: workspace ?? currentWorkspaceEnv(),
    // Explicit user open in the editor: allow reading a file named by name,
    // even a secret. The terminal Cmd+Click path stays untrusted.
    trusted: true,
  });
}

export function useDocument({ path, workspace, onDirtyChange }: Options) {
  const [doc, setDoc] = useState<DocumentState>({ status: "loading" });
  const [dirty, setDirty] = useState(false);

  const autoSave = usePreferencesStore((s) => s.editorAutoSave);
  const autoSaveDelay = usePreferencesStore((s) => s.editorAutoSaveDelay);

  // Track the saved buffer so we can detect changes cheaply.
  const savedRef = useRef<string>("");
  const bufferRef = useRef<string>("");
  // Original line ending of the loaded file, restored on save so a CRLF file
  // never silently becomes LF.
  const eolRef = useRef<Eol>("\n");
  // Disk mtime at the last read/write — the save-conflict baseline. null until
  // the first successful read.
  const diskMtimeRef = useRef<number | null>(null);
  // The file the refs above describe; replaced on load so a save that started
  // for the previous file never writes into or updates the next one.
  const targetRef = useRef<DocTarget>(newTarget(path, workspace));

  const autoSaveRef = useRef({ autoSave, autoSaveDelay });
  autoSaveRef.current = { autoSave, autoSaveDelay };

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoSaveTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Persist the buffer (restoring the file's original EOL) and adopt the
  // returned disk mtime as the new conflict baseline, with no follow-up stat.
  const writeToDisk = useCallback(async (target: DocTarget) => {
    if (targetRef.current !== target) return notSaved(target);
    const content = bufferRef.current;
    let mtime: number;
    target.writeGen += 1;
    try {
      mtime = await invoke<number>("fs_write_file", {
        path: target.path,
        content: restoreEol(content, eolRef.current),
        workspace: target.workspace ?? currentWorkspaceEnv(),
        source: "editor",
        // Explicit user save: allow the editor to persist a file the user
        // opened by name, even a secret like `.env`.
        trusted: true,
      });
    } catch (e) {
      // Surface the failure and keep the buffer dirty: savedRef/setDirty below
      // are skipped, so the unsaved edits are preserved. Remote saves in
      // particular can fail (permission denied, dropped connection) and must
      // never be swallowed. Re-throw so callers don't signal a successful save.
      toast.error(`Couldn’t save ${basename(target.path)}: ${String(e)}`);
      throw e;
    } finally {
      target.writeGen += 1;
    }
    // Written to the path it was saved for; the editor has since left it.
    if (targetRef.current !== target) return true;
    diskMtimeRef.current = mtime;
    savedRef.current = content;
    // Edits typed while the write was in flight must stay dirty.
    setDirty(bufferRef.current !== content);
    return true;
  }, []);

  // Resolves false when the write was withheld: the editor left the file, or it
  // changed on disk since load and overwriting is an explicit toast action.
  const saveIfChanged = useCallback(
    async (target: DocTarget): Promise<boolean> => {
      if (targetRef.current !== target) return notSaved(target);
      if (bufferRef.current === savedRef.current) return true;
      const known = diskMtimeRef.current;
      if (known !== null) {
        const stat = await invoke<FileStat>("fs_stat", {
          path: target.path,
          workspace: target.workspace ?? currentWorkspaceEnv(),
        }).catch(() => null);
        if (targetRef.current !== target) return notSaved(target);
        if (stat && stat.mtime !== known) {
          toast.warning("File changed on disk", {
            id: `save-conflict:${target.path}`,
            description: `${basename(target.path)} was modified by another program while you had unsaved changes. Overwrite to keep your version.`,
            action: {
              label: "Overwrite",
              onClick: () =>
                void enqueue(target, () => writeToDisk(target)).catch(() => {}),
            },
          });
          return false;
        }
      }
      return writeToDisk(target);
    },
    [writeToDisk],
  );

  const queueSave = useCallback((): Promise<boolean> => {
    const target = targetRef.current;
    return enqueue(target, () => saveIfChanged(target));
  }, [saveIfChanged]);

  // Notify parent of dirty transitions.
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

  // Adopts a read result as the new saved baseline. `skipIfUnchanged` avoids
  // the re-render when disk already matches the buffer (self-save / duplicate
  // watcher event); initial loads must always publish a state.
  const adoptRead = useCallback((res: ReadResult, skipIfUnchanged = false) => {
    if (res.kind === "text") {
      eolRef.current = detectEol(res.content);
      diskMtimeRef.current = res.mtime;
      const content = normalizeToLf(res.content);
      if (skipIfUnchanged && content === savedRef.current) return;
      savedRef.current = content;
      bufferRef.current = content;
      setDirty(false);
      setDoc({ status: "ready", content, size: res.size });
    } else if (res.kind === "binary") {
      setDoc({ status: "binary", size: res.size });
    } else if (res.kind === "toolarge") {
      setDoc({ status: "toolarge", size: res.size, limit: res.limit });
    }
  }, []);

  // Load on path or workspace change.
  useEffect(() => {
    let cancelled = false;
    const target = newTarget(path, workspace);
    targetRef.current = target;
    savedRef.current = "";
    bufferRef.current = "";
    eolRef.current = "\n";
    diskMtimeRef.current = null;
    setDoc({ status: "loading" });
    setDirty(false);

    readFromDisk(target)
      .then((res) => {
        if (!cancelled) adoptRead(res);
      })
      .catch((e) => {
        if (!cancelled) setDoc({ status: "error", message: String(e) });
      });

    return () => {
      cancelled = true;
    };
  }, [path, workspace, adoptRead]);

  // Skipped while dirty: never clobber unsaved edits. Re-checked when the read
  // resolves, since typing or a path change can happen while it is in flight.
  // Reads the refs, as `dirty` lags a render behind a finished write.
  const reload = useCallback(
    function reload(): boolean {
      const clean = () => bufferRef.current === savedRef.current;
      if (!clean()) return false;
      const target = targetRef.current;
      const writeGen = target.writeGen;
      void readFromDisk(target)
        .then((res) => {
          if (targetRef.current !== target) return;
          if (target.writeGen === writeGen && !isWriting(target)) {
            if (clean()) adoptRead(res, true);
            return;
          }
          // The read may predate our own write: read once more after it ends.
          if (target.rereadPending) return;
          target.rereadPending = true;
          void target.queue.then(() => {
            target.rereadPending = false;
            if (targetRef.current === target) reload();
          });
        })
        // Transient failures (e.g. ENOENT mid atomic-rename) must not replace a
        // healthy buffer with an error screen.
        .catch((e) => console.warn("[editor] reload failed", target.path, e));
      return true;
    },
    [adoptRead],
  );

  const save = useCallback(async (): Promise<boolean> => {
    clearAutoSaveTimer();
    return queueSave();
  }, [clearAutoSaveTimer, queueSave]);

  const onChange = useCallback(
    (next: string) => {
      bufferRef.current = next;
      const isDirty = next !== savedRef.current;
      setDirty(isDirty);

      clearAutoSaveTimer();

      const { autoSave: active, autoSaveDelay: delay } = autoSaveRef.current;
      if (active && isDirty) {
        timeoutRef.current = setTimeout(() => {
          queueSave().catch((e) => console.error("[autosave]", e));
        }, delay);
      }
    },
    [clearAutoSaveTimer, queueSave],
  );

  useEffect(() => clearAutoSaveTimer, [path, clearAutoSaveTimer]);

  return { doc, dirty, onChange, save, reload };
}
