import { invoke } from "@tauri-apps/api/core";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { currentWorkspaceEnv } from "@/modules/workspace";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { dirname, joinPath } from "./paths";
import { listenFsChanged, watchAdd, watchRemove } from "./watch";
import { createWatchRegistry, planVisibilityEdge } from "./watchRegistry";

export type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  gitignored: boolean;
};

// `gen` is the read a state came from, so a commit tells which waiters it frees.
type ChildrenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; entries: DirEntry[]; gen: number }
  | { status: "error"; message: string; gen: number };

type TreeState = Record<string, ChildrenState>;

// A refresh() or expand() waiting for a read at least as new as `gen` to show.
type Waiter = { gen: number; done: () => void };

function genOf(state: ChildrenState): number {
  return "gen" in state ? state.gen : 0;
}

function release(
  waiters: Map<string, Waiter[]>,
  path: string,
  gen: number,
): void {
  const list = waiters.get(path);
  if (!list) return;
  const rest = list.filter((w) => w.gen > gen);
  if (rest.length > 0) waiters.set(path, rest);
  else waiters.delete(path);
  for (const w of list) if (w.gen <= gen) w.done();
}

// `keepOnError`: a failing read leaves a loaded listing in place (a host that
// just dropped the connection), and the caller's toast says what went wrong.
export type RefreshOptions = { keepOnError?: boolean };

export type PendingCreate = {
  parentPath: string;
  kind: "file" | "dir";
};

const EXPANSION_CACHE_LIMIT = 8;
const expansionCache = new Map<string, string[]>();

function rememberExpansion(root: string, expanded: Set<string>): void {
  expansionCache.delete(root);
  if (expanded.size > 0) expansionCache.set(root, [...expanded]);
  while (expansionCache.size > EXPANSION_CACHE_LIMIT) {
    const oldest = expansionCache.keys().next().value;
    if (oldest === undefined) break;
    expansionCache.delete(oldest);
  }
}

function recallExpansion(root: string): string[] {
  const v = expansionCache.get(root);
  if (!v) return [];
  expansionCache.delete(root);
  expansionCache.set(root, v);
  return v;
}

function isUnder(key: string, root: string): boolean {
  return key === root || key.startsWith(`${root}/`);
}

// mtime/size are ignored on purpose: the tree never renders them, so a watcher
// refetch that only bumps mtime (saving a file) must not count as a change.
function sameDirListing(a: DirEntry[], b: DirEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].name !== b[i].name ||
      a[i].kind !== b[i].kind ||
      a[i].gitignored !== b[i].gitignored
    )
      return false;
  }
  return true;
}

type Options = {
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  /**
   * Default true. While false the tree holds no native watchers and ignores
   * `fs:changed`; showing it re-registers them and reloads every loaded folder.
   */
  visible?: boolean;
};

export function useFileTree(rootPath: string | null, options?: Options) {
  const showHidden = usePreferencesStore((s) => s.showHidden);
  const showHiddenRef = useRef(showHidden);
  const gitDecorations = usePreferencesStore((s) => s.explorerGitDecorations);
  const gitDecorationsRef = useRef(gitDecorations);
  const [nodes, setNodes] = useState<TreeState>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(
    null,
  );
  const [renaming, setRenaming] = useState<string | null>(null);

  const visible = options?.visible ?? true;
  const visibleRef = useRef(visible);
  const staleRef = useRef(false);
  const rootPathRef = useRef(rootPath);
  const [watches] = useState(() =>
    createWatchRegistry({ add: watchAdd, remove: watchRemove }, visible),
  );
  const expandedRef = useRef(expanded);
  const nodesRef = useRef(nodes);
  // Reads of one folder can finish out of order: one lands unless a newer one
  // already did, so a folder under steady change still updates.
  const readCountRef = useRef(0);
  const landedRef = useRef(new Map<string, number>());
  // The newest landed state per folder, which may not have rendered yet.
  const latestRef = useRef(new Map<string, ChildrenState>());
  // Reads started before the last root change never land.
  const floorRef = useRef(0);
  const waitersRef = useRef(new Map<string, Waiter[]>());

  useEffect(() => {
    showHiddenRef.current = showHidden;
  }, [showHidden]);

  useEffect(() => {
    gitDecorationsRef.current = gitDecorations;
  }, [gitDecorations]);

  useLayoutEffect(() => {
    visibleRef.current = visible;
    rootPathRef.current = rootPath;
  }, [visible, rootPath]);

  useLayoutEffect(() => {
    expandedRef.current = expanded;
  }, [expanded]);

  useLayoutEffect(() => {
    nodesRef.current = nodes;
    for (const [path] of waitersRef.current) {
      const shown = nodes[path];
      if (shown) release(waitersRef.current, path, genOf(shown));
    }
  }, [nodes]);

  const addWatch = watches.add;
  const removeWatch = watches.remove;

  const readChildren = useCallback(
    async (path: string, gen: number, keepOnError = false) => {
      const landed = landedRef.current;
      const lands = () => {
        if (gen <= Math.max(floorRef.current, landed.get(path) ?? 0))
          return false;
        landed.set(path, gen);
        return true;
      };
      if (nodesRef.current[path]?.status !== "loaded") {
        setNodes((s) => ({ ...s, [path]: { status: "loading" } }));
      }
      try {
        const entries = await invoke<DirEntry[]>("fs_read_dir", {
          path,
          showHidden: showHiddenRef.current,
          gitDecorations: gitDecorationsRef.current,
          workspace: currentWorkspaceEnv(),
        });
        if (!lands()) return;

        // Only a listing that is on screen and not about to be replaced by a
        // queued older one may stand in for this read.
        const prev = nodesRef.current[path];
        if (
          prev?.status === "loaded" &&
          latestRef.current.get(path) === prev &&
          sameDirListing(prev.entries, entries)
        ) {
          release(waitersRef.current, path, gen);
          return;
        }

        const liveDirs = new Set(
          entries
            .filter((e) => e.kind === "dir")
            .map((e) => joinPath(path, e.name)),
        );
        const removedRoots: string[] = [];
        for (const key of Object.keys(nodesRef.current)) {
          if (dirname(key) === path && !liveDirs.has(key))
            removedRoots.push(key);
        }
        const dead = new Set<string>();
        if (removedRoots.length > 0) {
          const candidates = new Set<string>([
            ...Object.keys(nodesRef.current),
            ...expandedRef.current,
            ...watches.paths(),
          ]);
          for (const k of candidates) {
            if (removedRoots.some((r) => isUnder(k, r))) dead.add(k);
          }
        }

        const node: ChildrenState = { status: "loaded", entries, gen };
        latestRef.current.set(path, node);
        setNodes((s) => {
          const next: TreeState = {};
          for (const [k, v] of Object.entries(s)) if (!dead.has(k)) next[k] = v;
          next[path] = node;
          return next;
        });

        if (dead.size > 0) {
          setExpanded((c) => {
            let changed = false;
            const n = new Set(c);
            for (const d of dead) if (n.delete(d)) changed = true;
            return changed ? n : c;
          });
          for (const d of dead) {
            // A removed folder's late answer must not bring it back.
            landed.set(d, readCountRef.current);
            latestRef.current.delete(d);
            release(waitersRef.current, d, Number.POSITIVE_INFINITY);
          }
          watches.removeMany([...dead]);
        }
      } catch (e) {
        if (!lands()) return;
        if (keepOnError && latestRef.current.get(path)?.status === "loaded") {
          release(waitersRef.current, path, gen);
          return;
        }
        const node: ChildrenState = {
          status: "error",
          message: String(e),
          gen,
        };
        latestRef.current.set(path, node);
        setNodes((s) => ({ ...s, [path]: node }));
      }
    },
    [watches],
  );

  const fetchChildren = useCallback(
    (path: string): Promise<void> => readChildren(path, ++readCountRef.current),
    [readChildren],
  );

  // Settles once this read, or a newer one, shows in the rendered tree.
  const refresh = useCallback(
    (path: string, options?: RefreshOptions): Promise<void> => {
      const gen = ++readCountRef.current;
      const shown = new Promise<void>((done) => {
        const list = waitersRef.current.get(path) ?? [];
        list.push({ gen, done });
        waitersRef.current.set(path, list);
      });
      void readChildren(path, gen, options?.keepOnError);
      return shown;
    },
    [readChildren],
  );

  // Root change → restore the cached expansion for this root, re-scope watches,
  // and persist the outgoing root's expansion on the way out.
  useEffect(() => {
    landedRef.current.clear();
    latestRef.current.clear();
    floorRef.current = readCountRef.current;
    if (!rootPath) {
      setNodes({});
      setExpanded(new Set());
      setPendingCreate(null);
      setRenaming(null);
      return;
    }
    setPendingCreate(null);
    setRenaming(null);

    const restored = recallExpansion(rootPath);
    setExpanded(new Set(restored));
    setNodes({});
    // Sync the ref synchronously: nodesRef only updates after the next render,
    // so without this a fast (cached) fetchChildren below would read the stale
    // pre-clear "loaded" node, hit the sameDirListing early-return, and skip
    // re-populating — leaving a valid root with an empty tree when rootPath
    // changes rapidly (e.g. switching folders in quick succession).
    nodesRef.current = {};

    watches.addMany([rootPath, ...restored]);
    if (visibleRef.current) {
      void fetchChildren(rootPath);
      for (const d of restored) void fetchChildren(d);
    } else {
      staleRef.current = true;
    }

    return () => {
      rememberExpansion(rootPath, expandedRef.current);
      const waiters = waitersRef.current;
      for (const path of [...waiters.keys()]) {
        release(waiters, path, Number.POSITIVE_INFINITY);
      }
      watches.clear();
    };
  }, [rootPath, fetchChildren, watches]);

  useEffect(() => {
    const plan = planVisibilityEdge({
      visible,
      stale: staleRef.current,
      hasRoot: rootPathRef.current !== null,
    });
    staleRef.current = plan.stale;
    if (plan.arm) watches.arm();
    else watches.disarm();
    if (!plan.resync) return;
    // Root and expanded folders only; a collapsed cached one is read on expand.
    for (const path of watches.paths()) void fetchChildren(path);
  }, [visible, watches, fetchChildren]);

  useEffect(() => {
    // The show edge above reloads whatever changed while nobody listened.
    if (!visible) return;
    let alive = true;
    let unlisten: (() => void) | undefined;
    void listenFsChanged((paths) => {
      const current = nodesRef.current;
      const dirs = new Set<string>();
      for (const p of paths) {
        const parent = dirname(p);
        if (current[parent]?.status === "loaded") dirs.add(parent);
        if (current[p]?.status === "loaded") dirs.add(p);
      }
      for (const d of dirs) void fetchChildren(d);
    }).then((un) => {
      if (alive) unlisten = un;
      else un();
    });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [visible, fetchChildren]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-list loaded directories only when visibility/git-decoration/root prefs change; the tree is read from the ref, which the root change above has already cleared, so no folder of an old root is read again.
  useEffect(() => {
    if (!rootPath) return;
    if (!visibleRef.current) {
      staleRef.current = true;
      return;
    }
    const loadedPaths = Object.entries(nodesRef.current)
      .filter(([, state]) => state.status === "loaded")
      .map(([path]) => path);
    for (const path of loadedPaths) void fetchChildren(path);
  }, [showHidden, gitDecorations, rootPath, fetchChildren]);

  const toggle = useCallback(
    (path: string) => {
      if (expandedRef.current.has(path)) {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.delete(path);
          return next;
        });
        removeWatch(path);
      } else {
        setExpanded((curr) => {
          const next = new Set(curr);
          next.add(path);
          return next;
        });
        addWatch(path);
        void fetchChildren(path);
      }
    },
    [fetchChildren, addWatch, removeWatch],
  );

  const expand = useCallback(
    (path: string): Promise<void> => {
      if (expandedRef.current.has(path)) return Promise.resolve();
      setExpanded((curr) => {
        const next = new Set(curr);
        next.add(path);
        return next;
      });
      addWatch(path);
      return refresh(path);
    },
    [refresh, addWatch],
  );

  const isExpanded = useCallback(
    (dir: string) => expandedRef.current.has(dir),
    [],
  );

  // --- mutations ---

  const beginCreate = useCallback(
    (parentPath: string, kind: "file" | "dir") => {
      setRenaming(null);
      setPendingCreate({ parentPath, kind });
      // Ensure the parent is expanded so the input row is visible.
      if (rootPath && parentPath !== rootPath) {
        setExpanded((curr) => {
          if (curr.has(parentPath)) return curr;
          const next = new Set(curr);
          next.add(parentPath);
          return next;
        });
        addWatch(parentPath);
      }
      setNodes((curr) => {
        if (!curr[parentPath]) void fetchChildren(parentPath);
        return curr;
      });
    },
    [rootPath, fetchChildren, addWatch],
  );

  const cancelCreate = useCallback(() => setPendingCreate(null), []);

  const commitCreate = useCallback(
    async (name: string) => {
      if (!pendingCreate) return;
      const trimmed = name.trim();
      if (!trimmed) {
        setPendingCreate(null);
        return;
      }
      const path = joinPath(pendingCreate.parentPath, trimmed);
      const cmd =
        pendingCreate.kind === "dir" ? "fs_create_dir" : "fs_create_file";
      try {
        await invoke(cmd, { path, workspace: currentWorkspaceEnv() });
        await refresh(pendingCreate.parentPath);
      } catch (e) {
        console.error(`${cmd} failed:`, e);
        toast.error(
          `Couldn’t create ${pendingCreate.kind === "dir" ? "folder" : "file"} “${trimmed}”: ${String(e)}`,
        );
      } finally {
        setPendingCreate(null);
      }
    },
    [pendingCreate, refresh],
  );

  const beginRename = useCallback((path: string) => {
    setPendingCreate(null);
    setRenaming(path);
  }, []);

  const cancelRename = useCallback(() => setRenaming(null), []);

  const commitRename = useCallback(
    async (newName: string) => {
      if (!renaming) return;
      const trimmed = newName.trim();
      const parent = dirname(renaming);
      const oldName = renaming.slice(parent === "/" ? 1 : parent.length + 1);
      if (!trimmed || trimmed === oldName) {
        setRenaming(null);
        return;
      }
      const to = joinPath(parent, trimmed);
      try {
        await invoke("fs_rename", {
          from: renaming,
          to,
          workspace: currentWorkspaceEnv(),
        });
        options?.onPathRenamed?.(renaming, to);
        await refresh(parent);
      } catch (e) {
        console.error("fs_rename failed:", e);
        toast.error(`Couldn’t rename to “${trimmed}”: ${String(e)}`);
      } finally {
        setRenaming(null);
      }
    },
    [renaming, refresh, options],
  );

  const deletePath = useCallback(
    async (path: string) => {
      try {
        await invoke("fs_delete", { path, workspace: currentWorkspaceEnv() });
        options?.onPathDeleted?.(path);
        await refresh(dirname(path));
      } catch (e) {
        console.error("fs_delete failed:", e);
        toast.error(
          `Couldn’t delete “${path.slice(path.lastIndexOf("/") + 1)}”: ${String(e)}`,
        );
      }
    },
    [refresh, options],
  );

  const movePath = useCallback(
    async (from: string, toDir: string) => {
      const name = from.slice(from.lastIndexOf("/") + 1);
      const to = joinPath(toDir, name);
      if (to === from) return;
      const target = nodesRef.current[toDir];
      if (
        target?.status === "loaded" &&
        target.entries.some((e) => e.name === name)
      ) {
        console.warn(`move skipped: "${name}" already exists in ${toDir}`);
        return;
      }
      try {
        await invoke("fs_rename", {
          from,
          to,
          workspace: currentWorkspaceEnv(),
        });
        options?.onPathRenamed?.(from, to);
        await Promise.all([refresh(dirname(from)), refresh(toDir)]);
      } catch (e) {
        console.error("fs_rename (move) failed:", e);
        toast.error(`Couldn’t move “${name}”: ${String(e)}`);
      }
    },
    [refresh, options],
  );

  return {
    nodes,
    expanded,
    pendingCreate,
    renaming,
    toggle,
    expand,
    refresh,
    isExpanded,
    beginCreate,
    cancelCreate,
    commitCreate,
    beginRename,
    cancelRename,
    commitRename,
    deletePath,
    movePath,
    joinPath,
  };
}
