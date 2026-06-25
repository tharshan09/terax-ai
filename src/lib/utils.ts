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

/** Host of a URL for a compact tab title, falling back to the raw string. */
export function titleFromUrl(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url || "preview"
  }
}
