// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the mocked module footprint minimal: `useClaudeStatus` only needs
// `ptyIdForLeaf` from the (heavy, xterm-backed) terminal session module.
vi.mock("@/modules/terminal/lib/useTerminalSession", () => ({
  ptyIdForLeaf: () => 1,
}));

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import type { ClaudeStatus } from "./useClaudeStatus";
import { useClaudeStatus } from "./useClaudeStatus";

const POLL_MS = 2000;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

// Native microtask chains (await invoke -> catch/finally -> setState) settle
// over several ticks of the microtask queue; fake timers don't advance that
// queue on their own, so drain it explicitly rather than guessing exactly
// how many `await`s the implementation has.
async function flushMicrotasks(times = 6) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

function Harness({
  capture,
}: {
  capture: (s: ClaudeStatus | null) => void;
}) {
  capture(useClaudeStatus(1, true));
  return null;
}

describe("useClaudeStatus poll guards (W2a)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    setHidden(false);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not overlap invoke calls when a roundtrip outlives POLL_MS", async () => {
    let resolveFirst: (value: ClaudeStatus | null) => void = () => {};
    invokeMock.mockImplementationOnce(
      () =>
        new Promise<ClaudeStatus | null>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    await act(async () => {
      render(<Harness capture={() => {}} />);
      await flushMicrotasks();
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    // Two further interval ticks fire while the first invoke is still
    // unresolved (simulates an SSH roundtrip slower than POLL_MS) - both
    // must be skipped, never piling up a second concurrent invoke.
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
      await flushMicrotasks();
    });
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
      await flushMicrotasks();
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    // Resolve the stuck call - the guard resets in `finally`, so the very
    // next tick is allowed to invoke again.
    invokeMock.mockResolvedValueOnce(null);
    await act(async () => {
      resolveFirst(null);
      await flushMicrotasks();
    });
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
      await flushMicrotasks();
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("skips the tick without invoking while the document is hidden", async () => {
    invokeMock.mockResolvedValue(null);
    await act(async () => {
      render(<Harness capture={() => {}} />);
      await flushMicrotasks();
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    setHidden(true);
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
      await flushMicrotasks();
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    // Becoming visible again needs no dedicated listener - the next regular
    // interval tick just polls normally.
    setHidden(false);
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
      await flushMicrotasks();
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });

  it("resets the guard after a rejected invoke so the next tick polls normally", async () => {
    invokeMock.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      render(<Harness capture={() => {}} />);
      await flushMicrotasks();
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);

    invokeMock.mockResolvedValueOnce(null);
    await act(async () => {
      vi.advanceTimersByTime(POLL_MS);
      await flushMicrotasks();
    });
    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});
