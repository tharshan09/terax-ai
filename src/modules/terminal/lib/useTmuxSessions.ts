import { create } from "zustand";
import type { WorkspaceEnv } from "@/modules/workspace";
import { listTmuxSessions, type TmuxSession } from "./tmux";

type State = {
  sessions: TmuxSession[];
  loading: boolean;
  error: string | null;
  /** Monotonic id of the most recently issued refresh; a slower earlier call
   *  must not overwrite a newer one (could show host A's sessions under B). */
  reqId: number;
  /** Re-fetch the session list for `workspace` (defaults to the ambient one).
   *  Called on every switcher open so the list is never stale; no polling. */
  refresh: (workspace?: WorkspaceEnv) => Promise<void>;
};

export const useTmuxSessions = create<State>((set, get) => ({
  sessions: [],
  loading: false,
  error: null,
  reqId: 0,
  refresh: async (workspace) => {
    const req = get().reqId + 1;
    set({ loading: true, error: null, reqId: req });
    try {
      const sessions = await listTmuxSessions(workspace);
      if (get().reqId !== req) return; // a newer refresh superseded this one
      set({ sessions, loading: false });
    } catch (e) {
      if (get().reqId !== req) return;
      set({ error: String(e), sessions: [], loading: false });
    }
  },
}));
