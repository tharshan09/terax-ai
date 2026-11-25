import { isHtmlPath, isMarkdownPath } from "@/lib/utils";
import { extOf, IMAGE_EXTS } from "@/modules/editor/lib/binaryPreview";
import { browserOpenable } from "@/modules/preview-server/lib/browserOpenable";
import type { WorkspaceEnv } from "@/modules/workspace";

/**
 * The surfaces that carry a preview header: the rendered HTML and Markdown
 * tabs, the raw editor view of those two, and the editor's image and PDF
 * preview (including the card shown in their place).
 */
export type PreviewSurface = "html" | "markdown" | "raw" | "image" | "pdf";

export type PreviewHeaderModel = {
  fileName: string;
  /** Reload button; `null` = not shown. */
  reload: { disabled: boolean } | null;
  /** Rendered/Raw toggle; `null` = not shown. */
  view: { mode: "rendered" | "raw"; renderedDisabled: boolean } | null;
  /** "Open in Browser" is shown. */
  openInBrowser: boolean;
  /** Zen toggle is shown. */
  zen: boolean;
};

export type PreviewHeaderInput = {
  surface: PreviewSurface;
  path: string;
  workspace?: WorkspaceEnv;
  /** The raw buffer has unsaved changes. */
  dirty?: boolean;
};

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}

/** Which elements the preview header shows on a surface, and which are locked. */
export function previewHeaderModel({
  surface,
  path,
  workspace,
  dirty = false,
}: PreviewHeaderInput): PreviewHeaderModel {
  const fileName = fileNameOf(path);
  const openInBrowser = browserOpenable(path, workspace);
  switch (surface) {
    case "html":
    case "markdown":
      return {
        fileName,
        reload: { disabled: false },
        view: { mode: "rendered", renderedDisabled: false },
        openInBrowser,
        zen: true,
      };
    case "raw":
      return {
        fileName,
        reload: { disabled: dirty },
        view: { mode: "raw", renderedDisabled: dirty },
        openInBrowser,
        zen: true,
      };
    case "image":
    case "pdf":
      return { fileName, reload: null, view: null, openInBrowser, zen: true };
  }
}

/** Raw editor tabs with a rendered view (Markdown, HTML) get the header. */
export function rawHeaderSurface(path: string): "raw" | null {
  return isMarkdownPath(path) || isHtmlPath(path) ? "raw" : null;
}

/**
 * The editor's binary preview gets the header for images and PDFs; video,
 * audio and every other binary file get none.
 */
export function binaryHeaderSurface(path: string): "image" | "pdf" | null {
  const ext = extOf(path);
  if (IMAGE_EXTS.has(ext)) return "image";
  if (ext === "pdf") return "pdf";
  return null;
}
