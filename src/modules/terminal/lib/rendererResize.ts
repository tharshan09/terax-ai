export type GridSize = { cols: number; rows: number };

// A terminal slot's rendered grid is refit synchronously on every container
// resize, but the matching PTY winsize update is debounced. This returns the
// dimensions still owed to the PTY, or null when the two already agree.
//
// The caller must commit this delta on EVERY teardown path, not only when the
// debounce timer fires. If a leaf is released or evicted mid-debounce the
// pending resize used to be dropped, leaving the PTY winsize behind the grid.
// A multiplexer like tmux positions every pane by absolute coordinates against
// the size it was told, so a stale winsize makes it draw pane content into
// cells that no longer line up with the grid: content bleeds across the pane
// dividers. A collapsed grid never produces a resize: @xterm/addon-fit clamps
// a zero-size container to 2x1, which would squash tmux's layout.
export const MIN_PTY_COLS = 3;
export const MIN_PTY_ROWS = 2;

export function pendingPtyResize(
  grid: GridSize,
  committed: GridSize,
): GridSize | null {
  if (grid.cols < MIN_PTY_COLS || grid.rows < MIN_PTY_ROWS) return null;
  if (grid.cols === committed.cols && grid.rows === committed.rows) return null;
  return { cols: grid.cols, rows: grid.rows };
}
