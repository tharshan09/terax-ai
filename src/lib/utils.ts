import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isMarkdownPath(path: string): boolean {
  return /\.(md|markdown|mdx)$/i.test(path)
}

export function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test(path)
}

/**
 * Last path segment, tolerant of both `/` and `\` separators and of trailing
 * slashes (empty segments are dropped). Returns the original string when it has
 * no usable segment (e.g. "" or "/").
 */
export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length ? parts[parts.length - 1] : path
}

/** Parent of a native OS path (`/` or `\`), e.g. the editor's watched folders. */
export function parentDir(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"))
  if (i < 0) return path
  if (i === 0) return path.slice(0, 1)
  if (i === 2 && /^[a-z]:/i.test(path)) return path.slice(0, 3)
  return path.slice(0, i)
}

/** Host of a URL for a compact tab title, falling back to the raw string. */
export function titleFromUrl(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url || "preview"
  }
}
