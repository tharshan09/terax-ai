import { isLoopbackHost } from "@/lib/loopback";

// A port found in output; `scheme`: written with `http(s)://` in that chunk.
export type DetectedPort = { port: number; scheme: boolean };

export type LoopbackAddress = {
  start: number;
  end: number;
  text: string;
  scheme: "http" | "https" | null;
  port: number;
  // Path, query and fragment as written, "" when the address ends at the port.
  rest: string;
};

const ADDRESS =
  /(?:(https?):\/\/)?(\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+):(\d{1,5})(?!\w)([/?#][^\s"'`<>()[\]{}]*)?/g;
// Before a bare host these mean another host, a user or a scheme (`ws://`).
const BEFORE_BARE_HOST = /[\w.@/:-]/;
const TRAILING_PUNCT = /[.,;:!?]+$/;
const WITH_SCHEME = /^https?:\/\//i;

export function validPort(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

// Loopback addresses in one line of plain text, left to right.
export function findLoopbackAddresses(line: string): LoopbackAddress[] {
  const out: LoopbackAddress[] = [];
  ADDRESS.lastIndex = 0;
  for (let m = ADDRESS.exec(line); m !== null; m = ADDRESS.exec(line)) {
    const [, scheme, host, digits, path] = m;
    const port = Number(digits);
    const before = m.index > 0 ? line[m.index - 1] : "";
    if (before && (scheme ? /\w/ : BEFORE_BARE_HOST).test(before)) continue;
    if (!validPort(port) || !isLoopbackHost(host, "detect")) continue;
    const rest = (path ?? "").replace(TRAILING_PUNCT, "");
    const text = m[0].slice(0, m[0].length - (path ?? "").length) + rest;
    out.push({
      start: m.index,
      end: m.index + text.length,
      text,
      scheme: scheme ? (scheme.toLowerCase() as "http" | "https") : null,
      port,
      rest,
    });
  }
  return out;
}

// The address must be the whole text, as a clicked link is.
export function parseLoopbackAddress(text: string): LoopbackAddress | null {
  const trimmed = text.trim();
  const [first] = findLoopbackAddresses(trimmed);
  return first?.start === 0 && first.end === trimmed.length ? first : null;
}

// A clicked link. One with a scheme is read as the browser reads it, so every
// character the web link provider accepts stays in path and query; without a
// written port it is the scheme's default.
export function parseLoopbackLink(text: string): LoopbackAddress | null {
  const trimmed = text.trim();
  if (!WITH_SCHEME.test(trimmed)) return parseLoopbackAddress(trimmed);
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username || url.password || !isLoopbackHost(url.hostname, "detect"))
    return null;
  const scheme = url.protocol === "https:" ? "https" : "http";
  return {
    start: 0,
    end: trimmed.length,
    text: trimmed,
    scheme,
    port: url.port ? Number(url.port) : scheme === "https" ? 443 : 80,
    rest: url.pathname + url.search + url.hash,
  };
}

// Every Mac address of a forward is built here. The Mac side is always named
// `localhost` (CSP connect-src allows it), the same as in the Rust check: a
// remote Chrome compares the origin letter by letter and refuses `127.0.0.1`.
export const MAC_HOST = "localhost";
// Chrome target ids are hex; anything else would leave the viewer path.
const PAGE_ID = /^[A-Za-z0-9]{1,128}$/;

export function macAddress(localPort: number): string {
  return `${MAC_HOST}:${localPort}`;
}

export function macUrl(localPort: number): string {
  return `http://${macAddress(localPort)}`;
}

export function macOrigin(localPort: number): string {
  return macUrl(localPort);
}

// The remote Chrome serves its own viewer, so nothing loads from a third host.
export function macViewerUrl(localPort: number, pageId: string): string | null {
  if (!PAGE_ID.test(pageId)) return null;
  const host = macAddress(localPort);
  return `http://${host}/devtools/inspector.html?ws=${host}/devtools/page/${pageId}`;
}

export function macUrlFor(address: LoopbackAddress, localPort: number): string {
  const scheme = address.scheme ?? "http";
  const rest = address.rest.startsWith("/") ? address.rest : `/${address.rest}`;
  return `${scheme}://${macAddress(localPort)}${rest}`;
}

const ESC = 0x1b;
const BEL = 0x07;
const TOKEN_CAP = 256;
const TOKEN_KEEP = 96;
const NO_PORTS: readonly DetectedPort[] = Object.freeze([]);

// Hosts a port may follow, as bytes: the word is only scanned after one.
const LOOPBACK_HOST_ENDS = ["localhost", "127.0.0.1", "0.0.0.0", "::1]"].map(
  (host) => Uint8Array.from(host, (c) => c.charCodeAt(0)),
);

function lowerAscii(b: number): number {
  return b >= 0x41 && b <= 0x5a ? b | 0x20 : b;
}

const TEXT = 0;
const ESCAPE = 1;
const ESCAPE_INTERMEDIATE = 2;
const CSI = 3;
const OSC = 4;
const OSC_ESCAPE = 5;
const STRING = 6;
const STRING_ESCAPE = 7;

// Scans raw PTY bytes for loopback ports without keeping the output: only the
// current word (at most TOKEN_CAP bytes) survives a chunk boundary. SGR and
// OSC sequences are transparent, so colored or hyperlinked addresses still
// match; any other escape sequence ends the word like whitespace does. A word
// becomes a string only when a port follows a loopback host, so timestamps and
// `file.ts:12:5` in logs cost no more than plain text.
export class PortDetector {
  private mode = TEXT;
  private token = new Uint8Array(TOKEN_CAP);
  private len = 0;
  private loopbackPort = false;
  private found = new Map<number, boolean>();

  constructor(
    private readonly scan: (
      word: string,
    ) => readonly LoopbackAddress[] = findLoopbackAddresses,
  ) {}

  feed(bytes: Uint8Array): readonly DetectedPort[] {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      switch (this.mode) {
        case TEXT:
          if (b === ESC) this.mode = ESCAPE;
          else if (b > 0x20 && b < 0x7f) this.push(b);
          else this.endWord();
          break;
        case ESCAPE:
          if (b === 0x5b) this.mode = CSI;
          else if (b === 0x5d) this.mode = OSC;
          else if (b === 0x50 || b === 0x58 || b === 0x5e || b === 0x5f)
            this.mode = STRING;
          else if (b >= 0x20 && b <= 0x2f) this.mode = ESCAPE_INTERMEDIATE;
          else if (b !== ESC) this.breakWord();
          break;
        case ESCAPE_INTERMEDIATE:
          if (b === ESC) this.mode = ESCAPE;
          else if (b >= 0x30) this.breakWord();
          break;
        case CSI:
          if (b === ESC) this.mode = ESCAPE;
          else if (b >= 0x40 && b <= 0x7e) {
            if (b === 0x6d) this.mode = TEXT;
            else this.breakWord();
          } else if (b < 0x20) this.breakWord();
          break;
        case OSC:
          if (b === BEL) this.mode = TEXT;
          else if (b === ESC) this.mode = OSC_ESCAPE;
          break;
        case OSC_ESCAPE:
          if (b === 0x5c) this.mode = TEXT;
          else {
            this.mode = ESCAPE;
            i--;
          }
          break;
        case STRING:
          if (b === ESC) this.mode = STRING_ESCAPE;
          else if (b === BEL) this.breakWord();
          break;
        case STRING_ESCAPE:
          if (b === 0x5c) this.breakWord();
          else {
            this.mode = ESCAPE;
            i--;
          }
          break;
      }
    }
    if (this.found.size === 0) return NO_PORTS;
    const ports = Array.from(this.found, ([port, scheme]) => ({
      port,
      scheme,
    }));
    this.found.clear();
    return ports;
  }

  private push(b: number): void {
    if (this.len === TOKEN_CAP) {
      this.token.copyWithin(0, TOKEN_CAP - TOKEN_KEEP);
      this.len = TOKEN_KEEP;
    }
    if (
      !this.loopbackPort &&
      b >= 0x30 &&
      b <= 0x39 &&
      this.len > 0 &&
      this.token[this.len - 1] === 0x3a
    )
      this.loopbackPort = this.loopbackHostEndsAt(this.len - 1);
    this.token[this.len++] = b;
  }

  private loopbackHostEndsAt(colon: number): boolean {
    for (const host of LOOPBACK_HOST_ENDS) {
      const start = colon - host.length;
      if (start < 0) continue;
      let i = 0;
      while (i < host.length && lowerAscii(this.token[start + i]) === host[i])
        i++;
      if (i === host.length) return true;
    }
    return false;
  }

  private breakWord(): void {
    this.mode = TEXT;
    this.endWord();
  }

  private endWord(): void {
    if (this.loopbackPort) {
      const word = String.fromCharCode(...this.token.subarray(0, this.len));
      for (const a of this.scan(word))
        this.found.set(
          a.port,
          (this.found.get(a.port) ?? false) || a.scheme !== null,
        );
    }
    this.len = 0;
    this.loopbackPort = false;
  }
}
