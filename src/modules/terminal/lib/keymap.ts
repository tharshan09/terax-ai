export type TerminalKeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "key" | "code"
>;

export type PlatformOpts = { isMac: boolean };

export function terminalWordNavigationSequence(event: TerminalKeyEvent): string | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) return null;
  if (event.key === "ArrowLeft" || event.code === "ArrowLeft") return "\x1bb";
  if (event.key === "ArrowRight" || event.code === "ArrowRight") return "\x1bf";
  return null;
}

/** Cmd+Left/Right → readline line-start (Ctrl+A) / line-end (Ctrl+E).
 * macOS-only — Cmd doesn't exist as a navigation modifier elsewhere. */
export function terminalLineNavigationSequence(
  event: TerminalKeyEvent,
  opts: PlatformOpts,
): string | null {
  if (!opts.isMac) return null;
  if (!event.metaKey || event.altKey || event.ctrlKey) return null;
  if (event.key === "ArrowLeft" || event.code === "ArrowLeft") return "\x01";
  if (event.key === "ArrowRight" || event.code === "ArrowRight") return "\x05";
  return null;
}

/** Native copy/paste chords: the platform's standard shortcut without Shift —
 *  Cmd+C/Cmd+V on macOS, Ctrl+C/Ctrl+V elsewhere. Shift/Alt must be absent so
 *  these never collide with the explicit Ctrl+Shift+C/V shortcuts or with
 *  Alt-modified word ops. Copy is selection-aware at the call site: with no
 *  selection the caller lets Ctrl+C fall through to the PTY as SIGINT. */
function isNativeChord(event: TerminalKeyEvent, isMac: boolean): boolean {
  // A Shift-held chord is the explicit Ctrl+Shift+C/V path, handled separately.
  if (event.altKey || event.shiftKey) return false;
  return isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
}

const LATIN_LETTER = /^[a-z]$/i;

// The physical key counts only on a non-Latin layout, so Dvorak Cmd+K stays K.
export function isChordLetter(
  event: TerminalKeyEvent,
  letter: string,
): boolean {
  const { key } = event;
  if (LATIN_LETTER.test(key)) return key.toLowerCase() === letter;
  return event.code === `Key${letter.toUpperCase()}`;
}

export function isTerminalCopyChord(
  event: TerminalKeyEvent,
  opts: PlatformOpts,
): boolean {
  return isNativeChord(event, opts.isMac) && isChordLetter(event, "c");
}

export function isTerminalPasteChord(
  event: TerminalKeyEvent,
  opts: PlatformOpts,
): boolean {
  return isNativeChord(event, opts.isMac) && isChordLetter(event, "v");
}

/** Modifier+Backspace deletion:
 *   macOS  Cmd+Backspace    → Ctrl+U (kill-to-line-start)
 *   macOS  Option+Backspace → Ctrl+W (kill-word-backward)
 *   Other  Ctrl+Backspace   → Ctrl+W (kill-word-backward)
 */
export function terminalDeleteSequence(
  event: TerminalKeyEvent,
  opts: PlatformOpts,
): string | null {
  if (event.key !== "Backspace" && event.code !== "Backspace") return null;
  if (opts.isMac) {
    if (event.metaKey && !event.altKey && !event.ctrlKey) return "\x15";
    if (event.altKey && !event.metaKey && !event.ctrlKey) return "\x17";
    return null;
  }
  if (event.ctrlKey && !event.altKey && !event.metaKey) return "\x17";
  return null;
}
