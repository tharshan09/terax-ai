import { describe, expect, it } from "vitest";
import {
  bareLoopbackLinks,
  linkClickTarget,
  pathLinksBesideAddresses,
  WEB_URL_REGEX,
} from "./terminalLinks";
import { findPathLinks } from "./terminalPathLinks";

const SSH = true;
const LOCAL = false;

// What a pane underlines: WebLinksAddon (with WEB_URL_REGEX) plus the bare
// loopback provider, as rendererPool wires them.
function linkTexts(line: string, forwardable: boolean): string[] {
  const web = [...line.matchAll(new RegExp(WEB_URL_REGEX.source, "g"))].map(
    (m) => ({ start: m.index, text: m[0] }),
  );
  const bare = bareLoopbackLinks(line, forwardable).map((a) => ({
    start: a.start,
    text: line.slice(a.start, a.end),
  }));
  return [...web, ...bare].sort((a, b) => a.start - b.start).map((l) => l.text);
}

describe("terminal links per pane", () => {
  const line = "see localhost:3000 and https://github.com/x";

  it("makes the schemeless address a link only in an SSH pane", () => {
    expect(linkTexts(line, SSH)).toEqual([
      "localhost:3000",
      "https://github.com/x",
    ]);
    expect(linkTexts(line, LOCAL)).toEqual(["https://github.com/x"]);
  });

  it("leaves addresses with a scheme to the web link provider", () => {
    const withScheme =
      "Local: http://localhost:5173/ and https://127.0.0.1:8443/x";
    expect(bareLoopbackLinks(withScheme, SSH)).toEqual([]);
    expect(linkTexts(withScheme, SSH)).toEqual([
      "http://localhost:5173/",
      "https://127.0.0.1:8443/x",
    ]);
  });

  it("never puts a second link inside a web URL", () => {
    const nested =
      "open https://auth.example.com/cb?next=localhost:3000/done now";
    expect(bareLoopbackLinks(nested, SSH)).toEqual([]);
    expect(linkTexts(nested, SSH)).toEqual([
      "https://auth.example.com/cb?next=localhost:3000/done",
    ]);
  });

  it("links every bare loopback host with path and query, without trailing punctuation", () => {
    const many = "on 127.0.0.1:8080/path?a=1, [::1]:4000 or 0.0.0.0:80.";
    expect(linkTexts(many, SSH)).toEqual([
      "127.0.0.1:8080/path?a=1",
      "[::1]:4000",
      "0.0.0.0:80",
    ]);
  });

  it("does not link other hosts or invalid ports without a scheme", () => {
    expect(
      bareLoopbackLinks(
        "example.com:3000 app.localhost:3000 localhost:70000 user@localhost:22",
        SSH,
      ),
    ).toEqual([]);
  });

  it("drops a path link that is a loopback address in an SSH pane only", () => {
    const text = "built 127.0.0.1:8080/index.html and src/app.ts";
    expect(pathLinksBesideAddresses(text, SSH).map((p) => p.path)).toEqual([
      "src/app.ts",
    ]);
    expect(pathLinksBesideAddresses(text, LOCAL)).toEqual(findPathLinks(text));
  });

  it("keeps path links untouched when the line has no address", () => {
    const text = "edit ./src/a.ts and /etc/hosts";
    expect(pathLinksBesideAddresses(text, SSH)).toEqual(findPathLinks(text));
  });
});

describe("linkClickTarget", () => {
  it("forwards a loopback address clicked in an SSH pane", () => {
    expect(linkClickTarget("localhost:3000", SSH)).toBe("forward");
    expect(linkClickTarget("http://localhost:3000/docs?x=1", SSH)).toBe(
      "forward",
    );
    expect(linkClickTarget("https://127.0.0.1:8443/", SSH)).toBe("forward");
    expect(linkClickTarget("0.0.0.0:80", SSH)).toBe("forward");
  });

  it("opens everything else in the system browser", () => {
    expect(linkClickTarget("https://github.com/x", SSH)).toBe("browser");
    expect(linkClickTarget("http://app.localhost:3000", SSH)).toBe("browser");
    expect(linkClickTarget("http://localhost:3000", LOCAL)).toBe("browser");
    expect(linkClickTarget("https://github.com/x", LOCAL)).toBe("browser");
  });
});
