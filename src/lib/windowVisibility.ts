import { useSyncExternalStore } from "react";

// Hidden means minimized, fully occluded or on another Space. Focus is
// deliberately not part of it: an unfocused window next to a browser is still
// watched.
export const WINDOW_HIDDEN_ATTR = "data-window-hidden";

type Listener = (hidden: boolean) => void;

const listeners = new Set<Listener>();
let installed = false;
let hidden = false;

function readDocumentHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

function applyAttribute(next: boolean): void {
  const root = document.documentElement;
  if (next) root.setAttribute(WINDOW_HIDDEN_ATTR, "");
  else root.removeAttribute(WINDOW_HIDDEN_ATTR);
}

// Listeners run inside the event dispatch so the space persistence can still
// write synchronously while the window goes away.
function sync(): void {
  const next = readDocumentHidden();
  if (next === hidden) return;
  hidden = next;
  applyAttribute(next);
  for (const listener of [...listeners]) {
    try {
      listener(next);
    } catch (e) {
      console.error("[terax] window visibility listener failed:", e);
    }
  }
}

/** Idempotent; the first subscription installs it too. */
export function installWindowVisibility(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  hidden = readDocumentHidden();
  applyAttribute(hidden);
  document.addEventListener("visibilitychange", sync);
}

export function isWindowHidden(): boolean {
  return installed ? hidden : readDocumentHidden();
}

/** Notified on every change, not with the current state. */
export function subscribeWindowHidden(listener: Listener): () => void {
  installWindowVisibility();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWindowHidden(): boolean {
  return useSyncExternalStore(
    subscribeWindowHidden,
    isWindowHidden,
    isWindowHidden,
  );
}
