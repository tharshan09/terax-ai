/**
 * Whether a terminal leaf should be treated as on-screen for PTY backpressure.
 *
 * The leaf's PTY flusher (Rust) coalesces output harder while the leaf is
 * hidden, so we tell it "hidden" whenever the leaf is off screen for ANY
 * reason: its tab/pane isn't the active one (`leafVisible === false`), OR the
 * whole window is hidden — minimized, occluded, on another Space
 * (`pageHidden === true`), in which case even the active tab is off screen.
 *
 * Keyed on page-hidden, never on window focus: a visible-but-unfocused window
 * (another app in front, Terax still on screen) is still rendering live and
 * must not be throttled.
 */
export function visibilityHint(
  leafVisible: boolean,
  pageHidden: boolean,
): boolean {
  return leafVisible && !pageHidden;
}
