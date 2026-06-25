import { openPath } from "@tauri-apps/plugin-opener";

// Open a local file/folder with the operating system's default handler
// (Preview, Word, VLC, …) for types Terax can't render itself. Called only
// with a path the user explicitly picked (explorer context menu, or the
// "preview not supported" fallback), and never with the `openWith` argument,
// so the OS default application is used rather than launching a chosen binary.
// Best-effort: a remote (SSH) path has no local equivalent and simply fails
// here, matching how reveal-in-file-manager already behaves.
export async function openWithDefaultApp(path: string): Promise<void> {
  try {
    await openPath(path);
  } catch (e) {
    console.error("openPath failed:", e);
  }
}
