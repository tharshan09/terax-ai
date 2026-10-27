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
  isDisabled?: (id: ShortcutId, e: KeyboardEvent) => boolean;
};

export type ShortcutVerdict = "run" | "swallow" | "native" | "skip";

type VerdictEvent = Pick<KeyboardEvent, "repeat" | "target">;

const NATIVE_HISTORY_SHORTCUTS: ReadonlySet<ShortcutId> = new Set([
  "editor.undo",
  "editor.redo",
]);

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
  shortcut: Pick<Shortcut, "id" | "allowRepeat">,
  e: VerdictEvent,
): ShortcutVerdict {
  const held = e.repeat && !shortcut.allowRepeat;
  // A held key would start overlapping writes that trip the disk-conflict
  // check, and a field outside the editor is not what the user means to save.
  if (shortcut.id === "editor.save") {
    return held || editableOutsideEditor(e) ? "swallow" : "run";
  }
  if (held) return "skip";
  if (NATIVE_HISTORY_SHORTCUTS.has(shortcut.id) && editableOutsideEditor(e)) {
    return "native";
  }
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
        const verdict = shortcutVerdict(s, e);
        if (verdict === "skip") continue;
        if (options?.isDisabled?.(s.id, e)) return;
        const h = handlers[s.id];
        if (verdict === "native" || !h) return;
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
