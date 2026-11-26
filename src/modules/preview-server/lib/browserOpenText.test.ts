import { describe, expect, it } from "vitest";
import type { BrowserOpen, BrowserOpenStatus } from "../types";
import { browserCallFailedText, browserOpenText } from "./browserOpenText";

const NAME = "a.html";
const HOST = "devbox";

// Each status with the reason the server sends for it, and the text the
// user decided on (build plan, Q&A 11 and the decision lines). Typed as a
// record over the status union, so a new status fails the type check here.
const BY_STATUS: Record<BrowserOpenStatus, [string | null, string | null]> = {
  opened: [null, null],
  unsupported: [null, "Open in Browser is not available for this file."],
  refused: [
    "path is inside a protected directory (.ssh)",
    "a.html can't be opened in the browser: path is inside a protected directory (.ssh)",
  ],
  too_large: [
    null,
    "a.html is larger than 10 MB and can't be opened in the browser.",
  ],
  unreachable: [
    "connection refused",
    "Could not read a.html from devbox: connection refused",
  ],
  limit_reached: [
    null,
    "Too many browser links are open. Restart Terax to free them.",
  ],
  open_failed: ["no handler", "Could not open the browser: no handler"],
};
const CASES = (Object.keys(BY_STATUS) as BrowserOpenStatus[]).map(
  (status) => [status, ...BY_STATUS[status]] as const,
);

describe("browserOpenText", () => {
  it.each(CASES)("[AC-4] %s → its toast text", (status, reason, text) => {
    const answer: BrowserOpen = { status, reason };
    expect(browserOpenText(answer, NAME, HOST)).toBe(text);
  });

  it("[AC-4] leaves out the host for a local file", () => {
    expect(
      browserOpenText(
        { status: "unreachable", reason: "connection refused" },
        NAME,
        null,
      ),
    ).toBe("Could not read a.html: connection refused");
  });

  it("[AC-4] a rejected call reads like a failed opener", () => {
    expect(browserCallFailedText("task aborted")).toBe(
      "Could not open the browser: task aborted",
    );
  });
});
