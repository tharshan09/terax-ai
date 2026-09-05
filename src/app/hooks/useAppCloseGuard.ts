import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { Tab } from "@/modules/tabs";
import { leafHasForegroundProcess, leafIds } from "@/modules/terminal";

async function anyTerminalBusy(tabs: Tab[]): Promise<boolean> {
  const leaves = tabs.flatMap((t) =>
    t.kind === "terminal" ? leafIds(t.paneTree) : [],
  );
  if (leaves.length === 0) return false;
  const checks = await Promise.all(leaves.map(leafHasForegroundProcess));
  return checks.some(Boolean);
}

export type AppCloseBlocker = {
  dirtyEditors: number;
  busyTerminal: boolean;
};

export function useAppCloseGuard(tabsRef: RefObject<Tab[]>) {
  const [pendingAppClose, setPendingAppClose] =
    useState<AppCloseBlocker | null>(null);
  const forceClose = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (forceClose.current) return;
        event.preventDefault();
        const busyTerminal = await anyTerminalBusy(tabsRef.current);
        // Count after the await so edits made during the IPC check are seen.
        const dirtyEditors = tabsRef.current.filter(
          (t) => t.kind === "editor" && t.dirty,
        ).length;
        if (dirtyEditors > 0 || busyTerminal) {
          setPendingAppClose({ dirtyEditors, busyTerminal });
        } else {
          forceClose.current = true;
          void getCurrentWindow().close();
        }
      })
      .then((un) => {
        if (disposed) un();
        else unlisten = un;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [tabsRef]);

  const confirmAppClose = useCallback(() => {
    setPendingAppClose(null);
    forceClose.current = true;
    void getCurrentWindow().close();
  }, []);

  const cancelAppClose = useCallback(() => {
    setPendingAppClose(null);
    // Radix runs the action button's onClick and then closes the dialog, so
    // "Quit Anyway" lands here right after confirming. Declining then would
    // tell macOS to cancel a quit the user just agreed to, which during a
    // logout aborts the logout.
    if (forceClose.current) return;
    // A Dock quit, `osascript` quit or logout defers to this answer, and the
    // Settings window was hidden to uncover the dialog.
    void invoke("app_close_declined").catch(() => {});
  }, []);

  return { pendingAppClose, confirmAppClose, cancelAppClose };
}
