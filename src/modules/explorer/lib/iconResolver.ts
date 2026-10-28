// Startup-safe face of the file icons: the set in `iconEngine.ts` is fetched on
// first demand, so a window that never draws a file icon pays nothing for it.
import type { IconEngine } from "./iconEngine";

let engine: IconEngine | null = null;
let loading: Promise<void> | null = null;
let failureReported = false;
const listeners = new Set<() => void>();

/** Starts loading the icon set once; resolves (also on failure) when settled. */
export function preloadFileIcons(): Promise<void> {
  if (engine) return Promise.resolve();
  loading ??= import("./iconEngine").then(
    (mod) => {
      engine = mod.iconEngine;
      loading = null;
      for (const listener of [...listeners]) listener();
    },
    (error: unknown) => {
      // Not cached: the next demand retries. Logged once so a broken chunk
      // cannot flood the console from every icon that mounts afterwards.
      loading = null;
      if (failureReported) return;
      failureReported = true;
      console.error("[terax] file icons failed to load:", error);
    },
  );
  return loading;
}

/**
 * `useSyncExternalStore` subscription; subscribing is what requests the set, so
 * the fetch starts in the commit phase, never during render.
 */
export function subscribeFileIcons(listener: () => void): () => void {
  if (engine) return noop;
  listeners.add(listener);
  void preloadFileIcons();
  return () => {
    listeners.delete(listener);
  };
}

function noop(): void {}

/** "" until the icon set has loaded. */
export function peekFileIconUrl(name: string): string {
  return engine ? engine.fileIconUrl(name) : "";
}

/** "" until the icon set has loaded. */
export function peekFolderIconUrl(name: string, expanded: boolean): string {
  return engine ? engine.folderIconUrl(name, expanded) : "";
}
