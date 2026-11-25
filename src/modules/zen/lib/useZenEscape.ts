import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  isOverlayOpen,
  isPlainEscape,
  shouldExitZenOnEscape,
  type ZenEscapeTab,
  zenEscapeArmed,
} from "./zenEscape";
import { useZenStore } from "./zenStore";

/** Native event of the macOS Esc monitor (Rust: zen_escape.rs). */
const ZEN_ESCAPE_EVENT = "terax:zen-escape";

/**
 * After the webview saw a plain Esc itself, a native event that arrives within
 * this window is the same key press; the DOM path has already decided it (for
 * example: that Esc closed a dialog, which is gone by the time the IPC event
 * lands).
 */
const SAME_PRESS_MS = 500;

function sendArm(armed: boolean): void {
  invoke("zen_escape_arm", { armed }).catch((err: unknown) => {
    console.warn("[zen] zen_escape_arm failed", { armed, err });
  });
}

/**
 * Esc leaves zen while the active tab shows a preview (HTML, Markdown, an
 * image or a PDF); in terminal and code tabs Esc stays with the program.
 *
 * Two paths, either is enough:
 * - DOM: a plain Esc reaching this document (focus outside an iframe). The
 *   listener runs in the window capture phase, before an overlay closes on the
 *   same key, so while one of the overlays in ESC_OVERLAY_SELECTORS is open (or
 *   focus is in the toast list) that Esc keeps zen on.
 * - Native (macOS only): with focus inside the HTML preview's iframe the
 *   document never sees the key, so the native monitor, armed only while
 *   `zenEscapeArmed`, sends `terax:zen-escape`. The event never comes on other
 *   platforms or while the Rust command is a stub; the DOM path still works.
 *
 * The only caller of `zen_escape_arm` and the only listener of
 * `terax:zen-escape`. Mount once, in App.
 */
export function useZenEscape(activeTab: ZenEscapeTab | undefined): void {
  const on = useZenStore((s) => s.on);
  const armed = zenEscapeArmed(on, activeTab);

  const activeTabRef = useRef(activeTab);
  useLayoutEffect(() => {
    activeTabRef.current = activeTab;
  });
  const lastDomEscapeRef = useRef(Number.NEGATIVE_INFINITY);

  // Arm while armed; disarm when that ends and on unmount.
  useEffect(() => {
    if (!armed) return;
    sendArm(true);
    return () => sendArm(false);
  }, [armed]);

  useEffect(() => {
    const exitIfPreview = () => {
      const zen = useZenStore.getState();
      if (
        shouldExitZenOnEscape(
          zen.on,
          activeTabRef.current,
          isOverlayOpen(document),
        )
      ) {
        zen.exitZen();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPlainEscape(e)) return;
      lastDomEscapeRef.current = performance.now();
      if (e.defaultPrevented) return;
      exitIfPreview();
    };
    window.addEventListener("keydown", onKeyDown, true);

    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<null>(ZEN_ESCAPE_EVENT, () => {
      if (performance.now() - lastDomEscapeRef.current < SAME_PRESS_MS) return;
      exitIfPreview();
    })
      .then((un) => {
        if (disposed) un();
        else unlisten = un;
      })
      .catch((err: unknown) => {
        console.warn(`[zen] could not listen to ${ZEN_ESCAPE_EVENT}`, err);
      });

    return () => {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown, true);
      unlisten?.();
    };
  }, []);
}
