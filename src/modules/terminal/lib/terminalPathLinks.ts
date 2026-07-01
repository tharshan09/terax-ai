// Detects file-path tokens in a terminal line and resolves them against the
// pane's cwd, so Cmd+Click on a path in agent output can open it in a tab.
// URLs are deliberately left to WebLinksAddon. Pure logic — no xterm/DOM here.

export type PathLink = {
  /** 0-based start offset of the underlined token in the line. */
  start: number;
  /** 0-based end offset (exclusive). */
  end: number;
  /** The path token itself (`:line:col` stripped, trailing punctuation removed). */
  path: string;
};

// A run of non-separator chars. Quotes/brackets/parens bound a path so
// `(docs/x.html)` yields `docs/x.html`.
const RUN_RE = /[^\s"'`()[\]{}<>|]+/g;
// Anything with a scheme (http://, file://, …) is a URL, not a file path.
const URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
// Trailing sentence punctuation that isn't part of a path.
const TRAILING_PUNCT_RE = /[.,;!?]+$/;
// Optional `:line` or `:line:col` suffix (compiler / agent output).
const LINE_COL_RE = /:\d+(?::\d+)?$/;

/** True for tokens that look like a file path worth linkifying. Bare filenames
 *  (`config.js`) are excluded on purpose — too ambiguous in prose. */
function isPathLike(p: string): boolean {
  if (!p || URL_RE.test(p)) return false;
  if (p.startsWith("/") || p.startsWith("./") || p.startsWith("../")) {
    return p.length > 1;
  }
  // Multi-segment relative path with an extension on the final segment.
  if (p.includes("/")) {
    const last = p.slice(p.lastIndexOf("/") + 1);
    return /\.[A-Za-z0-9]+$/.test(last);
  }
  return false;
}

/** Find all path-like tokens in a single terminal line. */
export function findPathLinks(line: string): PathLink[] {
  const links: PathLink[] = [];
  RUN_RE.lastIndex = 0;
  let m: RegExpExecArray | null = RUN_RE.exec(line);
  while (m !== null) {
    const run = m[0];
    const runStart = m.index;
    // Drop trailing sentence punctuation, then split off :line:col.
    const punct = TRAILING_PUNCT_RE.exec(run);
    const tok = punct ? run.slice(0, run.length - punct[0].length) : run;
    const lc = LINE_COL_RE.exec(tok);
    const path = lc ? tok.slice(0, tok.length - lc[0].length) : tok;
    if (isPathLike(path)) {
      links.push({ start: runStart, end: runStart + tok.length, path });
    }
    m = RUN_RE.exec(line);
  }
  return links;
}

/** Resolve a detected token to an absolute path against `cwd`. `null` when it
 *  can't be resolved (relative token with no cwd, or `~` — home expansion is a
 *  follow-up). The OS resolves any embedded `..`. */
export function resolveTerminalPath(
  path: string,
  cwd: string | null,
): string | null {
  if (path.startsWith("/")) return path;
  if (path.startsWith("~")) return null;
  if (!cwd) return null;
  const base = cwd.endsWith("/") ? cwd.slice(0, -1) : cwd;
  const rel = path.startsWith("./") ? path.slice(2) : path;
  return `${base}/${rel}`;
}
