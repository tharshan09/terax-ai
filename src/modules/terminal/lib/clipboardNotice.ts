import { toast } from "sonner";

// Rate-limited, low-key notice that a terminal program set the system
// clipboard via OSC 52. Legitimate (tmux/vim copy) and malicious (forged
// sequence in command output) writes look identical at this layer, so the
// point is awareness, not blocking — surfaced at most once per window so a
// burst of yanks doesn't spam. Kept out of osc-handlers.ts so that module
// stays free of the toast dependency and easily unit-tested.
const MIN_INTERVAL_MS = 4000;
let lastShownAt = 0;

export function notifyClipboardWrite(): void {
  const now = Date.now();
  if (now - lastShownAt < MIN_INTERVAL_MS) return;
  lastShownAt = now;
  toast("Clipboard set by a terminal program", { duration: 2000 });
}
