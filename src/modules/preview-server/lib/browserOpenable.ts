import type { WorkspaceEnv } from "@/modules/workspace";

// Extensions "Open in Browser" offers, per rollout wave. Wave 2 adds Markdown
// (`md`, `markdown`, `mdx`). One literal per wave; the shipping wave must
// equal ENTRY_EXTENSIONS in src-tauri/src/modules/preview_server/policy.rs.
const EXTENSIONS_BY_WAVE = {
  1: ["html", "htm", "png", "jpg", "jpeg", "gif", "webp", "ico", "svg", "pdf"],
} as const satisfies Record<number, readonly string[]>;

/** The wave that is shipping. */
export const BROWSER_OPEN_WAVE = 1 satisfies keyof typeof EXTENSIONS_BY_WAVE;

/** Extensions of the shipping wave, lower case, without the dot. */
export const BROWSER_OPENABLE_EXTENSIONS: readonly string[] =
  EXTENSIONS_BY_WAVE[BROWSER_OPEN_WAVE];

const OPENABLE = new Set(BROWSER_OPENABLE_EXTENSIONS);

function extensionOf(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/**
 * Whether "Open in Browser" is offered for this file: its extension belongs to
 * the shipping wave and it lives locally (no workspace counts as local) or on
 * an SSH host. WSL is not offered.
 */
export function browserOpenable(
  path: string,
  workspace: WorkspaceEnv | undefined,
): boolean {
  const place = workspace?.kind ?? "local";
  if (place !== "local" && place !== "ssh") return false;
  return OPENABLE.has(extensionOf(path));
}
