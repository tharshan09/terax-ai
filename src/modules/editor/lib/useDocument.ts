import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

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
  // returned disk mtime as the new conflict baseline — no follow-up stat.
  const writeToDisk = useCallback(async () => {
    const content = bufferRef.current;
    let mtime: number;
    try {
      mtime = await invoke<number>("fs_write_file", {
        path,
        content: restoreEol(content, eolRef.current),
        workspace: workspace ?? currentWorkspaceEnv(),
        source: "editor",
        // Explicit user save: allow the editor to persist a file the user
        // opened by name, even a secret like `.env`.
        trusted: true,
      });
    } catch (e) {
      // Surface the failure and keep the buffer dirty — savedRef/setDirty below
      // are skipped, so the unsaved edits are preserved. Remote saves in
      // particular can fail (permission denied, dropped connection) and must
      // never be swallowed. Re-throw so callers don't signal a successful save.
      const name = path.split(/[\\/]/).pop() || path;
      toast.error(`Couldn’t save ${name}: ${String(e)}`);
      throw e;
    }
    diskMtimeRef.current = mtime;
    savedRef.current = content;
    // Edits typed while the write was in flight must stay dirty.
    setDirty(bufferRef.current !== content);
  }, [path, workspace]);

  // Resolves false when the write was withheld because the file changed on disk
  // since load; overwriting is then an explicit user action from the toast.
  const saveNow = useCallback(async (): Promise<boolean> => {
    const known = diskMtimeRef.current;
    if (known !== null) {
      const stat = await invoke<FileStat>("fs_stat", {
        path,
        workspace: workspace ?? currentWorkspaceEnv(),
      }).catch(() => null);
      if (stat && stat.mtime !== known) {
        const name = path.split(/[\\/]/).pop() ?? path;
        toast.warning("File changed on disk", {
          id: `save-conflict:${path}`,
          description: `${name} was modified by another program while you had unsaved changes. Overwrite to keep your version.`,
          action: { label: "Overwrite", onClick: () => void writeToDisk() },
        });
        return false;
      }
    }
    await writeToDisk();
    return true;
  }, [path, workspace, writeToDisk]);

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

  const readFromDisk = useCallback(
    () =>
      invoke<ReadResult>("fs_read_file", {
        path,
        workspace: workspace ?? currentWorkspaceEnv(),
        // Explicit user open in the editor: allow reading a file named by name,
        // even a secret. The terminal Cmd+Click path stays untrusted.
        trusted: true,
      }),
    [path, workspace],
  );

  // Load on path change (or workspace change → new readFromDisk identity).
  useEffect(() => {
    let cancelled = false;
    setDoc({ status: "loading" });
    setDirty(false);

    readFromDisk()
      .then((res) => {
        if (!cancelled) adoptRead(res);
      })
      .catch((e) => {
        if (!cancelled) setDoc({ status: "error", message: String(e) });
      });

    return () => {
      cancelled = true;
    };
  }, [readFromDisk, adoptRead]);

  // Skipped while dirty: never clobber unsaved edits. Re-checked when the read
  // resolves, since typing can start while the read is in flight.
  const reload = useCallback((): boolean => {
    if (dirtyRef.current) return false;
    void readFromDisk()
      .then((res) => {
        if (!dirtyRef.current) adoptRead(res, true);
      })
      // Transient failures (e.g. ENOENT mid atomic-rename) must not replace a
      // healthy buffer with an error screen.
      .catch((e) => console.warn("[editor] reload failed", path, e));
    return true;
  }, [readFromDisk, adoptRead, path]);

  const save = useCallback(async (): Promise<boolean> => {
    clearAutoSaveTimer();
    if (bufferRef.current === savedRef.current) return true;
    return saveNow();
  }, [clearAutoSaveTimer, saveNow]);

  const onChange = useCallback(
    (next: string) => {
      bufferRef.current = next;
      const isDirty = next !== savedRef.current;
      setDirty(isDirty);

      clearAutoSaveTimer();

      const { autoSave: active, autoSaveDelay: delay } = autoSaveRef.current;
      if (active && isDirty) {
        timeoutRef.current = setTimeout(() => {
          saveNow().catch((e) => console.error("[autosave]", e));
        }, delay);
      }
    },
    [clearAutoSaveTimer, saveNow],
  );

  useEffect(() => clearAutoSaveTimer, [path, clearAutoSaveTimer]);

  return { doc, dirty, onChange, save, reload };
}
