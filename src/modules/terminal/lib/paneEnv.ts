import type { WorkspaceEnv } from "@/modules/workspace";

export type PaneEnvSession = {
  disposed: boolean;
  workspace: WorkspaceEnv | undefined;
  spawnEnv: WorkspaceEnv | null;
};

// A tab that names no env spawns on the one active at that moment.
export function spawnEnvFor(
  own: WorkspaceEnv | undefined,
  ambient: () => WorkspaceEnv,
): WorkspaceEnv {
  return own ?? ambient();
}

// The env the PTY was spawned on, as the upload path reads it; null once the
// pane is closed.
export function paneWorkspace(
  s: PaneEnvSession | undefined,
): WorkspaceEnv | null {
  if (!s || s.disposed) return null;
  return s.spawnEnv ?? s.workspace ?? null;
}
