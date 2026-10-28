import { useLayoutEffect, useRef, useState } from "react";

type Props = {
  initial: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
};

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
  // A blur inside our own focus() call means a focus trap (an open modal
  // menu) took focus straight back; refocusing again would recurse forever.
  const focusingRef = useRef(false);

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
    const focus = () => {
      focusingRef.current = true;
      try {
        el.focus({ preventScroll: true });
      } finally {
        focusingRef.current = false;
      }
      if (el.ownerDocument.activeElement !== el) return;
      const dot = initial.lastIndexOf(".");
      if (dot > 0) el.setSelectionRange(0, dot);
      else el.select();
    };
    focus();
    const raf = requestAnimationFrame(() => focus());
    const timer = setTimeout(() => {
      focus();
      settledRef.current = true;
    }, 170);
    return () => {
      cancelAnimationFrame(raf);
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
          if (focusingRef.current) return;
          focusingRef.current = true;
          try {
            ref.current?.focus({ preventScroll: true });
          } finally {
            focusingRef.current = false;
          }
          return;
        }
        commit();
      }}
      className="flex-1 min-w-0 truncate rounded-sm border border-border bg-background px-1.5 py-0.5 text-xs text-foreground outline-none ring-0 focus:border-ring"
    />
  );
}
