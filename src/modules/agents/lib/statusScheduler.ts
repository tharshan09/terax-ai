import type { AgentSignalKind, AgentStatus } from "./types";

// A `finished` marker fires at every autonomous turn boundary, not just at the
// end of a run. Delay the drop to "waiting" so a continuation (the next
// working/tool marker) cancels it and the tab indicator does not flicker to the
// attention dot mid-run. The dot only appears on a genuine idle/waiting.
export const FINISHED_TO_WAITING_DELAY_MS = 2500;

type StatusEffect =
  | { kind: "set"; status: AgentStatus }
  | { kind: "schedule"; status: AgentStatus }
  | { kind: "cancel" };

// Pure decision: how a signal maps onto the debounced status transition.
// `attention`/`working` are immediate; `finished` is debounced; `started` and
// `exited` only cancel a pending finished-timer (status is set elsewhere).
export function statusEffectForSignal(kind: AgentSignalKind): StatusEffect {
  switch (kind) {
    case "working":
      return { kind: "set", status: "working" };
    case "attention":
      return { kind: "set", status: "waiting" };
    case "finished":
      return { kind: "schedule", status: "waiting" };
    case "started":
    case "exited":
      return { kind: "cancel" };
  }
}

type SetStatus = (leafId: number, status: AgentStatus) => void;

export type StatusScheduler = {
  apply: (leafId: number, kind: AgentSignalKind) => void;
  dispose: () => void;
};

// Owns the per-leaf finished-timers. Every signal first cancels any pending
// timer for that leaf, so working/attention/started/exited all pre-empt a
// debounced drop to waiting. Timers are cleared on dispose to avoid leaks.
export function createStatusScheduler(setStatus: SetStatus): StatusScheduler {
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  const clear = (leafId: number) => {
    const t = timers.get(leafId);
    if (t !== undefined) {
      clearTimeout(t);
      timers.delete(leafId);
    }
  };

  return {
    apply(leafId, kind) {
      clear(leafId);
      const effect = statusEffectForSignal(kind);
      if (effect.kind === "set") {
        setStatus(leafId, effect.status);
      } else if (effect.kind === "schedule") {
        const status = effect.status;
        timers.set(
          leafId,
          setTimeout(() => {
            timers.delete(leafId);
            setStatus(leafId, status);
          }, FINISHED_TO_WAITING_DELAY_MS),
        );
      }
    },
    dispose() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    },
  };
}
