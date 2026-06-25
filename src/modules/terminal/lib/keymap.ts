export type TerminalKeyEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "metaKey" | "key" | "code"
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

/** Linux/IBus delivers a committed non-Latin character (compose key, dead key,
 * pinyin candidate, Cyrillic, accented letter) through BOTH a keydown and the
 * textarea input event, so xterm forwards it to the PTY twice. On Linux we
 * suppress the keydown copy (return false to xterm without preventing default)
 * and let the single input-event copy through.
 *
 * Scoped to a lone non-ASCII code point with no Ctrl/Alt/Meta, so ASCII keys
 * and shortcuts (including AltGr combos, which carry Ctrl+Alt) are never
 * touched. NOT applied on macOS/Windows: their WebKit/IME paths deliver such
 * input once (or under-deliver), where suppressing the keydown would drop the
 * character. */
export function isLinuxImeDuplicateKeydown(
  event: TerminalKeyEvent,
  opts: { isLinux: boolean },
): boolean {
  if (!opts.isLinux) return false;
  if (event.ctrlKey || event.altKey || event.metaKey) return false;
  const codePoints = [...event.key];
  return codePoints.length === 1 && (codePoints[0].codePointAt(0) ?? 0) > 0x7f;
}
