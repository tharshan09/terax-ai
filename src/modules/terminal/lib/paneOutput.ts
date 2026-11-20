import { feedPaneOutput, terminalEnded } from "@/modules/ports/lib/portsStore";
import type { WorkspaceEnv } from "@/modules/workspace";

type Grid = { write(bytes: Uint8Array): void };
type Ring = { push(bytes: Uint8Array): void };

// Bytes go to the pane's live grid or, without a renderer slot, to its ring;
// port detection sees them either way, under the env the PTY was spawned on.
export function routePaneBytes(
  leafId: number,
  env: WorkspaceEnv | null,
  grid: Grid | null,
  ring: Ring,
  bytes: Uint8Array,
): void {
  if (grid) grid.write(bytes);
  else ring.push(bytes);
  feedPaneOutput(leafId, env, bytes);
}

// Whatever the exit code: a dropped connection is exactly when forwards of
// that server may have died with it.
export function paneExited(env: WorkspaceEnv | null): void {
  terminalEnded(env);
}
