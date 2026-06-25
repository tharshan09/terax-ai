import { openPath } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";

// Extensions whose OS "open" verb EXECUTES the file (or runs an installer /
// script) rather than just viewing it. "Open with Default App" must refuse
// these: the path can originate from untrusted content — a cloned or synced
// repo with a planted `installer.command`, `setup.bat`, `x.app`,
// `report.pdf.exe`, `evil.desktop` — and a single click would run code.
// Plain source files (.js/.py/.sh-as-text) are intentionally NOT here: their
// default handler is an editor, not an interpreter. Lower-cased, leading dot.
const EXECUTABLE_EXTENSIONS = new Set<string>([
  // macOS
  ".app",
  ".command",
  ".terminal",
  ".tool",
  ".workflow",
  ".action",
  ".scpt",
  ".scptd",
  // Windows
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".pif",
  ".msi",
  ".msp",
  ".cpl",
  ".reg",
  ".hta",
  ".gadget",
  ".inf",
  ".lnk",
  ".ps1",
  ".psm1",
  ".vbs",
  ".vbe",
  ".wsf",
  ".wsh",
  ".jse",
  ".sct",
  ".jar",
  // Linux launchers / self-extracting
  ".desktop",
  ".run",
  ".appimage",
]);

/** True when the path's final extension is one the OS would execute on open.
 * Checks only the LAST extension, so `report.pdf.exe` is caught. Pure. */
export function isLikelyExecutable(path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? path;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false; // no extension, or a leading-dot dotfile
  return EXECUTABLE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

// Open a local file/folder with the operating system's default handler
// (Preview, Word, VLC, …) for types Terax can't render itself. Called only
// with a path the user explicitly picked (explorer context menu, or the
// "preview not supported" fallback), and never with the `openWith` argument,
// so the OS default application is used rather than launching a chosen binary.
// Best-effort: a remote (SSH) path has no local equivalent and simply fails
// here, matching how reveal-in-file-manager already behaves.
export async function openWithDefaultApp(path: string): Promise<void> {
  if (isLikelyExecutable(path)) {
    toast.warning(
      "Won't open this file with the default app — it looks executable. Run it from the terminal if you intend to.",
    );
    return;
  }
  try {
    await openPath(path);
  } catch (e) {
    console.error("openPath failed:", e);
  }
}
