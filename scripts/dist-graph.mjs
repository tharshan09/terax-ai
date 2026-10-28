// Built-output startup-graph analyzer. scripts/eager-graph.mjs walks the source
// graph; this one reads a real `dist/`, because chunk assignment can drag heavy
// code into the startup graph even when the source graph is clean.
//
// A window's startup graph is the entry <script type="module">, every
// <link rel="modulepreload"> and their transitive static imports. Dynamic
// `import()` edges are lazy boundaries and do not count.
//
// CLI:  node scripts/dist-graph.mjs [distDir] [--verbose]   (exits 1 on a violation)
// Library: used by src/app/dist-budget.test.ts.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WINDOW_HTML = ["index.html", "settings.html"];

/** Chunk-name stems from the lazy `codeSplitting` group in vite.config.ts. */
export const FORBIDDEN_CHUNK_PATTERNS = [
  /^ai-/,
  /^streamdown$/,
  /^codemirror$/,
  /^cm-(?:lang|legacy)-/,
  /^iconEngine$/,
];

/** Runtime strings that survive minification, for heavy code in anonymous chunks. */
export const FORBIDDEN_SIGNATURES = [
  { label: "zod", needle: "ZodError" },
  { label: "ai-sdk", needle: "vercel.ai.error" },
];

/**
 * npm packages that must have no module in any startup chunk. Only checked when
 * the build emitted sourcemaps (`vite build --sourcemap`). xterm is not listed:
 * the fork's terminal is xterm-based and eager by design.
 */
export const FORBIDDEN_PACKAGES = [
  /^zod$/,
  /^ai$/,
  /^@ai-sdk\//,
  /^@codemirror\//,
  /^@lezer\//,
  /^@uiw\//,
  /^@replit\//,
  /^codemirror/,
  /^streamdown$/,
  /^@streamdown\//,
  /^@iconify-json\//,
  /^(?:motion|framer-motion|motion-dom|motion-utils)$/,
];

/** Local source files that must stay behind the icon loader's dynamic import. */
export const FORBIDDEN_SOURCES = [
  /(?:^|\/)(src\/modules\/explorer\/lib\/fileIcons\.ts)$/,
  /(?:^|\/)(src\/modules\/explorer\/lib\/folderIcons\.ts)$/,
  /(?:^|\/)(src\/modules\/explorer\/lib\/iconEngine\.ts)$/,
];

// The clause alphabet has no `(` or quote, so dynamic `import("./x.js")` and
// `import.meta` never match.
const STATIC_EDGE =
  /(?:^|[;}\n])\s*(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?(?:"([^"\n]+)"|'([^'\n]+)')/g;

/** Relative specifiers statically imported by a built chunk's source. */
export function staticImports(code) {
  const out = new Set();
  STATIC_EDGE.lastIndex = 0;
  let m;
  while ((m = STATIC_EDGE.exec(code))) {
    const spec = m[1] ?? m[2];
    if (spec.startsWith("./") || spec.startsWith("../")) out.add(spec);
  }
  return [...out];
}

const ATTR = /([\w:-]+)\s*=\s*"([^"]*)"/g;

function attrs(tag) {
  const out = {};
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(tag))) out[m[1]] = m[2];
  return out;
}

/** Assets a built HTML document loads up front, as written (`/assets/x.js`). */
export function parseHtmlAssets(html) {
  const scripts = [];
  const preloads = [];
  const styles = [];
  for (const m of html.matchAll(/<script\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (a.type === "module" && a.src) scripts.push(a.src);
  }
  for (const m of html.matchAll(/<link\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (!a.href) continue;
    if (a.rel === "modulepreload") preloads.push(a.href);
    else if (a.rel === "stylesheet") styles.push(a.href);
  }
  return { scripts, preloads, styles };
}

function distPath(href) {
  return posix.normalize(href.replace(/^\/+/, ""));
}

/** Strips the content hash: `ai-anthropic-BhxtMjzw.js` -> `ai-anthropic`. */
export function chunkName(file) {
  const base = posix.basename(file).replace(/\.js$/, "");
  return base.replace(/-[A-Za-z0-9_-]{8}$/, "");
}

function mapSources(mapText) {
  return (JSON.parse(mapText).sources ?? []).map(String);
}

/** npm packages named in a chunk's sourcemap; null when no map was emitted. */
export function packagesFromMap(mapText) {
  if (mapText == null) return null;
  const out = new Set();
  for (const source of mapSources(mapText)) {
    // Last `node_modules/` segment, so pnpm's `.pnpm/<pkg>@<ver>/node_modules/` yields the real package.
    const m = source.match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)/);
    if (m) out.add(m[1]);
  }
  return out;
}

/** Non-package sources of a chunk's sourcemap; null when no map was emitted. */
export function localSourcesFromMap(mapText) {
  if (mapText == null) return null;
  return mapSources(mapText).filter((s) => !s.includes("node_modules/"));
}

/**
 * Walks the startup graph of one HTML document. `readChunk` returns the text of
 * a dist-relative file or null; `via` is the chunk that first reached a file by
 * a static import (null for html-declared roots).
 */
export function traceStartup(html, readChunk) {
  const { scripts, preloads, styles } = parseHtmlAssets(html);
  const files = new Map();
  const missing = [];
  const queue = [];
  for (const href of [...scripts, ...preloads]) {
    queue.push({ file: distPath(href), via: null });
  }
  while (queue.length) {
    const { file, via } = queue.shift();
    if (files.has(file)) continue;
    const code = readChunk(file);
    if (code == null) {
      missing.push(file);
      continue;
    }
    const mapText = readChunk(`${file}.map`);
    files.set(file, {
      bytes: Buffer.byteLength(code),
      via,
      code,
      packages: packagesFromMap(mapText),
      sources: localSourcesFromMap(mapText),
    });
    for (const spec of staticImports(code)) {
      queue.push({
        file: posix.normalize(posix.join(posix.dirname(file), spec)),
        via: file,
      });
    }
  }
  return { files, styles: styles.map(distPath), missing };
}

function violationOf(file, info) {
  const reasons = [];
  const name = chunkName(file);
  if (FORBIDDEN_CHUNK_PATTERNS.some((re) => re.test(name))) {
    reasons.push(`forbidden chunk "${name}"`);
  }
  for (const pkg of info.packages ?? []) {
    if (FORBIDDEN_PACKAGES.some((re) => re.test(pkg))) {
      reasons.push(`bundles package "${pkg}"`);
    }
  }
  for (const source of info.sources ?? []) {
    for (const re of FORBIDDEN_SOURCES) {
      const m = source.match(re);
      if (m) reasons.push(`bundles source "${m[1]}"`);
    }
  }
  if (reasons.length === 0) {
    const sig = FORBIDDEN_SIGNATURES.find(({ needle }) =>
      info.code.includes(needle),
    );
    if (sig) reasons.push(`contains ${sig.label} code ("${sig.needle}")`);
  }
  return reasons.length > 0 ? reasons.join("; ") : null;
}

/** Forbidden chunks reachable at startup. */
export function findViolations(trace) {
  const out = [];
  for (const [file, info] of trace.files) {
    const reason = violationOf(file, info);
    if (reason) out.push({ file, reason, via: info.via });
  }
  return out;
}

export function startupBytes(trace) {
  let total = 0;
  for (const info of trace.files.values()) total += info.bytes;
  return total;
}

/** Analyzes every window document in a built dist directory. */
export function analyzeDist(distDir, windows = WINDOW_HTML) {
  const readChunk = (rel) => {
    const p = join(distDir, rel);
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  };
  const result = {};
  for (const htmlFile of windows) {
    const html = readChunk(htmlFile);
    if (html == null) throw new Error(`missing ${htmlFile} in ${distDir}`);
    const trace = traceStartup(html, readChunk);
    result[htmlFile] = {
      trace,
      violations: findViolations(trace),
      bytes: startupBytes(trace),
    };
  }
  return result;
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);
if (isCli) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose");
  const distArg = args.find((a) => !a.startsWith("--"));
  const distDir = resolve(distArg ?? join(root, "dist"));
  let failed = false;
  for (const [html, r] of Object.entries(analyzeDist(distDir))) {
    const kib = (r.bytes / 1024).toFixed(1);
    console.log(
      `\n${html}: ${r.trace.files.size} startup chunks, ${r.bytes} bytes (${kib} KiB) JS`,
    );
    if (verbose) {
      for (const [f, i] of r.trace.files) {
        console.log(`  ${String(i.bytes).padStart(8)}  ${f}`);
      }
    }
    for (const miss of r.trace.missing) console.log(`  ! missing ${miss}`);
    for (const v of r.violations) {
      failed = true;
      console.log(`  x ${v.file}: ${v.reason}${v.via ? ` (via ${v.via})` : ""}`);
    }
  }
  if (failed) {
    console.error(
      "\nStartup graph pulls forbidden chunks; check codeSplitting in vite.config.ts.",
    );
    process.exit(1);
  }
  console.log("\nstartup graph clean");
}
