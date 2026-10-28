import { useLayoutEffect, useRef, useState } from "react";

type Props = {
  initial: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
};

type FocusState = { focusing: boolean; landed: boolean };

// A blur inside our own focus() call means a focus trap (an open modal menu)
// took focus straight back; refocusing again would recurse forever.
function takeFocus(
  el: HTMLInputElement,
  initial: string,
  state: FocusState,
): boolean {
  if (state.focusing) return false;
  state.focusing = true;
  try {
    el.focus({ preventScroll: true });
  } finally {
    state.focusing = false;
  }
  if (el.ownerDocument.activeElement !== el) return false;
  if (!state.landed) {
    state.landed = true;
    const dot = initial.lastIndexOf(".");
    if (dot > 0) el.setSelectionRange(0, dot);
    else el.select();
  }
  return true;
}

/**
 * Self-focusing single-line input for rename / create flows in the tree.
 * Enter commits, Escape cancels, blur commits (matches VSCode behavior —
 * dismissing the input is an implicit commit so a typed name isn't lost).
 */
export function InlineInput({
  initial,
  placeholder,
  onCommit,
  onCancel,
}: Props) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  const settledRef = useRef(false);
  const focusRef = useRef<FocusState>({ focusing: false, landed: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Two-tick focus to win against parent click handlers and Radix portal
    // restorations that can steal focus right after mount. Until the second
    // tick lands we treat the input as "unsettled" — any blur during that
    // window is the portal teardown stealing focus, not the user dismissing
    // the input, so we refocus instead of committing an empty value.
    //
    // preventScroll matters here (#123): the input mounts inside the
    // sidebar's flex column, which is small enough that focus-scroll can
    // nudge the parent's scroll position by a fraction of a pixel each
    // cycle. Repeated open/cancel pairs accumulate and walk the tree off
    // the left edge. We're already rendering the input where it should be
    // visible — there is no scroll-into-view we need from focus().
    const state = focusRef.current;
    let watch = 0;
    // Settle only once focus has landed. While a trap holds it, wait for the
    // element it moved focus to to leave the DOM (the menu closed), then retry.
    const settle = () => {
      if (takeFocus(el, initial, state)) {
        settledRef.current = true;
        return;
      }
      const holder = el.ownerDocument.activeElement;
      if (!holder || holder === el.ownerDocument.body) return;
      const wait = () => {
        if (holder.isConnected) watch = requestAnimationFrame(wait);
        else settle();
      };
      watch = requestAnimationFrame(wait);
    };
    takeFocus(el, initial, state);
    const raf = requestAnimationFrame(() => takeFocus(el, initial, state));
    const timer = setTimeout(settle, 170);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(watch);
      clearTimeout(timer);
    };
  }, [initial]);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(value);
  };
  const cancel = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCancel();
  };

  return (
    <input
      ref={ref}
      value={value}
      placeholder={placeholder}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      onBlur={() => {
        if (!settledRef.current) {
          if (ref.current) takeFocus(ref.current, initial, focusRef.current);
          return;
        }
        commit();
      }}
      className="flex-1 min-w-0 truncate rounded-sm border border-border bg-background px-1.5 py-0.5 text-xs text-foreground outline-none ring-0 focus:border-ring"
    />
  );
}
