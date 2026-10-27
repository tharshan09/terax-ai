import { useEffect } from "react";
import { MOD_PROP } from "@/lib/platform";
import { type KeyBinding, matchBinding } from "../shortcuts";

const PAGE_SAVE: KeyBinding = { [MOD_PROP]: true, key: "s" };

// WKWebView opens "Save Page" for a Mod+S nobody claimed (crynta/terax-ai#969);
// the bubble phase lets focused surfaces such as CodeMirror claim it first.
export function usePageSaveGuard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.defaultPrevented && matchBinding(e, PAGE_SAVE)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
