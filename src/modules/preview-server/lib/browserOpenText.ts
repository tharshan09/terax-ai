import type { BrowserOpen } from "../types";

function withReason(text: string, reason: string | null): string {
  return reason ? `${text}: ${reason}` : text;
}

/**
 * Toast text for the answer of `preview_open_in_browser`; `null` when the
 * browser opened (no toast). `host` is the SSH host of the file, `null` for a
 * local one.
 */
export function browserOpenText(
  answer: BrowserOpen,
  name: string,
  host: string | null,
): string | null {
  switch (answer.status) {
    case "opened":
      return null;
    case "unsupported":
      return "Open in Browser is not available for this file.";
    case "refused":
      return withReason(
        `${name} can't be opened in the browser`,
        answer.reason,
      );
    case "too_large":
      return `${name} is larger than 10 MB and can't be opened in the browser.`;
    case "unreachable":
      return withReason(
        host ? `Could not read ${name} from ${host}` : `Could not read ${name}`,
        answer.reason,
      );
    case "limit_reached":
      return "Too many browser links are open. Restart Terax to free them.";
    case "open_failed":
      return withReason("Could not open the browser", answer.reason);
  }
}

/** Toast text when the command call itself failed instead of answering. */
export function browserCallFailedText(error: string): string {
  return withReason("Could not open the browser", error);
}
