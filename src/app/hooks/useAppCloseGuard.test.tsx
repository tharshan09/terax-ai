// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn((_cmd: string) => Promise.resolve());
const close = vi.fn();
const onCloseRequested = vi.fn(() => Promise.resolve(() => {}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string) => invoke(cmd),
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ onCloseRequested, close }),
}));
vi.mock("@/modules/terminal", () => ({
  leafHasForegroundProcess: () => Promise.resolve(false),
  leafIds: () => [],
}));

import { useAppCloseGuard } from "./useAppCloseGuard";

describe("useAppCloseGuard", () => {
  afterEach(cleanup);

  beforeEach(() => {
    invoke.mockClear();
    close.mockClear();
  });

  it("tells the backend when the user declines", () => {
    const { result } = renderHook(() => useAppCloseGuard({ current: [] }));
    act(() => result.current.cancelAppClose());
    expect(invoke).toHaveBeenCalledWith("app_close_declined");
  });

  it("does not decline after a confirm", () => {
    // Radix runs the action button's onClick and then closes the dialog, so
    // "Quit Anyway" reaches cancelAppClose right after confirmAppClose.
    // Declining there would cancel a quit the user just agreed to.
    const { result } = renderHook(() => useAppCloseGuard({ current: [] }));
    act(() => {
      result.current.confirmAppClose();
      result.current.cancelAppClose();
    });
    expect(close).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
  });
});
