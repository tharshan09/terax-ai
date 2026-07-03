import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createStatusScheduler,
  FINISHED_TO_WAITING_DELAY_MS,
  statusEffectForSignal,
} from "./statusScheduler";
import type { AgentStatus } from "./types";

describe("statusEffectForSignal", () => {
  it("maps working/attention to immediate sets", () => {
    expect(statusEffectForSignal("working")).toEqual({
      kind: "set",
      status: "working",
    });
    expect(statusEffectForSignal("attention")).toEqual({
      kind: "set",
      status: "waiting",
    });
  });

  it("debounces finished and cancels on started/exited", () => {
    expect(statusEffectForSignal("finished")).toEqual({
      kind: "schedule",
      status: "waiting",
    });
    expect(statusEffectForSignal("started")).toEqual({ kind: "cancel" });
    expect(statusEffectForSignal("exited")).toEqual({ kind: "cancel" });
  });
});

describe("createStatusScheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function track() {
    const calls: Array<[number, AgentStatus]> = [];
    const scheduler = createStatusScheduler((leafId, status) =>
      calls.push([leafId, status]),
    );
    return { calls, scheduler };
  }

  it("finished then working within the window ends working, never waiting", () => {
    const { calls, scheduler } = track();
    scheduler.apply(1, "finished");
    vi.advanceTimersByTime(FINISHED_TO_WAITING_DELAY_MS - 1);
    scheduler.apply(1, "working");
    vi.advanceTimersByTime(FINISHED_TO_WAITING_DELAY_MS * 2);
    expect(calls).toEqual([[1, "working"]]);
    expect(calls.some(([, status]) => status === "waiting")).toBe(false);
  });

  it("finished then nothing becomes waiting after the delay", () => {
    const { calls, scheduler } = track();
    scheduler.apply(1, "finished");
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(FINISHED_TO_WAITING_DELAY_MS);
    expect(calls).toEqual([[1, "waiting"]]);
  });

  it("attention is immediate, no debounce", () => {
    const { calls, scheduler } = track();
    scheduler.apply(1, "attention");
    expect(calls).toEqual([[1, "waiting"]]);
  });

  it("attention cancels a pending finished-timer", () => {
    const { calls, scheduler } = track();
    scheduler.apply(1, "finished");
    scheduler.apply(1, "attention");
    vi.advanceTimersByTime(FINISHED_TO_WAITING_DELAY_MS * 2);
    // One immediate waiting from attention; the debounced one was cancelled.
    expect(calls).toEqual([[1, "waiting"]]);
  });

  it("tracks timers per leaf independently", () => {
    const { calls, scheduler } = track();
    scheduler.apply(1, "finished");
    scheduler.apply(2, "finished");
    scheduler.apply(1, "working");
    vi.advanceTimersByTime(FINISHED_TO_WAITING_DELAY_MS);
    expect(calls).toEqual([
      [1, "working"],
      [2, "waiting"],
    ]);
  });

  it("dispose clears pending timers so no leak fires", () => {
    const { calls, scheduler } = track();
    scheduler.apply(1, "finished");
    scheduler.dispose();
    vi.advanceTimersByTime(FINISHED_TO_WAITING_DELAY_MS * 2);
    expect(calls).toEqual([]);
  });
});
