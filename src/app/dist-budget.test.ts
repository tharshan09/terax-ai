import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  analyzeDist,
  chunkName,
  findViolations,
  localSourcesFromMap,
  packagesFromMap,
  parseHtmlAssets,
  staticImports,
  traceStartup,
} from "../../scripts/dist-graph.mjs";

// Reads what the bundler emitted: chunk assignment can drag heavy code into the
// startup graph even when the source graph (eager-budget.test.ts) is clean.

const root = fileURLToPath(new URL("../..", import.meta.url));

describe("dist graph analyzer", () => {
  it("reads only static import edges, not dynamic ones", () => {
    const code = [
      'import{a as b}from"./one.js";import"./two.js";',
      'export{c}from"./three.js";export*from"./four.js";',
      'const lazy=()=>import("./lazy.js");',
      'import.meta.url;import x,{y}from"../up.js";',
      'const s="import {z} from \\"./string.js\\"";',
      'import{r}from"pkg";',
    ].join("\n");
    expect(staticImports(code).sort()).toEqual(
      ["../up.js", "./four.js", "./one.js", "./three.js", "./two.js"].sort(),
    );
  });

  it("collects entry scripts, modulepreloads and stylesheets from html", () => {
    const html = `<head>
      <script>var inline = 1</script>
      <script type="module" crossorigin src="/assets/main-AAAA1111.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/react-BBBB2222.js">
      <link rel="stylesheet" crossorigin href="/assets/app-CCCC3333.css">
      <link rel="icon" href="/logo.png">
    </head>`;
    expect(parseHtmlAssets(html)).toEqual({
      scripts: ["/assets/main-AAAA1111.js"],
      preloads: ["/assets/react-BBBB2222.js"],
      styles: ["/assets/app-CCCC3333.css"],
    });
  });

  it("strips the content hash from chunk names", () => {
    expect(chunkName("assets/ai-sdk-shared-CAWduq6e.js")).toBe("ai-sdk-shared");
    expect(chunkName("assets/cm-lang-css-Bzp8a_YD.js")).toBe("cm-lang-css");
    expect(chunkName("assets/react-Cg0CyNNP.js")).toBe("react");
  });

  it("resolves npm packages through pnpm's nested node_modules", () => {
    const map = JSON.stringify({
      sources: [
        "../../node_modules/.pnpm/zod@4.4.3/node_modules/zod/v4/core.js",
        "../../node_modules/.pnpm/@ai-sdk+gateway@3/node_modules/@ai-sdk/gateway/dist/index.mjs",
        "../../src/main.tsx",
      ],
    });
    expect([...(packagesFromMap(map) ?? [])].sort()).toEqual([
      "@ai-sdk/gateway",
      "zod",
    ]);
    expect(localSourcesFromMap(map)).toEqual(["../../src/main.tsx"]);
    expect(packagesFromMap(null)).toBeNull();
    expect(localSourcesFromMap(null)).toBeNull();
  });

  it("follows transitive static imports and flags forbidden chunks with their importer", () => {
    const files: Record<string, string> = {
      "index.html":
        '<script type="module" src="/assets/main-AAAA1111.js"></script>',
      "assets/main-AAAA1111.js": 'import"./react-BBBB2222.js";',
      "assets/react-BBBB2222.js": 'import{n}from"./ai-sdk-shared-CCCC3333.js";',
      "assets/ai-sdk-shared-CCCC3333.js":
        'import{z}from"./ai-anthropic-DDDD4444.js";',
      "assets/ai-anthropic-DDDD4444.js": "export const z=1;",
    };
    const trace = traceStartup(files["index.html"], (p) => files[p] ?? null);
    expect([...trace.files.keys()]).toHaveLength(4);
    expect(
      findViolations(trace).map((v) => [chunkName(v.file), v.via]),
    ).toEqual([
      ["ai-sdk-shared", "assets/react-BBBB2222.js"],
      ["ai-anthropic", "assets/ai-sdk-shared-CCCC3333.js"],
    ]);
  });

  it("catches heavy code hiding in an anonymous chunk, by signature and by sourcemap", () => {
    const files: Record<string, string> = {
      "index.html":
        '<script type="module" src="/assets/main-AAAA1111.js"></script>',
      "assets/main-AAAA1111.js":
        'import"./dist-BBBB2222.js";import"./esm-CCCC3333.js";',
      "assets/dist-BBBB2222.js": 'class E{};E.name="ZodError";',
      "assets/esm-CCCC3333.js": "export const x=1;",
      "assets/esm-CCCC3333.js.map": JSON.stringify({
        sources: [
          "../../node_modules/.pnpm/x/node_modules/@codemirror/state/a.js",
        ],
      }),
    };
    const trace = traceStartup(files["index.html"], (p) => files[p] ?? null);
    expect(findViolations(trace).map((v) => v.reason)).toEqual([
      'contains zod code ("ZodError")',
      'bundles package "@codemirror/state"',
    ]);
  });

  it("names the package and the icon data files a startup chunk bundles", () => {
    const files: Record<string, string> = {
      "index.html":
        '<script type="module" src="/assets/main-AAAA1111.js"></script>',
      "assets/main-AAAA1111.js": 'import"./ai-anthropic-BBBB2222.js";',
      "assets/main-AAAA1111.js.map": JSON.stringify({
        sources: [
          "../../src/main.tsx",
          "../../src/modules/explorer/lib/fileIcons.ts",
          "../../src/modules/explorer/lib/folderIcons.ts",
        ],
      }),
      "assets/ai-anthropic-BBBB2222.js": "export const a=1;",
      "assets/ai-anthropic-BBBB2222.js.map": JSON.stringify({
        sources: [
          "../../node_modules/.pnpm/a/node_modules/@ai-sdk/anthropic/dist/index.mjs",
        ],
      }),
    };
    const trace = traceStartup(files["index.html"], (p) => files[p] ?? null);
    expect(findViolations(trace).map((v) => v.reason)).toEqual([
      'bundles source "src/modules/explorer/lib/fileIcons.ts"; bundles source "src/modules/explorer/lib/folderIcons.ts"',
      'forbidden chunk "ai-anthropic"; bundles package "@ai-sdk/anthropic"',
    ]);
  });

  it("passes a clean graph and counts bytes once per chunk", () => {
    const files: Record<string, string> = {
      "index.html":
        '<script type="module" src="/assets/main-AAAA1111.js"></script><link rel="modulepreload" href="/assets/react-BBBB2222.js">',
      "assets/main-AAAA1111.js":
        'import"./react-BBBB2222.js";const l=()=>import("./ai-openai-EEEE5555.js");',
      "assets/react-BBBB2222.js": "export const r=1;",
    };
    const trace = traceStartup(files["index.html"], (p) => files[p] ?? null);
    expect(findViolations(trace)).toEqual([]);
    expect(trace.missing).toEqual([]);
    expect(trace.files.size).toBe(2);
  });
});

describe("built startup graph", () => {
  let outDir = "";

  beforeAll(() => {
    outDir = mkdtempSync(join(tmpdir(), "terax-dist-budget-"));
    // Sourcemaps list every module inside each chunk, so the package check does
    // not depend on chunk names. A temp dir keeps the real dist/ untouched.
    execFileSync(
      process.execPath,
      [
        join(root, "node_modules/vite/bin/vite.js"),
        "build",
        "--outDir",
        outDir,
        "--emptyOutDir",
        "--sourcemap",
        "--logLevel",
        "error",
      ],
      {
        cwd: root,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "pipe",
        timeout: 240_000,
      },
    );
  }, 300_000);

  afterAll(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  for (const html of ["index.html", "settings.html"]) {
    it(`${html}: no AI SDK, zod, Streamdown, CodeMirror or icon-set code is preloaded`, () => {
      const result = analyzeDist(outDir, [html])[html];
      expect(result.trace.missing).toEqual([]);
      expect(result.trace.files.size).toBeGreaterThan(5);
      expect(
        result.violations.map(
          (v) => `${v.file}: ${v.reason}${v.via ? ` (via ${v.via})` : ""}`,
        ),
      ).toEqual([]);
    });
  }

  it("keeps the heavy stacks lazily loadable: they exist and are reached by dynamic import", () => {
    const assets = join(outDir, "assets");
    const chunks = readdirSync(assets).filter((f) => f.endsWith(".js"));
    const texts = new Map(
      chunks.map((f) => [f, readFileSync(join(assets, f), "utf8")]),
    );
    const startup = new Set(
      ["index.html", "settings.html"].flatMap((html) => [
        ...analyzeDist(outDir, [html])[html].trace.files.keys(),
      ]),
    );
    for (const stem of [
      "ai-sdk-shared",
      "ai-anthropic",
      "streamdown",
      "codemirror",
      "iconEngine",
    ]) {
      const file = chunks.find((f) => chunkName(f) === stem);
      expect(file, `${stem} chunk should be emitted`).toBeDefined();
      expect(startup.has(`assets/${file}`), `${stem} must not be startup`).toBe(
        false,
      );
      const referenced = [...texts].some(
        ([other, code]) => other !== file && code.includes(file as string),
      );
      expect(referenced, `${stem} must be referenced by a dynamic import`).toBe(
        true,
      );
    }
  });

  it("bundles one shared Lezer highlighter for parsers and themes", () => {
    // Two copies split the highlight tags, so parsers and themes stop matching
    // and the editor renders uncoloured code.
    const marker = "/node_modules/@lezer/highlight/";
    const assets = join(outDir, "assets");
    const copies = new Set<string>();
    for (const file of readdirSync(assets).filter((f) =>
      f.endsWith(".js.map"),
    )) {
      const map = JSON.parse(readFileSync(join(assets, file), "utf8")) as {
        sources: string[];
      };
      for (const source of map.sources) {
        const at = source.indexOf(marker);
        if (at === -1) continue;
        const pkgRoot = source.slice(0, at + marker.length);
        copies.add(pkgRoot.replace(/^.*\/node_modules\/\.pnpm\//, ""));
      }
    }
    expect([...copies]).toHaveLength(1);
  });
});
