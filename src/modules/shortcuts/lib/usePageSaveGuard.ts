import { useEffect } from "react";
import { MOD_S, matchBinding } from "../shortcuts";

// WKWebView opens "Save Page" for an unprevented Mod+S (crynta/terax-ai#969). Capture
// beats a field's stopPropagation; only the default is cancelled, the key still propagates.
export function usePageSaveGuard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matchBinding(e, MOD_S)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, []);
}
