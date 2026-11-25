import { create } from "zustand";

type ZenState = {
  /** Zen mode is on. Not persisted: every launch starts with zen off. */
  on: boolean;
  enterZen: () => void;
  exitZen: () => void;
  toggleZen: () => void;
};

/**
 * The only writer of the zen state. The shortcut `view.zenMode`, the zen toggle
 * button and Esc over a preview (useZenEscape) all go through these actions;
 * everything else only reads `on`.
 */
export const useZenStore = create<ZenState>((set, get) => ({
  on: false,
  enterZen: () => {
    if (!get().on) set({ on: true });
  },
  exitZen: () => {
    if (get().on) set({ on: false });
  },
  toggleZen: () => set({ on: !get().on }),
}));
