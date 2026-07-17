import { invoke } from "@tauri-apps/api/core";

/** Write text to the system clipboard, reliable even outside a user gesture.
 *
 * WebKit's navigator.clipboard.writeText requires transient user activation.
 * Asynchronous writers — an OSC 52 sequence arriving from PTY output after a
 * tmux/SSH round trip — never have it, so those writes reject and the
 * clipboard silently keeps its old content. The Rust pasteboard command has
 * no such restriction; navigator.clipboard remains as the fallback for
 * non-macOS builds and non-Tauri contexts (tests). Rejects when both fail.
 */
export async function writeSystemClipboard(text: string): Promise<void> {
  try {
    await invoke("clipboard_write_text", { text });
  } catch {
    await navigator.clipboard.writeText(text);
  }
}
