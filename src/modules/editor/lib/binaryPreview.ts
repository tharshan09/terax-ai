// Classification for the editor's binary / too-large file preview. Kept as a
// pure module so the security-load-bearing decision (when the sandbox-less PDF
// iframe may render) is unit-testable without mounting CodeMirror.

export const IMAGE_EXTS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ico",
]);
export const VIDEO_EXTS = new Set(["mp4", "webm", "ogg", "mov"]);
export const AUDIO_EXTS = new Set(["mp3", "wav", "flac", "aac", "m4a"]);

// Every extension the editor previews through the asset protocol.
export const MEDIA_EXTS = new Set<string>([
  ...IMAGE_EXTS,
  ...VIDEO_EXTS,
  ...AUDIO_EXTS,
  "pdf",
]);

export function extOf(p: string): string {
  return p.split(".").pop()?.toLowerCase() ?? "";
}

export function isMediaPath(p: string): boolean {
  return MEDIA_EXTS.has(extOf(p));
}

export type BinaryPreviewMode =
  | "loading"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "card";

/**
 * Which UI a binary / too-large document should show.
 *
 * The security-load-bearing case is `"pdf"`: that branch renders an iframe
 * WITHOUT a sandbox attribute (WKWebView disables the native PDFKit plugin for
 * any sandbox value), so it must only be reached for a file the backend has
 * confirmed really begins with the `%PDF-` magic bytes (`pdfVerified === true`).
 * A file merely *named* `.pdf` whose bytes are HTML gets `pdfVerified === false`
 * and falls through to the inert `"card"`, never the script-capable iframe.
 *
 * @param ext         lower-case file extension (no dot)
 * @param mediaReady  the asset scope + pdf verification for this path have
 *                    settled (i.e. `mediaReadyPath === path`)
 * @param pdfVerified `null` while the `%PDF-` check is pending, else its result
 */
export function binaryPreviewMode(
  ext: string,
  mediaReady: boolean,
  pdfVerified: boolean | null,
): BinaryPreviewMode {
  const isImage = IMAGE_EXTS.has(ext);
  const isVideo = VIDEO_EXTS.has(ext);
  const isAudio = AUDIO_EXTS.has(ext);
  const isPdf = ext === "pdf";
  const isMedia = isImage || isVideo || isAudio || isPdf;
  // Hold the loader until the asset scope (and, for a pdf, the magic-byte
  // verification) has settled, so the iframe never flashes for an unverified
  // pdf.
  if (isMedia && !mediaReady) return "loading";
  if (isImage) return "image";
  if (isVideo) return "video";
  if (isAudio) return "audio";
  if (isPdf && pdfVerified === true) return "pdf";
  return "card";
}
