// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TmuxSessionSwitcher } from "./TmuxSessionSwitcher";

// cmdk measures and scrolls its list; jsdom provides neither.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

vi.mock("./lib/tmux", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./lib/tmux")>();
  return {
    ...actual,
    killTmuxSession: vi.fn(() => Promise.resolve()),
    renameTmuxSession: vi.fn(() => Promise.resolve()),
  };
});

const refresh = vi.fn(() => Promise.resolve());
vi.mock("./lib/useTmuxSessions", () => ({
  useTmuxSessions: (select: (s: unknown) => unknown) =>
    select({
      sessions: [
        {
          name: "s1",
          windows: 1,
          attached: false,
          lastAttached: null,
          attachable: true,
        },
      ],
      loading: false,
      error: null,
      refresh,
    }),
}));

function setup() {
  const onAttachHere = vi.fn();
  const onOpenInNewTab = vi.fn();
  render(
    <TmuxSessionSwitcher
      target={{ tabId: 1, leafId: 1, host: "litha" }}
      onOpenChange={() => {}}
      onAttachHere={onAttachHere}
      onOpenInNewTab={onOpenInNewTab}
    />,
  );
  return { onAttachHere, onOpenInNewTab };
}

describe("TmuxSessionSwitcher, creating a session", () => {
  afterEach(cleanup);

  it("asks for a name instead of inventing one silently", () => {
    // The old behaviour attached to an auto name (s1, s2, ...) and left the
    // user to rename it afterwards.
    const { onAttachHere } = setup();
    fireEvent.click(screen.getByText("New session..."));
    expect(onAttachHere).not.toHaveBeenCalled();
    const field = screen.getByLabelText(/Name the new session on litha/);
    expect((field as HTMLInputElement).value).toBe("s2");
  });

  it("takes the prefilled name on Enter", () => {
    // s1 is taken, so the default is the next free one.
    const { onAttachHere } = setup();
    fireEvent.click(screen.getByText("New session..."));
    fireEvent.keyDown(screen.getByLabelText(/Name the new session/), {
      key: "Enter",
    });
    expect(onAttachHere).toHaveBeenCalledWith("s2");
  });

  it("creates under the name the user types", () => {
    const { onAttachHere } = setup();
    fireEvent.click(screen.getByText("New session..."));
    const field = screen.getByLabelText(/Name the new session/);
    fireEvent.change(field, { target: { value: "deploy box" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onAttachHere).toHaveBeenCalledWith("deploy-box");
  });

  it("refuses a name reserved for Terax-managed sessions", () => {
    const { onAttachHere } = setup();
    fireEvent.click(screen.getByText("New session..."));
    fireEvent.change(screen.getByLabelText(/Name the new session/), {
      target: { value: "terax-rs-mine" },
    });
    const create = screen.getByRole("button", {
      name: "Create",
    }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    expect(screen.getByText(/reserved/i)).toBeTruthy();
    fireEvent.click(create);
    expect(onAttachHere).not.toHaveBeenCalled();
  });

  it("still creates straight away when a name was typed in the filter", () => {
    // Typing in the filter is already a decision; do not ask twice.
    const { onAttachHere } = setup();
    fireEvent.change(screen.getByPlaceholderText(/Filter or name a session/), {
      target: { value: "hotfix" },
    });
    fireEvent.click(screen.getByText("hotfix"));
    expect(onAttachHere).toHaveBeenCalledWith("hotfix");
  });
});
