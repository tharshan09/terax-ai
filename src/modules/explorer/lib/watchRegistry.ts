// The explorer's wanted folder set, kept apart from what is registered with the
// native watcher, so a hidden explorer holds no OS handles and wakes no webview.

export type WatchIo = {
  add: (paths: string[]) => void;
  remove: (paths: string[]) => void;
};

export type WatchRegistry = {
  add: (path: string) => void;
  addMany: (paths: readonly string[]) => void;
  remove: (path: string) => void;
  removeMany: (paths: readonly string[]) => void;
  has: (path: string) => boolean;
  paths: () => string[];
  /** Registers the whole wanted set natively. Idempotent. */
  arm: () => void;
  /** Releases everything natively but keeps the wanted set. Idempotent. */
  disarm: () => void;
  /** Releases everything and forgets the wanted set. */
  clear: () => void;
  readonly armed: boolean;
};

export function createWatchRegistry(io: WatchIo, armed = true): WatchRegistry {
  const desired = new Set<string>();
  let isArmed = armed;

  return {
    add(path) {
      if (desired.has(path)) return;
      desired.add(path);
      if (isArmed) io.add([path]);
    },
    addMany(paths) {
      const fresh = paths.filter((p) => !desired.has(p));
      for (const p of fresh) desired.add(p);
      if (isArmed && fresh.length > 0) io.add(fresh);
    },
    remove(path) {
      if (!desired.delete(path)) return;
      if (isArmed) io.remove([path]);
    },
    removeMany(paths) {
      const gone = paths.filter((p) => desired.delete(p));
      if (isArmed && gone.length > 0) io.remove(gone);
    },
    has: (path) => desired.has(path),
    paths: () => [...desired],
    arm() {
      if (isArmed) return;
      isArmed = true;
      if (desired.size > 0) io.add([...desired]);
    },
    disarm() {
      if (!isArmed) return;
      isArmed = false;
      if (desired.size > 0) io.remove([...desired]);
    },
    clear() {
      if (isArmed && desired.size > 0) io.remove([...desired]);
      desired.clear();
    },
    get armed() {
      return isArmed;
    },
  };
}

export type VisibilityEdgePlan = {
  arm: boolean;
  /** Re-read the root and the expanded folders once. */
  resync: boolean;
  /** Loaded data may predate changes nobody was watching for. */
  stale: boolean;
};

export function planVisibilityEdge(input: {
  visible: boolean;
  stale: boolean;
  hasRoot: boolean;
}): VisibilityEdgePlan {
  if (!input.visible) return { arm: false, resync: false, stale: true };
  return { arm: true, resync: input.stale && input.hasRoot, stale: false };
}
