export type PaneId = number;

export type SplitDir = "row" | "col";

export type PaneNode =
  | { kind: "leaf"; id: PaneId; cwd?: string; tmuxSession?: string }
  | {
      kind: "split";
      id: PaneId;
      dir: SplitDir;
      children: PaneNode[];
    };

export function isLeaf(n: PaneNode): n is Extract<PaneNode, { kind: "leaf" }> {
  return n.kind === "leaf";
}

export function leafIds(n: PaneNode): PaneId[] {
  if (isLeaf(n)) return [n.id];
  return n.children.flatMap(leafIds);
}

export function findLeafCwd(n: PaneNode, id: PaneId): string | undefined {
  if (isLeaf(n)) return n.id === id ? n.cwd : undefined;
  for (const c of n.children) {
    const found = findLeafCwd(c, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function setLeafCwd(n: PaneNode, id: PaneId, cwd: string): PaneNode {
  if (isLeaf(n)) {
    if (n.id !== id || n.cwd === cwd) return n;
    return { ...n, cwd };
  }
  let changed = false;
  const next = n.children.map((c) => {
    const u = setLeafCwd(c, id, cwd);
    if (u !== c) changed = true;
    return u;
  });
  return changed ? { ...n, children: next } : n;
}

export function setLeafTmuxSession(
  n: PaneNode,
  id: PaneId,
  tmuxSession: string,
): PaneNode {
  if (isLeaf(n)) {
    if (n.id !== id || n.tmuxSession === tmuxSession) return n;
    return { ...n, tmuxSession };
  }
  let changed = false;
  const next = n.children.map((c) => {
    const u = setLeafTmuxSession(c, id, tmuxSession);
    if (u !== c) changed = true;
    return u;
  });
  return changed ? { ...n, children: next } : n;
}

/**
 * Insert a new leaf next to `targetId` in direction `dir`.
 *
 * If the target's enclosing split already runs in `dir`, the new leaf is
 * appended as a sibling there (avoids nested same-direction splits — keeps
 * the tree shallow and the resize handles aligned).
 */
export function splitLeaf(
  tree: PaneNode,
  targetId: PaneId,
  newSplitId: PaneId,
  newLeafId: PaneId,
  dir: SplitDir,
  newCwd?: string,
): PaneNode {
  if (tree.kind === "split" && tree.dir === dir) {
    const idx = tree.children.findIndex(
      (c) => c.kind === "leaf" && c.id === targetId,
    );
    if (idx >= 0) {
      const newLeaf: PaneNode = { kind: "leaf", id: newLeafId, cwd: newCwd };
      return {
        ...tree,
        children: [
          ...tree.children.slice(0, idx + 1),
          newLeaf,
          ...tree.children.slice(idx + 1),
        ],
      };
    }
  }
  if (isLeaf(tree)) {
    if (tree.id !== targetId) return tree;
    const newLeaf: PaneNode = { kind: "leaf", id: newLeafId, cwd: newCwd };
    return {
      kind: "split",
      id: newSplitId,
      dir,
      children: [tree, newLeaf],
    };
  }
  return {
    ...tree,
    children: tree.children.map((c) =>
      splitLeaf(c, targetId, newSplitId, newLeafId, dir, newCwd),
    ),
  };
}

/**
 * Remove a leaf and collapse single-child splits left in its wake. Returns
 * `null` when the entire subtree is gone.
 */
export function removeLeaf(tree: PaneNode, targetId: PaneId): PaneNode | null {
  if (isLeaf(tree)) return tree.id === targetId ? null : tree;
  const newChildren: PaneNode[] = [];
  for (const c of tree.children) {
    const r = removeLeaf(c, targetId);
    if (r !== null) newChildren.push(r);
  }
  if (newChildren.length === 0) return null;
  if (newChildren.length === 1) return newChildren[0];
  return { ...tree, children: newChildren };
}

export function nextLeafId(
  tree: PaneNode,
  currentId: PaneId,
  delta: 1 | -1,
): PaneId {
  const ids = leafIds(tree);
  if (ids.length === 0) return currentId;
  const idx = ids.indexOf(currentId);
  if (idx < 0) return ids[0];
  return ids[(idx + delta + ids.length) % ids.length];
}

// Closest neighbor of `leafId` within its enclosing split — prefer the
// next sibling, fall back to the previous. Used to pick the new focus
// when a pane closes (so focus stays in the same neighborhood instead of
// snapping to the first pane in the tree).
export function siblingLeafOf(tree: PaneNode, leafId: PaneId): PaneId | null {
  if (isLeaf(tree)) return null;
  for (let i = 0; i < tree.children.length; i++) {
    const c = tree.children[i];
    if (isLeaf(c) && c.id === leafId) {
      const sibling = tree.children[i + 1] ?? tree.children[i - 1];
      if (!sibling) return null;
      return leafIds(sibling)[0] ?? null;
    }
  }
  for (const c of tree.children) {
    if (!isLeaf(c)) {
      const r = siblingLeafOf(c, leafId);
      if (r !== null) return r;
    }
  }
  return null;
}

export function hasLeaf(tree: PaneNode, id: PaneId): boolean {
  return leafIds(tree).includes(id);
}

export type DropEdge = "left" | "right" | "top" | "bottom";

const EDGE_DIR: Record<DropEdge, SplitDir> = {
  left: "row",
  right: "row",
  top: "col",
  bottom: "col",
};

function findLeafNode(
  tree: PaneNode,
  id: PaneId,
): Extract<PaneNode, { kind: "leaf" }> | null {
  if (isLeaf(tree)) return tree.id === id ? tree : null;
  for (const c of tree.children) {
    const f = findLeafNode(c, id);
    if (f) return f;
  }
  return null;
}

/**
 * Insert an existing leaf node next to `targetId` in direction `dir`, before or
 * after it. Mirrors {@link splitLeaf}'s same-direction merge but reuses the
 * given leaf (preserving its id — and thus its live session) instead of minting
 * a fresh one.
 */
function insertLeafBeside(
  tree: PaneNode,
  targetId: PaneId,
  leaf: PaneNode,
  newSplitId: PaneId,
  dir: SplitDir,
  before: boolean,
): PaneNode {
  if (tree.kind === "split" && tree.dir === dir) {
    const idx = tree.children.findIndex(
      (c) => c.kind === "leaf" && c.id === targetId,
    );
    if (idx >= 0) {
      const at = before ? idx : idx + 1;
      return {
        ...tree,
        children: [
          ...tree.children.slice(0, at),
          leaf,
          ...tree.children.slice(at),
        ],
      };
    }
  }
  if (isLeaf(tree)) {
    if (tree.id !== targetId) return tree;
    return {
      kind: "split",
      id: newSplitId,
      dir,
      children: before ? [leaf, tree] : [tree, leaf],
    };
  }
  return {
    ...tree,
    children: tree.children.map((c) =>
      insertLeafBeside(c, targetId, leaf, newSplitId, dir, before),
    ),
  };
}

/**
 * Move an existing leaf next to `targetId` along `edge`, keeping the leaf's id
 * (so its live terminal session survives). Removes the source first — which
 * collapses any single-child split it leaves behind — then re-inserts it at the
 * target. `newSplitId` is consumed only if a fresh split node is needed there.
 * Returns the original tree unchanged on a no-op (source === target, or either
 * id missing, or source is the only leaf).
 */
export function moveLeaf(
  tree: PaneNode,
  sourceId: PaneId,
  targetId: PaneId,
  edge: DropEdge,
  newSplitId: PaneId,
): PaneNode {
  if (sourceId === targetId) return tree;
  const moved = findLeafNode(tree, sourceId);
  if (!moved) return tree;
  const pruned = removeLeaf(tree, sourceId);
  if (pruned === null || !hasLeaf(pruned, targetId)) return tree;
  const before = edge === "left" || edge === "top";
  return insertLeafBeside(
    pruned,
    targetId,
    moved,
    newSplitId,
    EDGE_DIR[edge],
    before,
  );
}
