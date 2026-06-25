import { useEffect, useRef } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";

// Applies the optional UI-font preferences to the document as CSS-variable
// overrides, mirroring how useZoom drives `--app-zoom`. Both default to blank,
// in which case the property is removed so the bundled defaults apply:
//
//   sans  → `--ui-font-sans`, which `--font-sans` (and thus every `font-sans`
//           utility, inlined at build time) resolves through; falls back to
//           the bundled Inter when unset.
//   mono  → `--font-mono`, which the `font-mono` utility already reads via
//           var(); falls back to Tailwind's system mono stack when unset.
//
// The terminal font (`terminalFontFamily`) and the editor's CodeMirror font are
// deliberately untouched — this is strictly the app chrome.
function applyFont(cssVar: string, value: string): void {
  const root = document.documentElement;
  const family = value.trim();
  if (family) root.style.setProperty(cssVar, family);
  else root.style.removeProperty(cssVar);
}

export function useUiFonts(): void {
  const uiFontFamily = usePreferencesStore((s) => s.uiFontFamily);
  const uiMonoFontFamily = usePreferencesStore((s) => s.uiMonoFontFamily);
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const lastSans = useRef<string | null>(null);
  const lastMono = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (lastSans.current !== uiFontFamily) {
      lastSans.current = uiFontFamily;
      applyFont("--ui-font-sans", uiFontFamily);
    }
    if (lastMono.current !== uiMonoFontFamily) {
      lastMono.current = uiMonoFontFamily;
      applyFont("--font-mono", uiMonoFontFamily);
    }
  }, [hydrated, uiFontFamily, uiMonoFontFamily]);
}
