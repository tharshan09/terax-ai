// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useWindowHidden, WINDOW_HIDDEN_ATTR } from "./windowVisibility";

type WindowVisibility = typeof import("./windowVisibility");

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState, dispatch = true) {
  visibility = next;
  if (dispatch) document.dispatchEvent(new Event("visibilitychange"));
}

function hasAttr(): boolean {
  return document.documentElement.hasAttribute(WINDOW_HIDDEN_ATTR);
}

// Each case gets its own module state; instances from earlier cases keep
// listening but derive the same state from the same document.
async function freshModule(): Promise<WindowVisibility> {
  vi.resetModules();
  return import("./windowVisibility");
}

beforeAll(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => visibility === "hidden",
  });
});

afterEach(() => {
  setVisibility("visible");
  document.documentElement.removeAttribute(WINDOW_HIDDEN_ATTR);
});

describe("windowVisibility", () => {
  it("[AC-1] follows visibilitychange, mirrors the attribute and notifies each change once", async () => {
    const m = await freshModule();
    m.installWindowVisibility();
    const listener = vi.fn();
    const unsubscribe = m.subscribeWindowHidden(listener);
    expect(m.isWindowHidden()).toBe(false);
    expect(hasAttr()).toBe(false);

    setVisibility("hidden");
    expect(m.isWindowHidden()).toBe(true);
    expect(hasAttr()).toBe(true);

    setVisibility("visible");
    expect(m.isWindowHidden()).toBe(false);
    expect(hasAttr()).toBe(false);

    expect(listener.mock.calls).toEqual([[true], [false]]);
    unsubscribe();
  });

  it("[AC-2] ignores focus changes of a visible window", async () => {
    const m = await freshModule();
    m.installWindowVisibility();
    const listener = vi.fn();
    const unsubscribe = m.subscribeWindowHidden(listener);

    window.dispatchEvent(new Event("blur"));
    expect(m.isWindowHidden()).toBe(false);
    window.dispatchEvent(new Event("focus"));
    expect(m.isWindowHidden()).toBe(false);

    expect(hasAttr()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("[AC-3] notifies subscribers before dispatchEvent returns", async () => {
    const m = await freshModule();
    m.installWindowVisibility();
    const listener = vi.fn();
    const unsubscribe = m.subscribeWindowHidden(listener);

    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    const callsWhenDispatchReturned = listener.mock.calls.length;

    expect(callsWhenDispatchReturned).toBe(1);
    expect(listener).toHaveBeenCalledWith(true);
    unsubscribe();
  });

  it("[AC-4] starts hidden for a window launched hidden; showing does not flush, minimizing flushes once", async () => {
    setVisibility("hidden", false);
    const m = await freshModule();
    m.installWindowVisibility();
    expect(m.isWindowHidden()).toBe(true);
    expect(hasAttr()).toBe(true);

    // Same rule as the space persistence: write only when the window goes away.
    const flush = vi.fn();
    const unsubscribe = m.subscribeWindowHidden((hidden) => {
      if (hidden) flush();
    });

    setVisibility("visible");
    expect(m.isWindowHidden()).toBe(false);
    expect(hasAttr()).toBe(false);
    expect(flush).not.toHaveBeenCalled();

    setVisibility("hidden");
    expect(flush).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("[AC-5] reads the document before installation and delivers changes to an earlier subscription", async () => {
    const m = await freshModule();
    setVisibility("hidden", false);
    expect(m.isWindowHidden()).toBe(true);
    setVisibility("visible", false);
    expect(m.isWindowHidden()).toBe(false);

    const listener = vi.fn();
    const unsubscribe = m.subscribeWindowHidden(listener);
    setVisibility("hidden");
    expect(listener).toHaveBeenCalledWith(true);
    expect(m.isWindowHidden()).toBe(true);
    expect(hasAttr()).toBe(true);

    m.installWindowVisibility();
    setVisibility("visible");
    expect(listener.mock.calls).toEqual([[true], [false]]);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", async () => {
    const m = await freshModule();
    const listener = vi.fn();
    const unsubscribe = m.subscribeWindowHidden(listener);
    unsubscribe();

    setVisibility("hidden");
    expect(listener).not.toHaveBeenCalled();
    expect(m.isWindowHidden()).toBe(true);
  });

  it("keeps notifying the other subscribers when one throws", async () => {
    const m = await freshModule();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = m.subscribeWindowHidden(() => {
      throw new Error("boom");
    });
    const listener = vi.fn();
    const unsubscribe = m.subscribeWindowHidden(listener);

    setVisibility("hidden");
    expect(listener).toHaveBeenCalledWith(true);
    expect(error).toHaveBeenCalledOnce();

    failing();
    unsubscribe();
    error.mockRestore();
  });

  it("re-renders hook consumers on every change", () => {
    const { result, unmount } = renderHook(() => useWindowHidden());
    expect(result.current).toBe(false);

    act(() => setVisibility("hidden"));
    expect(result.current).toBe(true);

    act(() => setVisibility("visible"));
    expect(result.current).toBe(false);
    unmount();
  });
});
