// @vitest-environment jsdom
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, toast } = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(),
  toast: { error: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("sonner", () => ({ toast }));
// Pass-through spies: the real functions run, the spies show the button
// goes through them.
vi.mock("./lib/openInBrowser", async (importOriginal) => {
  const real = await importOriginal<typeof import("./lib/openInBrowser")>();
  return { openInBrowser: vi.fn(real.openInBrowser) };
});
vi.mock("./lib/browserOpenable", async (importOriginal) => {
  const real = await importOriginal<typeof import("./lib/browserOpenable")>();
  return { ...real, browserOpenable: vi.fn(real.browserOpenable) };
});

import { browserOpenable } from "./lib/browserOpenable";
import { openInBrowser } from "./lib/openInBrowser";
import { OpenInBrowserButton } from "./OpenInBrowserButton";

const LOCAL = { kind: "local" } as const;

function iconMarkup(): string {
  const { container, unmount } = render(
    <HugeiconsIcon icon={LinkSquare02Icon} size={14} strokeWidth={1.75} />,
  );
  const html = container.innerHTML;
  unmount();
  return html;
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(() =>
    Promise.resolve({ status: "opened", reason: null }),
  );
  vi.mocked(openInBrowser).mockClear();
  vi.mocked(browserOpenable).mockClear();
});
afterEach(cleanup);

describe("OpenInBrowserButton", () => {
  it("[AC-5] shows the button for a.html and nothing for notes.md", () => {
    const icon = iconMarkup();
    const html = render(
      <OpenInBrowserButton path="/p/a.html" workspace={LOCAL} />,
    );
    const md = render(
      <OpenInBrowserButton path="/p/notes.md" workspace={LOCAL} />,
    );

    const button = html.container.querySelector("button");
    expect(button?.getAttribute("title")).toBe("Open in Browser");
    expect(button?.getAttribute("aria-label")).toBe("Open in Browser");
    expect(button?.innerHTML).toBe(icon);
    expect(md.container.innerHTML).toBe("");
  });

  it("[AC-5] a click calls preview_open_in_browser once with path and workspace", async () => {
    const { container } = render(
      <OpenInBrowserButton path="/p/a.html" workspace={LOCAL} />,
    );
    const button = container.querySelector("button");
    if (!button) throw new Error("button not rendered");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(invoke).toHaveBeenCalledExactlyOnceWith("preview_open_in_browser", {
      path: "/p/a.html",
      workspace: LOCAL,
    });
  });

  it("[AC-5] goes through openInBrowser and decides with browserOpenable", async () => {
    const ssh = { kind: "ssh", host: "devbox" } as const;
    const { container } = render(
      <OpenInBrowserButton path="/srv/p/a.html" workspace={ssh} />,
    );
    expect(browserOpenable).toHaveBeenCalledWith("/srv/p/a.html", ssh);
    const button = container.querySelector("button");
    if (!button) throw new Error("button not rendered");
    await act(async () => {
      fireEvent.click(button);
    });
    expect(openInBrowser).toHaveBeenCalledExactlyOnceWith("/srv/p/a.html", ssh);

    // When browserOpenable says no, the button is gone, whatever the file.
    vi.mocked(browserOpenable).mockReturnValueOnce(false);
    const hidden = render(
      <OpenInBrowserButton path="/p/a.html" workspace={LOCAL} />,
    );
    expect(hidden.container.innerHTML).toBe("");
  });
});
