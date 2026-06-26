import { create } from "zustand";
import type { WorkspaceEnv } from "@/modules/workspace";
import { listTmuxSessions, type TmuxSession } from "./tmux";

type State = {
  sessions: TmuxSession[];
  loading: boolean;
  error: string | null;
  /** Re-fetch the session list for `workspace` (defaults to the ambient one).
   *  Called on every switcher open so the list is never stale; no polling. */
  refresh: (workspace?: WorkspaceEnv) => Promise<void>;
};

export const useTmuxSessions = create<State>((set) => ({
  sessions: [],
  loading: false,
  error: null,
  refresh: async (workspace) => {
    set({ loading: true, error: null });
    try {
      const sessions = await listTmuxSessions(workspace);
      set({ sessions, loading: false });
    } catch (e) {
      set({ error: String(e), sessions: [], loading: false });
    }
  },
}));
