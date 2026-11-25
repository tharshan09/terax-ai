import { extOf, IMAGE_EXTS } from "@/modules/editor/lib/binaryPreview";
import type { TabKind } from "./zenChrome";

/** The part of the active tab the Esc rule looks at. */
export type ZenEscapeTab = { kind: TabKind; path?: string };

/**
 * How Esc is treated per tab kind while zen is on:
 * - `preview`: the tab shows a rendered preview, Esc leaves zen;
 * - `media`: an editor tab, Esc leaves zen only if it shows an image or a PDF;
 * - `program`: Esc belongs to the program (shell, Claude Code, Vim, the page of
 *   a web preview, a diff view) and never leaves zen.
 * A `Record` on purpose: a new tab kind does not compile until it is placed
 * here, so it never takes Esc away from a program silently.
 */
const ESC_IN_ZEN: Record<TabKind, "preview" | "media" | "program"> = {
  html: "preview",
  markdown: "preview",
  editor: "media",
  terminal: "program",
  preview: "program",
  "ai-diff": "program",
  "git-diff": "program",
  "git-history": "program",
  "git-commit-file": "program",
};

/**
 * Extensions an editor tab shows as an image or PDF preview. SVG is left out:
 * it is text, so the editor opens it in CodeMirror, where Esc belongs to the
 * editor.
 */
const EDITOR_PREVIEW_EXTS: ReadonlySet<string> = new Set([
  ...[...IMAGE_EXTS].filter((ext) => ext !== "svg"),
  "pdf",
]);

function showsPreview(tab: ZenEscapeTab | undefined): boolean {
  if (!tab) return false;
  const rule = ESC_IN_ZEN[tab.kind];
  if (rule === "preview") return true;
  if (rule === "media") {
    return tab.path !== undefined && EDITOR_PREVIEW_EXTS.has(extOf(tab.path));
  }
  return false;
}

/**
 * Whether the native Esc monitor should be armed: only in zen and only while
 * the active tab shows a preview (HTML, Markdown, an image or a PDF).
 */
export function zenEscapeArmed(
  zenOn: boolean,
  activeTab: ZenEscapeTab | undefined,
): boolean {
  return zenOn && showsPreview(activeTab);
}

/**
 * Whether an Esc press leaves zen: in the armed cases, and only while no
 * dialog or menu is open (that Esc closes the overlay instead).
 */
export function shouldExitZenOnEscape(
  zenOn: boolean,
  activeTab: ZenEscapeTab | undefined,
  overlayOpen: boolean,
): boolean {
  return zenEscapeArmed(zenOn, activeTab) && !overlayOpen;
}

type EscapeKey = Pick<
  KeyboardEvent,
  "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "isComposing"
>;

/** Esc without any modifier and outside an IME composition. */
export function isPlainEscape(e: EscapeKey): boolean {
  return (
    e.key === "Escape" &&
    !e.altKey &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    !e.isComposing
  );
}

/**
 * Overlays that react to Esc themselves, each with the marker it carries while
 * it is on screen. An Esc while one of them is open belongs to it and keeps zen
 * on. `:not([data-state="closed"])` skips Radix content kept mounted for its
 * exit animation.
 */
export const ESC_OVERLAY_SELECTORS: Record<string, string> = {
  // Radix Dialog, Sheet, Popover, cmdk CommandDialog (command palette, tmux
  // switcher, agent mission control), Streamdown table/mermaid fullscreen.
  dialog: '[role="dialog"]:not([data-state="closed"])',
  alertDialog: '[role="alertdialog"]:not([data-state="closed"])',
  // Radix DropdownMenu, ContextMenu, Menubar content.
  menu: '[role="menu"]:not([data-state="closed"])',
  // Radix Select content. Only an open popup: the source control file list is
  // a permanent `role="listbox"` without `data-state` and owns no Esc.
  selectListbox: '[role="listbox"][data-state="open"]',
  tooltip: '[role="tooltip"]:not([data-state="closed"])',
  hoverCard: '[data-slot="hover-card-content"]:not([data-state="closed"])',
  // Streamdown's link safety dialog (role="button", closes on document Esc).
  streamdownLinkSafety: '[data-streamdown="link-safety-modal"]',
  // The AI mini window ignores Esc only while its own field has focus; it is
  // open either way, so zen stays on either way.
  aiMiniWindow: '[data-ai-mini-window]:not([data-state="closed"])',
  aiSelectionPopup: '[data-selection-ask-ai]:not([data-state="closed"])',
  // App wraps overlays without a marker of their own (the tab switcher HUD).
  appMarked: "[data-esc-overlay]",
};

const OPEN_OVERLAY_SELECTOR = Object.values(ESC_OVERLAY_SELECTORS).join(", ");

/** Sonner collapses its toast list on Esc while focus is inside it. */
const FOCUS_OWNS_ESC_SELECTOR = "[data-sonner-toaster]";

/**
 * An overlay that owns Esc is open in `doc` (see ESC_OVERLAY_SELECTORS), or
 * focus sits in the toast list.
 */
export function isOverlayOpen(doc: Document): boolean {
  if (doc.querySelector(OPEN_OVERLAY_SELECTOR) !== null) return true;
  return doc.activeElement?.closest(FOCUS_OWNS_ESC_SELECTOR) != null;
}
