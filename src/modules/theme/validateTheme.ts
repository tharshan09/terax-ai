import type { Theme, ThemeColors, ThemeVariant, TerminalPalette } from "./types";

export type ValidationResult =
  | { ok: true; theme: Theme }
  | { ok: false; error: string };

const COLOR_KEYS: readonly (keyof ThemeColors)[] = [
  "background", "foreground",
  "card", "cardForeground",
  "popover", "popoverForeground",
  "primary", "primaryForeground",
  "secondary", "secondaryForeground",
  "muted", "mutedForeground",
  "accent", "accentForeground",
  "destructive",
  "border", "input", "ring",
  "sidebar", "sidebarForeground",
  "sidebarPrimary", "sidebarPrimaryForeground",
  "sidebarAccent", "sidebarAccentForeground",
  "sidebarBorder", "sidebarRing",
  "radius",
];

const ID_RE = /^[a-z0-9][a-z0-9-]{1,63}$/;

// Theme values land in `--custom-*` CSS variables via style.setProperty and are
// later consumed through `var(...)`. setProperty already blocks declaration
// injection, but a custom property can carry a *valid* fetching value like
// `url(http://evil/x)` that becomes a network beacon once a rule resolves it.
// So values are allowlisted to real color/length shapes; no `url(`, no nested
// `(`, no `;`/`}`/`<` that could matter in any consumer.
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
// Named keywords: `red`, `transparent`, `currentColor`, `inherit`, `none`.
const KEYWORD_RE = /^[a-zA-Z]+$/;
// Length/number for `radius`: `0`, `12px`, `0.5rem`, `50%`.
const LENGTH_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|vh|vw|vmin|vmax|pt|ch|ex|cm|mm|in|pc|q)?$/;
// A single color function. The inner charset excludes `(` so `url(` can never
// nest; the outer name is allowlisted so `url`/`image`/`element` are rejected.
const COLOR_FN_RE =
  /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|gray)\([0-9a-zA-Z.,%\s/+-]*\)$/;

/** Pure. True for a theme value safe to feed into a CSS custom property:
 *  hex, a named keyword, a length (for radius), or an allowlisted color
 *  function. Rejects url()/image()/expression(), embedded `;`/`}`, and any
 *  other shape that could turn a `var()` consumer into a fetch or escape. */
export function isSafeCssColorValue(v: string): boolean {
  const s = v.trim();
  if (s.length === 0 || s.length > 128) return false;
  return (
    HEX_RE.test(s) ||
    KEYWORD_RE.test(s) ||
    LENGTH_RE.test(s) ||
    COLOR_FN_RE.test(s)
  );
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStr(v: unknown): v is string {
  return typeof v === "string";
}

function checkColorValue(v: unknown, path: string): string | null {
  if (!isStr(v) || v.length === 0) return `${path} must be a non-empty string`;
  if (!isSafeCssColorValue(v)) {
    return `${path} is not a valid color value (expected hex, a named color, a length, or an rgb/hsl/oklch(...) function)`;
  }
  return null;
}

function parseColors(raw: unknown, path: string): ThemeColors | string {
  if (raw === undefined) return {};
  if (!isObj(raw)) return `${path} must be an object`;
  const out: ThemeColors = {};
  for (const k of Object.keys(raw)) {
    if (!(COLOR_KEYS as string[]).includes(k)) {
      return `${path}.${k} is not a recognized color key`;
    }
    const v = raw[k];
    const err = checkColorValue(v, `${path}.${k}`);
    if (err) return err;
    out[k as keyof ThemeColors] = v as string;
  }
  return out;
}

function parseTerminal(raw: unknown, path: string): TerminalPalette | string {
  if (raw === undefined) return {};
  if (!isObj(raw)) return `${path} must be an object`;
  const out: TerminalPalette = {};
  for (const k of ["background", "foreground", "cursor", "cursorAccent", "selection"] as const) {
    if (raw[k] !== undefined) {
      const err = checkColorValue(raw[k], `${path}.${k}`);
      if (err) return err;
      out[k] = raw[k] as string;
    }
  }
  if (raw.ansi !== undefined) {
    if (!Array.isArray(raw.ansi) || raw.ansi.length !== 16) {
      return `${path}.ansi must be an array of 16 strings`;
    }
    for (let i = 0; i < 16; i++) {
      const err = checkColorValue(raw.ansi[i], `${path}.ansi[${i}]`);
      if (err) return err;
    }
    out.ansi = raw.ansi as unknown as TerminalPalette["ansi"];
  }
  return out;
}

function parseVariant(raw: unknown, path: string): ThemeVariant | string {
  if (!isObj(raw)) return `${path} must be an object`;
  const colors = parseColors(raw.colors, `${path}.colors`);
  if (typeof colors === "string") return colors;
  const terminal = parseTerminal(raw.terminal, `${path}.terminal`);
  if (typeof terminal === "string") return terminal;
  return { colors, terminal };
}

export function validateTheme(raw: unknown): ValidationResult {
  if (!isObj(raw)) return { ok: false, error: "Theme must be a JSON object" };
  if (!isStr(raw.id) || !ID_RE.test(raw.id)) {
    return { ok: false, error: "id must be a kebab-case string (a-z, 0-9, -)" };
  }
  if (!isStr(raw.name) || raw.name.trim().length === 0) {
    return { ok: false, error: "name must be a non-empty string" };
  }
  if (!isObj(raw.variants)) return { ok: false, error: "variants must be an object" };
  const variants: Theme["variants"] = {};
  if (raw.variants.light !== undefined) {
    const v = parseVariant(raw.variants.light, "variants.light");
    if (typeof v === "string") return { ok: false, error: v };
    variants.light = v;
  }
  if (raw.variants.dark !== undefined) {
    const v = parseVariant(raw.variants.dark, "variants.dark");
    if (typeof v === "string") return { ok: false, error: v };
    variants.dark = v;
  }
  if (!variants.light && !variants.dark) {
    return { ok: false, error: "variants must contain at least one of: light, dark" };
  }
  const theme: Theme = {
    id: raw.id,
    name: raw.name.trim(),
    variants,
  };
  if (isStr(raw.author)) theme.author = raw.author;
  if (isStr(raw.description)) theme.description = raw.description;
  if (isObj(raw.editorTheme)) {
    const et: Theme["editorTheme"] = {};
    if (isStr(raw.editorTheme.light)) et.light = raw.editorTheme.light;
    if (isStr(raw.editorTheme.dark)) et.dark = raw.editorTheme.dark;
    if (et.light || et.dark) theme.editorTheme = et;
  }
  return { ok: true, theme };
}
