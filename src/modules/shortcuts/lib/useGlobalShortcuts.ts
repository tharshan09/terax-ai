import { useEffect, useRef } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  SHORTCUTS,
  matchBinding,
  type Shortcut,
  type ShortcutId,
} from "../shortcuts";

export type ShortcutHandler = (e: KeyboardEvent) => void;
export type ShortcutHandlers = Partial<Record<ShortcutId, ShortcutHandler>>;

export type UseGlobalShortcutsOptions = {
  isDisabled?: (shortcut: Shortcut, e: KeyboardEvent) => boolean;
};

/** run: claim and handle; swallow: claim only; block: prevent the default but
 *  let other listeners see the key; native: leave it alone; skip: next shortcut. */
export type ShortcutVerdict = "run" | "swallow" | "block" | "native" | "skip";

type VerdictEvent = Pick<KeyboardEvent, "repeat" | "target">;

/** A focused input, textarea or contenteditable outside the CodeMirror
 *  editor owns its own undo/redo history; Cmd+Z / Cmd+Shift+Z there must not
 *  mutate the editor document behind it (commit box, rename field, chat). */
function editableOutsideEditor(e: VerdictEvent): boolean {
  const target = e.target;
  if (!(target instanceof Element)) return false;
  if (target.closest(".cm-editor")) return false;
  return (
    target.closest(
      'input, textarea, [contenteditable]:not([contenteditable="false"])',
    ) !== null
  );
}

export function shortcutVerdict(
  shortcut: Pick<
    Shortcut,
    "allowRepeat" | "onRepeat" | "inField" | "whenDisabled"
  >,
  e: VerdictEvent,
  isDisabled: () => boolean = () => false,
): ShortcutVerdict {
  const held = e.repeat && !shortcut.allowRepeat;
  if (held && shortcut.onRepeat !== "swallow") return "skip";
  if (isDisabled()) {
    return shortcut.whenDisabled === "preventDefault" ? "block" : "native";
  }
  if (held) return "swallow";
  if (shortcut.inField && editableOutsideEditor(e)) return shortcut.inField;
  return "run";
}

export function useGlobalShortcuts(
  handlers: ShortcutHandlers,
  options?: UseGlobalShortcutsOptions,
) {
  const latest = useRef({ handlers, options });
  latest.current = { handlers, options };

  // Access the shortcuts from the store
  const userShortcuts = usePreferencesStore((s) => s.shortcuts);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { handlers, options } = latest.current;
      for (const s of SHORTCUTS) {
        const bindings = userShortcuts[s.id] || s.defaultBindings;
        const isMatch = bindings.some((b) => matchBinding(e, b, s.id));
        if (!isMatch) continue;
        const verdict = shortcutVerdict(
          s,
          e,
          () => options?.isDisabled?.(s, e) ?? false,
        );
        if (verdict === "skip") continue;
        if (verdict === "native") return;
        if (verdict === "block") {
          e.preventDefault();
          return;
        }
        const h = handlers[s.id];
        if (!h) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (verdict === "run") h(e);
        return;
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [userShortcuts]);
}
