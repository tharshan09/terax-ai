// GUARD: "Open in Browser" is reached only by a click: nothing in the AI module names the command or this module, each preview command has exactly one calling file, the openable extensions equal ENTRY_EXTENSIONS in policy.rs and follow the editor's image list and isHtmlPath, the capabilities carry no `remote`, and the import rules that keep the partial mocks of existing tests working hold.
// DISPOSITION: specs/2026-11-25-html-preview-browser/slop-dispositions.md
// RULE: --
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isHtmlPath } from "@/lib/utils";
import { IMAGE_EXTS } from "@/modules/editor/lib/binaryPreview";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { BROWSER_OPENABLE_EXTENSIONS } from "./lib/browserOpenable";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SRC = join(ROOT, "src");

function files(dir: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(path, keep));
    else if (keep(entry.name)) out.push(path);
  }
  return out;
}

const isSource = (name: string) =>
  /\.[cm]?[jt]sx?$/.test(name) &&
  !/\.test\.[jt]sx?$/.test(name) &&
  !name.endsWith(".d.ts");

const rel = (path: string) => relative(ROOT, path).split(sep).join("/");

function parse(text: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  return node.importClause?.phaseModifier === ts.SyntaxKind.TypeKeyword;
}

/**
 * Number of real `invoke("<command>", …)` calls in a source text. Only
 * calls count whose callee is `invoke` imported from `@tauri-apps/api/core`
 * (also under another local name or through a namespace import) and whose
 * first argument is the command name as a literal. Comments, and the name in
 * any other string, don't count: the syntax tree holds neither as a call.
 */
function invokeCalls(text: string, fileName: string, command: string): number {
  const source = parse(text, fileName);
  const direct = new Set<string>();
  const namespaces = new Set<string>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@tauri-apps/api/core" ||
      isTypeOnlyImport(statement)
    )
      continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text);
    else
      for (const spec of bindings.elements)
        if (
          (spec.propertyName ?? spec.name).text === "invoke" &&
          !spec.isTypeOnly
        )
          direct.add(spec.name.text);
  }
  let count = 0;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isInvoke =
        (ts.isIdentifier(callee) && direct.has(callee.text)) ||
        (ts.isPropertyAccessExpression(callee) &&
          callee.name.text === "invoke" &&
          ts.isIdentifier(callee.expression) &&
          namespaces.has(callee.expression.text));
      const first = node.arguments[0];
      if (
        isInvoke &&
        first &&
        (ts.isStringLiteral(first) ||
          ts.isNoSubstitutionTemplateLiteral(first)) &&
        first.text === command
      )
        count += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count;
}

const SOURCES = files(SRC, isSource).map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
}));

function callers(command: string): string[] {
  return SOURCES.filter(
    ({ path, text }) => invokeCalls(text, path, command) > 0,
  ).map(({ path }) => rel(path));
}

function callCount(command: string): number {
  return SOURCES.reduce(
    (sum, { path, text }) => sum + invokeCalls(text, path, command),
    0,
  );
}

function stripRustComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function entryExtensions(): string[] {
  const policy = stripRustComments(
    readFileSync(
      join(ROOT, "src-tauri/src/modules/preview_server/policy.rs"),
      "utf8",
    ),
  );
  const literal = /pub const ENTRY_EXTENSIONS: &\[&str\] = &\[([^\]]*)\];/.exec(
    policy,
  );
  if (!literal)
    throw new Error("ENTRY_EXTENSIONS literal not found in policy.rs");
  return [...literal[1].matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

function keysNamed(value: unknown, key: string): number {
  if (Array.isArray(value))
    return value.reduce((n: number, v) => n + keysNamed(v, key), 0);
  if (value && typeof value === "object")
    return Object.entries(value).reduce(
      (n, [k, v]) => n + (k === key ? 1 : 0) + keysNamed(v, key),
      0,
    );
  return 0;
}

type Import = { from: string; typeOnly: boolean; values: string[] };

function importsOf(path: string): Import[] {
  const source = parse(readFileSync(path, "utf8"), path);
  const out: Import[] = [];
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const clause = statement.importClause;
    const typeOnly = isTypeOnlyImport(statement);
    const values: string[] = [];
    if (clause && !typeOnly) {
      if (clause.name) values.push("default");
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) values.push("*");
      else if (bindings)
        for (const spec of bindings.elements)
          if (!spec.isTypeOnly)
            values.push((spec.propertyName ?? spec.name).text);
    }
    out.push({ from: statement.moduleSpecifier.text, typeOnly, values });
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ])
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
}

/** Local files a file reaches through value imports (type imports are erased). */
function valueImportClosure(entry: string): string[] {
  const seen = new Set<string>([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    for (const imp of importsOf(file)) {
      if (imp.typeOnly || imp.values.length === 0) continue;
      const target = resolveLocal(file, imp.from);
      if (target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...seen].map(rel);
}

const PREVIEW_SERVER = join(SRC, "modules/preview-server");
const FILE_EXPLORER = join(SRC, "modules/explorer/FileExplorer.tsx");

describe("invoke call counter", () => {
  const CMD = "preview_open_in_browser";
  const head = 'import { invoke } from "@tauri-apps/api/core";\n';

  it("[AC-2] counts a real call, also generic, aliased or through a namespace", () => {
    expect(invokeCalls(`${head}invoke("${CMD}", {});`, "a.ts", CMD)).toBe(1);
    expect(
      invokeCalls(`${head}invoke<X>("${CMD}", { path });`, "a.ts", CMD),
    ).toBe(1);
    expect(
      invokeCalls(
        `import { invoke as call } from "@tauri-apps/api/core";\ncall("${CMD}");`,
        "a.ts",
        CMD,
      ),
    ).toBe(1);
    expect(
      invokeCalls(
        `import * as core from "@tauri-apps/api/core";\ncore.invoke(\`${CMD}\`);`,
        "a.ts",
        CMD,
      ),
    ).toBe(1);
  });

  it("[AC-2] a comment or a string naming the command is not a call", () => {
    expect(
      invokeCalls(
        `${head}// calls ${CMD} elsewhere\nconst s = "${CMD}";`,
        "a.ts",
        CMD,
      ),
    ).toBe(0);
    expect(
      invokeCalls(
        `${head}// invoke("${CMD}", {});\n/* invoke("${CMD}") */`,
        "a.ts",
        CMD,
      ),
    ).toBe(0);
    expect(invokeCalls(`${head}log("${CMD}");`, "a.ts", CMD)).toBe(0);
  });
});

describe("Open in Browser boundary", () => {
  it("[AC-2] nothing in the AI module names the command or this module", () => {
    const AI = join(SRC, "modules/ai");
    const offenders = files(AI, isSource).filter((file) =>
      /preview_open_in_browser|modules\/preview-server/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("[AC-2] exactly one file calls preview_open_in_browser, once", () => {
    expect(callers("preview_open_in_browser")).toEqual([
      "src/modules/preview-server/lib/openInBrowser.ts",
    ]);
    expect(callCount("preview_open_in_browser")).toBe(1);
  });

  it("[AC-2] exactly one file calls preview_frame_source, once", () => {
    expect(callers("preview_frame_source")).toEqual([
      "src/modules/html/HtmlPreviewPane.tsx",
    ]);
    expect(callCount("preview_frame_source")).toBe(1);
  });

  it("[AC-2] the openable extensions equal ENTRY_EXTENSIONS in policy.rs", () => {
    const entry = entryExtensions();
    expect(entry.length).toBeGreaterThan(0);
    expect(new Set(BROWSER_OPENABLE_EXTENSIONS)).toEqual(new Set(entry));
    expect(BROWSER_OPENABLE_EXTENSIONS).toHaveLength(entry.length);
  });

  it("[AC-2] the image part is exactly the editor's IMAGE_EXTS", () => {
    const images = BROWSER_OPENABLE_EXTENSIONS.filter(
      (ext) => !isHtmlPath(`f.${ext}`) && ext !== "pdf",
    );
    expect(new Set(images)).toEqual(new Set(IMAGE_EXTS));
  });

  it("[AC-2] the HTML part is exactly what isHtmlPath accepts", () => {
    const html = BROWSER_OPENABLE_EXTENSIONS.filter((ext) =>
      isHtmlPath(`f.${ext}`),
    );
    expect(new Set(html)).toEqual(new Set(["html", "htm"]));
    // Neighbours isHtmlPath could plausibly grow to; each would need to join
    // the list (and ENTRY_EXTENSIONS) first.
    const neighbours = ["xhtml", "shtml", "mhtml", "htmx", "hta", "html5"];
    expect(neighbours.filter((ext) => isHtmlPath(`f.${ext}`))).toEqual([]);
  });

  it("[AC-2] the capabilities carry no remote key", () => {
    for (const name of ["default.json", "desktop.json"]) {
      const json = JSON.parse(
        readFileSync(join(ROOT, "src-tauri/capabilities", name), "utf8"),
      );
      expect({ name, remote: keysNamed(json, "remote") }).toEqual({
        name,
        remote: 0,
      });
    }
  });
});

describe("imports that keep the partial mocks of existing tests working", () => {
  it("[AC-20] preview-server imports @/modules/workspace only with import type", () => {
    const offenders = files(PREVIEW_SERVER, isSource).flatMap((file) =>
      importsOf(file)
        .filter((imp) => imp.from === "@/modules/workspace" && !imp.typeOnly)
        .map(() => rel(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("[AC-20] OpenInBrowserButton and PreviewHeader import no tooltip", () => {
    for (const file of [
      join(PREVIEW_SERVER, "OpenInBrowserButton.tsx"),
      join(SRC, "modules/doc/PreviewHeader.tsx"),
    ]) {
      const tooltip = importsOf(file).filter(
        (imp) => imp.from === "@/components/ui/tooltip",
      );
      expect({ file: rel(file), tooltip }).toEqual({
        file: rel(file),
        tooltip: [],
      });
    }
  });

  it("[AC-20] FileExplorer takes only the two lib files from preview-server", () => {
    const imports = importsOf(FILE_EXPLORER);
    expect(
      imports
        .filter((imp) => imp.from.includes("preview-server"))
        .map((imp) => imp.from)
        .sort(),
    ).toEqual([
      "@/modules/preview-server/lib/browserOpenable",
      "@/modules/preview-server/lib/openInBrowser",
    ]);
    expect(
      imports
        .filter((imp) => imp.from === "@/modules/workspace")
        .flatMap((imp) => imp.values),
    ).toEqual(["useWorkspaceEnvStore"]);
  });

  it("[AC-20] what FileExplorer reaches through preview-server holds no zen and no button", () => {
    const reached = [
      join(PREVIEW_SERVER, "lib/browserOpenable.ts"),
      join(PREVIEW_SERVER, "lib/openInBrowser.ts"),
    ].flatMap(valueImportClosure);
    expect(
      reached.filter((file) => /modules\/(zen|workspace)\//.test(file)),
    ).toEqual([]);
    expect(
      reached.filter((file) => file.endsWith("OpenInBrowserButton.tsx")),
    ).toEqual([]);
    expect(reached).toContain(
      "src/modules/preview-server/lib/browserOpenText.ts",
    );
  });
});
