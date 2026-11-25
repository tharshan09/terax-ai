import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserOpen } from "../types";

const { invoke, toast } = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: unknown) => Promise<unknown>>(),
  toast: { error: vi.fn(), message: vi.fn() },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("sonner", () => ({ toast }));

import { openInBrowser } from "./openInBrowser";

const PATH = "/p/a.html";
const LOCAL = { kind: "local" } as const;

function answers(answer: BrowserOpen) {
  invoke.mockImplementation(() => Promise.resolve(answer));
}

beforeEach(() => {
  invoke.mockReset();
  toast.error.mockReset();
  toast.message.mockReset();
});

describe("openInBrowser", () => {
  it("[AC-3] opened: one command call, no toast, resolves to undefined", async () => {
    answers({ status: "opened", reason: null });
    await expect(openInBrowser(PATH, LOCAL)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("preview_open_in_browser", {
      path: PATH,
      workspace: LOCAL,
    });
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.message).not.toHaveBeenCalled();
  });

  it("[AC-3] too_large: one command call and the size toast", async () => {
    answers({ status: "too_large", reason: null });
    await expect(openInBrowser(PATH, LOCAL)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("preview_open_in_browser", {
      path: PATH,
      workspace: LOCAL,
    });
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "a.html is larger than 10 MB and can't be opened in the browser.",
    );
  });

  it("[AC-3] a rejected call shows the error and does not reject", async () => {
    invoke.mockImplementation(() => Promise.reject("task aborted"));
    await expect(openInBrowser(PATH, LOCAL)).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledExactlyOnceWith("preview_open_in_browser", {
      path: PATH,
      workspace: LOCAL,
    });
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Could not open the browser: task aborted",
    );
  });

  it("[AC-3] names the SSH host of the workspace when it can't read", async () => {
    answers({ status: "unreachable", reason: "connection refused" });
    await openInBrowser("/srv/p/a.html", { kind: "ssh", host: "devbox" });
    expect(toast.error).toHaveBeenCalledExactlyOnceWith(
      "Could not read a.html from devbox: connection refused",
    );
  });
});
