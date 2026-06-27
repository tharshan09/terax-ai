import { create } from "zustand";

/**
 * Whether the Claude Code stats statusLine wrapper is installed locally (the
 * user's opt-in). Shared so the config toggle and the App-level SSH
 * reconciler agree without prop-drilling: when enabled, App installs the
 * wrapper on each connected SSH host; when disabled, it removes them again.
 * `null` until first read.
 */
type ClaudeStatsState = {
  enabled: boolean | null;
  setEnabled: (enabled: boolean | null) => void;
};

export const useClaudeStatsStore = create<ClaudeStatsState>((set) => ({
  enabled: null,
  setEnabled: (enabled) => set({ enabled }),
}));
