// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stand-in with the shape of @tauri-apps/api/event: `listen` resolves an
// unlisten function and calls the handler with an `Event<T>`.
const { listen, handlers } = vi.hoisted(() => {
  const handlers = new Map<string, (e: unknown) => void>();
  return {
    handlers,
    listen: vi.fn((event: string, handler: (e: unknown) => void) => {
      handlers.set(event, handler);
      return Promise.resolve(() => handlers.delete(event));
    }),
  };
});
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { useTabSwipe } from "./useTabSwipe";

const root = createRef<HTMLDivElement>();

/** Makes `document.querySelectorAll(":hover")` return `els`; other queries
 *  run as usual. Returns the restore function. */
function hoverOver(...els: Element[]): () => void {
  const original = document.querySelectorAll.bind(document);
  const spy = vi
    .spyOn(document, "querySelectorAll")
    .mockImplementation(((selector: string) =>
      selector === ":hover"
        ? (els as unknown as NodeListOf<Element>)
        : original(selector)) as typeof document.querySelectorAll);
  return () => spy.mockRestore();
}

async function swipe(dir: number) {
  await act(async () => {});
  const handler = handlers.get("terax:tab-swipe");
  if (!handler) throw new Error("terax:tab-swipe has no listener");
  act(() => handler({ event: "terax:tab-swipe", id: 1, payload: dir }));
}

beforeEach(() => {
  handlers.clear();
  listen.mockClear();
});

afterEach(cleanup);

describe("useTabSwipe", () => {
  it("[AC-11] precondition: nothing is under the pointer", () => {
    expect(document.querySelectorAll(":hover")).toHaveLength(0);
  });

  it("[AC-11] does not switch while shouldDefer says so", async () => {
    const onSwipe = vi.fn();
    const shouldDefer = vi.fn(() => true);
    renderHook(() => useTabSwipe(root, onSwipe, shouldDefer));
    await swipe(1);
    expect(shouldDefer).toHaveBeenCalledWith(null);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("[AC-11] switches with 1 when shouldDefer says no", async () => {
    const onSwipe = vi.fn();
    renderHook(() => useTabSwipe(root, onSwipe, () => false));
    await swipe(1);
    expect(onSwipe).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("[AC-11] switches with 1 as before without shouldDefer", async () => {
    const onSwipe = vi.fn();
    renderHook(() => useTabSwipe(root, onSwipe));
    await swipe(1);
    expect(onSwipe).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("[AC-11] asks the latest shouldDefer without re-subscribing", async () => {
    const onSwipe = vi.fn();
    const { rerender } = renderHook(
      ({ defer }) => useTabSwipe(root, onSwipe, () => defer),
      { initialProps: { defer: true } },
    );
    await swipe(1);
    expect(onSwipe).not.toHaveBeenCalled();
    rerender({ defer: false });
    await swipe(-1);
    expect(onSwipe).toHaveBeenCalledExactlyOnceWith(-1);
    expect(listen).toHaveBeenCalledTimes(1);
  });

  it("[AC-11] lets a data-no-tab-swipe opt-out win before shouldDefer is asked", async () => {
    const box = document.createElement("div");
    box.setAttribute("data-no-tab-swipe", "");
    document.body.append(box);
    const restore = hoverOver(box);
    try {
      const onSwipe = vi.fn();
      const shouldDefer = vi.fn(() => false);
      renderHook(() => useTabSwipe(root, onSwipe, shouldDefer));
      await swipe(1);
      expect(onSwipe).not.toHaveBeenCalled();
      expect(shouldDefer).not.toHaveBeenCalled();
    } finally {
      restore();
      box.remove();
    }
  });

  it("[AC-11] hands the hovered element itself to shouldDefer", async () => {
    const outer = document.createElement("div");
    const target = document.createElement("span");
    outer.append(target);
    document.body.append(outer);
    // `:hover` lists ancestors first; the deepest element comes last.
    const restore = hoverOver(outer, target);
    try {
      const onSwipe = vi.fn();
      const shouldDefer = vi.fn((_el: Element | null) => false);
      renderHook(() => useTabSwipe(root, onSwipe, shouldDefer));
      await swipe(1);
      expect(shouldDefer).toHaveBeenCalledTimes(1);
      expect(shouldDefer.mock.calls[0]?.[0]).toBe(target);
      expect(onSwipe).toHaveBeenCalledExactlyOnceWith(1);
    } finally {
      restore();
      outer.remove();
    }
  });
});
