import { isLoopbackHost } from "@/lib/loopback";

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

export function validPort(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

// Loopback addresses (BR-10) in one line of plain text, left to right.
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

// The Mac side is always named `localhost` (CSP connect-src allows it).
export function macUrl(localPort: number): string {
  return `http://localhost:${localPort}`;
}

export function macUrlFor(address: LoopbackAddress, localPort: number): string {
  const scheme = address.scheme ?? "http";
  const rest = address.rest.startsWith("/") ? address.rest : `/${address.rest}`;
  return `${scheme}://localhost:${localPort}${rest}`;
}

const ESC = 0x1b;
const BEL = 0x07;
const TOKEN_CAP = 256;
const TOKEN_KEEP = 96;
const NO_PORTS: readonly number[] = Object.freeze([]);

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
// match; any other escape sequence ends the word like whitespace does.
export class PortDetector {
  private mode = TEXT;
  private token = new Uint8Array(TOKEN_CAP);
  private len = 0;
  private colonDigit = false;
  private found: number[] = [];

  feed(bytes: Uint8Array): readonly number[] {
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
    if (this.found.length === 0) return NO_PORTS;
    const ports = this.found;
    this.found = [];
    return ports;
  }

  private push(b: number): void {
    if (this.len === TOKEN_CAP) {
      this.token.copyWithin(0, TOKEN_CAP - TOKEN_KEEP);
      this.len = TOKEN_KEEP;
    }
    if (
      b >= 0x30 &&
      b <= 0x39 &&
      this.len > 0 &&
      this.token[this.len - 1] === 0x3a
    )
      this.colonDigit = true;
    this.token[this.len++] = b;
  }

  private breakWord(): void {
    this.mode = TEXT;
    this.endWord();
  }

  private endWord(): void {
    if (this.colonDigit) {
      const word = String.fromCharCode(...this.token.subarray(0, this.len));
      for (const a of findLoopbackAddresses(word))
        if (!this.found.includes(a.port)) this.found.push(a.port);
    }
    this.len = 0;
    this.colonDigit = false;
  }
}
