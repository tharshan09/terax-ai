// The one rule for tree keys: a folder's key plus `/` plus the entry name.
export function joinPath(parent: string, name: string): string {
  if (parent.endsWith("/")) return `${parent}${name}`;
  return `${parent}/${name}`;
}

// Parent of a tree key: keys join with `/`, so a backslash stays part of a name.
export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  if (i <= 0) return "/";
  return path.slice(0, i);
}

// Not `@/lib/utils` basename: that one also splits at `\`, which a key's name may hold.
export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

// The folder a row stands for when something lands on it: paste, drop or move.
export function targetDirFor<Root extends string | null>(
  row: string | null | undefined,
  isDir: (path: string) => boolean | undefined,
  rootPath: Root,
): string | Root {
  if (!row) return rootPath;
  return isDir(row) ? row : dirname(row);
}
