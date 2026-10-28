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

const LONG_NAME = `deploy-${"very-long-session-name-".repeat(12)}end`;
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
        {
          name: LONG_NAME,
          windows: 3,
          attached: true,
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
  const onOpenChange = vi.fn();
  render(
    <TmuxSessionSwitcher
      target={{ tabId: 1, leafId: 1, host: "litha" }}
      onOpenChange={onOpenChange}
      onAttachHere={onAttachHere}
      onOpenInNewTab={onOpenInNewTab}
    />,
  );
  return { onAttachHere, onOpenInNewTab, onOpenChange };
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

  it("leaves the naming step without closing the picker", () => {
    // Radix dismisses on a document capture listener, so the field's own
    // handler never sees Escape unless the dialog stands down first.
    const { onAttachHere, onOpenChange } = setup();
    fireEvent.click(screen.getByText("New session..."));
    fireEvent.keyDown(screen.getByLabelText(/Name the new session/), {
      key: "Escape",
    });
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(onAttachHere).not.toHaveBeenCalled();
    expect(screen.getByText("New session...")).toBeTruthy();
  });

  it("asks for a name when the filter sanitizes away to nothing", () => {
    // "///" leaves no name, so the row falls back to the invented default and
    // must not create it behind the user's back.
    const { onAttachHere } = setup();
    fireEvent.change(screen.getByPlaceholderText(/Filter or name a session/), {
      target: { value: "///" },
    });
    fireEvent.click(screen.getByText("New session..."));
    expect(onAttachHere).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Name the new session/)).toBeTruthy();
  });

  it("says so when the name is an existing session", () => {
    // tmux new-session -A attaches instead of creating, which a panel headed
    // "Create" would otherwise hide.
    setup();
    fireEvent.click(screen.getByText("New session..."));
    fireEvent.change(screen.getByLabelText(/Name the new session/), {
      target: { value: "s1" },
    });
    expect(
      screen.getByText(/s1 already exists\. This attaches to it/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Attach" })).toBeTruthy();
  });
});

describe("TmuxSessionSwitcher, a very long session name", () => {
  afterEach(cleanup);

  // jsdom does no layout, so this pins the structure truncation depends on.
  it("lets the name truncate inside the scroll area", () => {
    setup();
    const name = screen.getByText(LONG_NAME);
    expect(name.className).toMatch(/\btruncate\b/);
    expect(name.className).toMatch(/\bmin-w-0\b/);
    expect(name.className).toMatch(/\bflex-1\b/);

    // Radix puts an inline display:table wrapper between viewport and list;
    // the override must hit exactly that wrapper.
    const viewport = name.closest<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    const wrapper = viewport?.firstElementChild as HTMLElement | null;
    expect(wrapper?.tagName).toBe("DIV");
    expect(wrapper?.contains(name)).toBe(true);
    expect(wrapper?.style.display).toBe("table");
    const root = name.closest<HTMLElement>('[data-slot="scroll-area"]');
    expect(root?.className).toContain(
      "[&_[data-slot=scroll-area-viewport]>div]:block!",
    );

    const row = name.closest<HTMLElement>('[data-slot="command-item"]');
    expect(row?.getAttribute("title")).toContain(LONG_NAME);
  });

  it("keeps rename and kill rendered, enabled and working", () => {
    setup();
    const rename = screen.getByRole("button", {
      name: `Rename ${LONG_NAME}`,
    }) as HTMLButtonElement;
    const kill = screen.getByRole("button", {
      name: `Kill ${LONG_NAME}`,
    }) as HTMLButtonElement;
    expect(rename.disabled).toBe(false);
    expect(kill.disabled).toBe(false);
    expect(rename.parentElement?.className).toMatch(/\bshrink-0\b/);

    fireEvent.click(kill);
    expect(kill.textContent).toBe("Kill?");

    fireEvent.click(rename);
    expect(screen.getByDisplayValue(LONG_NAME)).toBeTruthy();
  });
});
