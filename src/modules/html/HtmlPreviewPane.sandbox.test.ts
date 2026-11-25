// GUARD: Every iframe of the HTML preview takes its sandbox from a declared constant; each constant holds exactly the tokens allow-scripts allow-forms allow-popups allow-modals (compared without regard to case, as browsers do) and never allow-same-origin, also on the preview-server path.
// DISPOSITION: specs/2026-11-25-html-preview-browser/gates/obligations.md (OB-5)
// RULE: --
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// The tokens the build plan keeps unchanged (FS-6, SEC-9): no new token, no
// allow-same-origin, no allow-top-navigation*, no popups escaping the sandbox.
const ALLOWED_TOKENS = [
  "allow-scripts",
  "allow-forms",
  "allow-popups",
  "allow-modals",
];

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "HtmlPreviewPane.tsx"),
  "utf8",
);

type Report = {
  constants: Record<string, string>;
  iframes: number;
  violations: string[];
};

/**
 * Reads the syntax tree (comments are not part of it): collects every
 * `const *_SANDBOX = "…"` and checks every `<iframe>`. An iframe must carry
 * `sandbox={X}` or `sandbox={cond ? X : Y}` with declared constants only; a
 * literal, a spread, a missing attribute or any other expression is a
 * violation, as is a constant without `allow-scripts` or with
 * `allow-same-origin`.
 */
function checkSandbox(text: string): Report {
  const file = ts.createSourceFile(
    "HtmlPreviewPane.tsx",
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const constants: Record<string, string> = {};
  const violations: string[] = [];
  const iframes: ts.JsxAttributes[] = [];

  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /_SANDBOX$/.test(node.name.text)
    ) {
      const init = node.initializer;
      if (
        init &&
        (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init))
      )
        constants[node.name.text] = init.text;
      else violations.push(`${node.name.text} is not a plain string`);
    }
    if (
      (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
      node.tagName.getText(file) === "iframe"
    )
      iframes.push(node.attributes);
    ts.forEachChild(node, visit);
  };
  visit(file);

  for (const [name, value] of Object.entries(constants)) {
    // Sandbox tokens are ASCII case-insensitive in the browser.
    const tokens = value.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.includes("allow-scripts"))
      violations.push(`${name} lacks allow-scripts`);
    if (tokens.includes("allow-same-origin"))
      violations.push(`${name} has allow-same-origin`);
    const set = [...new Set(tokens)].sort();
    if (
      set.length !== tokens.length ||
      set.join(" ") !== [...ALLOWED_TOKENS].sort().join(" ")
    )
      violations.push(`${name} tokens differ: ${tokens.join(" ")}`);
  }

  const isConstant = (e: ts.Expression): boolean =>
    ts.isIdentifier(e) && e.text in constants;
  iframes.forEach((attrs, i) => {
    if (attrs.properties.some((p) => ts.isJsxSpreadAttribute(p))) {
      violations.push(`iframe ${i} spreads attributes`);
      return;
    }
    const sandbox = attrs.properties.find(
      (p): p is ts.JsxAttribute =>
        ts.isJsxAttribute(p) && p.name.getText(file) === "sandbox",
    );
    if (!sandbox) {
      violations.push(`iframe ${i} has no sandbox`);
      return;
    }
    const init = sandbox.initializer;
    const expr = init && ts.isJsxExpression(init) ? init.expression : undefined;
    const ok =
      expr !== undefined &&
      (isConstant(expr) ||
        (ts.isConditionalExpression(expr) &&
          isConstant(expr.whenTrue) &&
          isConstant(expr.whenFalse)));
    if (!ok) violations.push(`iframe ${i} sandbox is not a declared constant`);
  });

  return { constants, iframes: iframes.length, violations };
}

describe("HtmlPreviewPane sandbox", () => {
  it("[AC-15] every iframe uses a declared constant; each holds exactly the kept tokens, none same-origin", () => {
    const report = checkSandbox(SOURCE);
    expect(Object.keys(report.constants).sort()).toEqual([
      "LOCAL_SANDBOX",
      "REMOTE_SANDBOX",
    ]);
    expect(report.iframes).toBe(3);
    expect(report.violations).toEqual([]);
  });

  it("[AC-15] flags allow-same-origin appended to REMOTE_SANDBOX", () => {
    const copy = SOURCE.replace(
      /(const REMOTE_SANDBOX = "[^"]*)"/,
      '$1 allow-same-origin"',
    );
    expect(copy).not.toBe(SOURCE);
    expect(checkSandbox(copy).violations).toEqual([
      "REMOTE_SANDBOX has allow-same-origin",
      "REMOTE_SANDBOX tokens differ: allow-scripts allow-forms allow-popups allow-modals allow-same-origin",
    ]);
  });

  it("[AC-15] flags allow-same-origin in another case", () => {
    const copy = SOURCE.replace(
      /(const LOCAL_SANDBOX = "[^"]*)"/,
      '$1 Allow-Same-Origin"',
    );
    expect(copy).not.toBe(SOURCE);
    expect(checkSandbox(copy).violations).toContain(
      "LOCAL_SANDBOX has allow-same-origin",
    );
  });

  it("[AC-15] flags any token beyond the kept set", () => {
    for (const extra of [
      "allow-top-navigation",
      "allow-popups-to-escape-sandbox",
      "allow-downloads",
    ]) {
      const copy = SOURCE.replace(
        /(const LOCAL_SANDBOX = "[^"]*)"/,
        `$1 ${extra}"`,
      );
      expect(checkSandbox(copy).violations).toEqual([
        `LOCAL_SANDBOX tokens differ: allow-scripts allow-forms allow-popups allow-modals ${extra}`,
      ]);
    }
  });

  it("[AC-15] flags an iframe with a literal sandbox", () => {
    const copy = `${SOURCE}
export function Leak() {
  return <iframe title="x" sandbox="allow-scripts allow-same-origin" />;
}
`;
    const report = checkSandbox(copy);
    expect(report.iframes).toBe(4);
    expect(report.violations).toEqual([
      "iframe 3 sandbox is not a declared constant",
    ]);
  });

  it("[AC-15] a comment naming allow-same-origin is not a violation", () => {
    const copy = `// const X_SANDBOX = "allow-same-origin";\n${SOURCE}`;
    expect(checkSandbox(copy).violations).toEqual([]);
  });
});
