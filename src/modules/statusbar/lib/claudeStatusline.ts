import type { WorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";

/** Install the Claude Code statusLine wrapper. No `workspace` (or a local one)
 *  targets this machine; an SSH env installs it on that host, where the user's
 *  remote Claude actually runs. Reversible, preserves the user's own statusLine. */
export function enableClaudeStatusline(workspace?: WorkspaceEnv): Promise<void> {
  return invoke("claude_enable_statusline", { workspace });
}

/** Remove the wrapper and restore the user's original statusLine, locally or on
 *  the given SSH host. */
export function disableClaudeStatusline(workspace?: WorkspaceEnv): Promise<void> {
  return invoke("claude_disable_statusline", { workspace });
}

/** Whether our wrapper is currently installed (locally, or on an SSH host). */
export function claudeStatuslineEnabled(
  workspace?: WorkspaceEnv,
): Promise<boolean> {
  return invoke<boolean>("claude_statusline_enabled", { workspace });
}
