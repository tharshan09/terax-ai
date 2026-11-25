// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stand-ins with the shape of @tauri-apps/api: `invoke` resolves a Promise,
// `listen` resolves an unlisten function and calls the handler with an
// `Event<T>` ({ event, id, payload }).
const { invoke, listen, handlers, unlistened } = vi.hoisted(() => {
  const handlers = new Map<string, (e: unknown) => void>();
  const unlistened: string[] = [];
  return {
    handlers,
    unlistened,
    invoke: vi.fn((_cmd: string, _args?: unknown) => Promise.resolve(null)),
    listen: vi.fn((event: string, handler: (e: unknown) => void) => {
      handlers.set(event, handler);
      return Promise.resolve(() => {
        unlistened.push(event);
        handlers.delete(event);
      });
    }),
  };
});
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { useZenEscape } from "./useZenEscape";
import type { ZenEscapeTab } from "./zenEscape";
import { useZenStore } from "./zenStore";

const html: ZenEscapeTab = { kind: "html", path: "/w/page.html" };
const markdown: ZenEscapeTab = { kind: "markdown", path: "/w/notes.md" };
const terminal: ZenEscapeTab = { kind: "terminal" };

const armCalls = () =>
  invoke.mock.calls
    .filter(([cmd]) => cmd === "zen_escape_arm")
    .map(([, args]) => args);

let eventId = 0;
const emitNative = () =>
  act(() => {
    const handler = handlers.get("terax:zen-escape");
    if (!handler) throw new Error("terax:zen-escape has no listener");
    eventId += 1;
    handler({ event: "terax:zen-escape", id: eventId, payload: null });
  });

const pressEscape = (init: KeyboardEventInit = {}) =>
  act(() => {
    fireEvent.keyDown(document.body, { key: "Escape", ...init });
  });

function mount(tab: ZenEscapeTab | undefined) {
  return renderHook(({ t }) => useZenEscape(t), {
    initialProps: { t: tab },
  });
}

beforeEach(() => {
  invoke.mockClear();
  listen.mockClear();
  handlers.clear();
  unlistened.length = 0;
  useZenStore.setState({ on: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  useZenStore.setState({ on: false });
});

describe("useZenEscape", () => {
  it("[AC-5] arms over html in zen and disarms when the tab turns into a terminal", async () => {
    useZenStore.setState({ on: true });
    const { rerender } = mount(html);
    await act(async () => {});
    expect(armCalls()).toEqual([{ armed: true }]);
    rerender({ t: terminal });
    expect(armCalls()).toEqual([{ armed: true }, { armed: false }]);
  });

  it("[AC-5] leaves zen when terax:zen-escape arrives over html", async () => {
    useZenStore.setState({ on: true });
    mount(html);
    await act(async () => {});
    emitNative();
    expect(useZenStore.getState().on).toBe(false);
  });

  it("[AC-5] leaves zen on a plain Escape in the document over markdown", async () => {
    useZenStore.setState({ on: true });
    mount(markdown);
    await act(async () => {});
    pressEscape();
    expect(useZenStore.getState().on).toBe(false);
  });

  it("[AC-5] keeps zen on Escape in a terminal tab (Esc belongs to the program)", async () => {
    useZenStore.setState({ on: true });
    mount(terminal);
    await act(async () => {});
    pressEscape();
    expect(useZenStore.getState().on).toBe(true);
    expect(armCalls()).toEqual([]);
  });

  it('[AC-5] keeps zen on Escape over markdown while a [role="dialog"] is open', async () => {
    useZenStore.setState({ on: true });
    mount(markdown);
    await act(async () => {});
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    pressEscape();
    expect(useZenStore.getState().on).toBe(true);
  });

  it("[AC-5] keeps zen on Escape with a modifier", async () => {
    useZenStore.setState({ on: true });
    mount(markdown);
    await act(async () => {});
    for (const mod of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
      pressEscape({ [mod]: true });
    }
    expect(useZenStore.getState().on).toBe(true);
  });

  it("[AC-5] ignores a late native event when the active tab is a terminal", async () => {
    useZenStore.setState({ on: true });
    mount(terminal);
    await act(async () => {});
    emitNative();
    expect(useZenStore.getState().on).toBe(true);
  });

  it("[AC-5] ignores the native event of a press the document already handled", async () => {
    const now = vi.spyOn(performance, "now");
    useZenStore.setState({ on: true });
    mount(markdown);
    await act(async () => {});
    // This Esc closes a dialog: zen stays, the dialog goes away.
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.append(dialog);
    now.mockReturnValue(1_000);
    pressEscape();
    dialog.remove();
    // The native event of that same press lands later over IPC.
    now.mockReturnValue(1_100);
    emitNative();
    expect(useZenStore.getState().on).toBe(true);
    // A native event well after it is a new press (focus inside the iframe).
    now.mockReturnValue(2_000);
    emitNative();
    expect(useZenStore.getState().on).toBe(false);
  });

  it("[AC-5] does not arm with zen off and arms once zen turns on over html", async () => {
    mount(html);
    await act(async () => {});
    expect(armCalls()).toEqual([]);
    act(() => useZenStore.getState().enterZen());
    expect(armCalls()).toEqual([{ armed: true }]);
    act(() => useZenStore.getState().exitZen());
    expect(armCalls()).toEqual([{ armed: true }, { armed: false }]);
  });

  it("[AC-5] stays armed across preview tabs without re-sending", async () => {
    useZenStore.setState({ on: true });
    const { rerender } = mount(html);
    rerender({ t: markdown });
    rerender({ t: { kind: "editor", path: "/w/doc.pdf" } });
    expect(armCalls()).toEqual([{ armed: true }]);
  });

  it("[AC-5] disarms and stops listening on unmount", async () => {
    useZenStore.setState({ on: true });
    const { unmount } = mount(html);
    await act(async () => {});
    unmount();
    expect(armCalls()).toEqual([{ armed: true }, { armed: false }]);
    expect(unlistened).toEqual(["terax:zen-escape"]);
    // The document listener is gone too.
    pressEscape();
    expect(useZenStore.getState().on).toBe(true);
  });

  it("[AC-5] works without the native event (Windows, Linux, stub command)", async () => {
    listen.mockImplementationOnce(() => new Promise<() => void>(() => {}));
    useZenStore.setState({ on: true });
    mount(markdown);
    await act(async () => {});
    pressEscape();
    expect(useZenStore.getState().on).toBe(false);
  });

  it("[AC-5] logs a failed arm call with context instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    invoke.mockImplementationOnce(() => Promise.reject(new Error("no ipc")));
    useZenStore.setState({ on: true });
    mount(html);
    await act(async () => {});
    expect(warn).toHaveBeenCalledWith(
      "[zen] zen_escape_arm failed",
      expect.objectContaining({ armed: true }),
    );
  });
  it("[AC-5] keeps zen on the Esc that closes Streamdown's link safety dialog", async () => {
    useZenStore.setState({ on: true });
    mount(markdown);
    await act(async () => {});
    // Like Streamdown: the dialog closes itself on a document Esc.
    const modal = document.createElement("div");
    modal.setAttribute("data-streamdown", "link-safety-modal");
    modal.setAttribute("role", "button");
    document.body.append(modal);
    const closeOnEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") modal.remove();
    };
    document.addEventListener("keydown", closeOnEsc);
    try {
      pressEscape();
      expect(modal.isConnected).toBe(false);
      expect(useZenStore.getState().on).toBe(true);
      // The next Esc, with the dialog gone, leaves zen.
      pressEscape();
      expect(useZenStore.getState().on).toBe(false);
    } finally {
      document.removeEventListener("keydown", closeOnEsc);
    }
  });

  it("[AC-5] keeps zen on Esc in the AI mini window's text field", async () => {
    useZenStore.setState({ on: true });
    mount(html);
    await act(async () => {});
    const mini = document.createElement("div");
    mini.setAttribute("data-ai-mini-window", "");
    mini.setAttribute("data-state", "open");
    const field = document.createElement("textarea");
    mini.append(field);
    document.body.append(mini);
    field.focus();
    act(() => {
      fireEvent.keyDown(field, { key: "Escape" });
    });
    expect(useZenStore.getState().on).toBe(true);
  });

  it("[AC-5] keeps zen on Esc while a Radix select listbox is open", async () => {
    useZenStore.setState({ on: true });
    mount(markdown);
    await act(async () => {});
    const listbox = document.createElement("div");
    listbox.setAttribute("role", "listbox");
    listbox.setAttribute("data-state", "open");
    document.body.append(listbox);
    pressEscape();
    expect(useZenStore.getState().on).toBe(true);
  });

  it("[AC-5] drops the native listener that resolves only after unmount", async () => {
    let resolveListen: ((un: () => void) => void) | undefined;
    listen.mockImplementationOnce(
      (event: string, handler: (e: unknown) => void) => {
        handlers.set(event, handler);
        return new Promise<() => void>((resolve) => {
          resolveListen = resolve;
        });
      },
    );
    const unlisten = vi.fn(() => {
      handlers.delete("terax:zen-escape");
    });
    useZenStore.setState({ on: true });
    const { unmount } = mount(html);
    unmount();
    expect(unlisten).not.toHaveBeenCalled();
    if (!resolveListen) throw new Error("listen was not called");
    const resolve = resolveListen;
    await act(async () => resolve(unlisten));
    expect(unlisten).toHaveBeenCalledTimes(1);
    // A native event after that reaches no handler and leaves zen on.
    act(() => {
      handlers.get("terax:zen-escape")?.({
        event: "terax:zen-escape",
        id: 99,
        payload: null,
      });
    });
    expect(useZenStore.getState().on).toBe(true);
    expect(handlers.has("terax:zen-escape")).toBe(false);
  });
});
