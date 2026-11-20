import { IS_WINDOWS } from "@/lib/platform";

// "client" quotes for the shell on this machine; "posix" for a remote POSIX
// shell (SSH), where a backslash is an escape and never a separator.
export type ShellQuoteStyle = "client" | "posix";

// Quote only when needed, so a clean path stays verbatim for bracketed paste
// (Claude resolves an image path to "[Image #N]"); spaced/special paths quote.
const SAFE_PATH = /^[A-Za-z0-9_@%+=:,./\\-]+$/;
const SAFE_POSIX_PATH = /^[A-Za-z0-9_@%+=:,./-]+$/;

function quotePosix(p: string): string {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

export function quoteShellPath(
  p: string,
  style: ShellQuoteStyle = "client",
): string {
  if (style === "posix") return SAFE_POSIX_PATH.test(p) ? p : quotePosix(p);
  if (SAFE_PATH.test(p)) return p;
  if (IS_WINDOWS) return `"${p.replace(/"/g, '""')}"`;
  return quotePosix(p);
}

export function formatDroppedPaths(
  paths: string[],
  style: ShellQuoteStyle = "client",
): string {
  return `${paths.map((p) => quoteShellPath(p, style)).join(" ")} `;
}
