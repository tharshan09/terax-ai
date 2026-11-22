import {
  findLoopbackAddresses,
  type LoopbackAddress,
  parseLoopbackLink,
} from "@/modules/ports/lib/portDetect";
import { portsAvailable } from "@/modules/ports/lib/portsList";
import type { WorkspaceEnv } from "@/modules/workspace";
import { findPathLinks, type PathLink } from "./terminalPathLinks";

// The default of @xterm/addon-web-links, passed to it explicitly so the bare
// loopback links below can tell which text the addon already owns.
export const WEB_URL_REGEX =
  /(https?|HTTPS?):[/]{2}[^\s"'!*(){}|\\^<>`]*[^\s"':,.!?{}|\\^~[\]`()<>]/;

type Span = { start: number; end: number };

function webUrlSpans(line: string): Span[] {
  const spans: Span[] = [];
  const re = new RegExp(WEB_URL_REGEX.source, "g");
  for (let m = re.exec(line); m !== null; m = re.exec(line))
    spans.push({ start: m.index, end: m.index + m[0].length });
  return spans;
}

function overlaps(a: Span, spans: readonly Span[]): boolean {
  return spans.some((b) => a.start < b.end && b.start < a.end);
}

// `forwardable`: the pane runs on an SSH host whose ports can be forwarded.
// Addresses written with a scheme stay with the web link provider, so no text
// carries two links; local panes get none, exactly as before.
export function bareLoopbackLinks(
  line: string,
  forwardable: boolean,
): LoopbackAddress[] {
  if (!forwardable || !line.includes(":")) return [];
  const bare = findLoopbackAddresses(line).filter((a) => a.scheme === null);
  if (bare.length === 0) return bare;
  const web = webUrlSpans(line);
  return web.length === 0 ? bare : bare.filter((a) => !overlaps(a, web));
}

// In a forwardable pane `127.0.0.1:8080/index.html` is an address, not a file.
export function pathLinksBesideAddresses(
  line: string,
  forwardable: boolean,
): PathLink[] {
  const paths = findPathLinks(line);
  if (paths.length === 0) return paths;
  const bare = bareLoopbackLinks(line, forwardable);
  return bare.length === 0 ? paths : paths.filter((p) => !overlaps(p, bare));
}

export type LinkTarget = "forward" | "browser";

// A loopback address clicked in a forwardable pane is the server's, so it is
// forwarded and previewed; every other link opens in the system browser.
export function linkClickTarget(
  text: string,
  forwardable: boolean,
): LinkTarget {
  return forwardable && parseLoopbackLink(text) !== null
    ? "forward"
    : "browser";
}

export type LinkOpeners = {
  forward: (env: WorkspaceEnv | null, text: string) => unknown;
  browser: (text: string) => void;
};

// The one click path for links in terminal output, for every provider.
export function activateTerminalLink(
  text: string,
  env: WorkspaceEnv | null,
  open: LinkOpeners,
): void {
  if (linkClickTarget(text, portsAvailable(env)) === "forward")
    void open.forward(env, text);
  else open.browser(text);
}
