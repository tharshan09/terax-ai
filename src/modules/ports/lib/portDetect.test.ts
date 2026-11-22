import { describe, expect, it, vi } from "vitest";
import {
  findLoopbackAddresses,
  macUrl,
  macUrlFor,
  PortDetector,
  parseLoopbackAddress,
  parseLoopbackLink,
} from "@/modules/ports/lib/portDetect";

const enc = new TextEncoder();

function detect(...chunks: string[]): number[] {
  const d = new PortDetector();
  return chunks.flatMap((c) => d.feed(enc.encode(c)).map((f) => f.port));
}

describe("PortDetector", () => {
  it("finds loopback ports through ANSI styling, with or without a scheme", () => {
    expect(
      detect(
        "\x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\r\n",
        "127.0.0.1:8000\r\n",
        "0.0.0.0:3000\r\n",
        "[::1]:4000\r\n",
        "https://localhost:8443/x\r\n",
      ),
    ).toEqual([5173, 8000, 3000, 4000, 8443]);
  });

  it("reports ports below 1024 but nothing out of range or off loopback", () => {
    expect(
      detect(
        "localhost:80\r\n",
        "localhost:70000\r\n",
        "app.localhost:3000\r\n",
        "example.com:3000\r\n",
      ),
    ).toEqual([80]);
  });

  it("joins an address split across chunks", () => {
    expect(detect("  Local: http://local", "host:51", "73/\r\n")).toEqual([
      5173,
    ]);
  });

  it("waits for the word to end so a split port is not cut short", () => {
    const d = new PortDetector();
    expect([...d.feed(enc.encode("localhost:51"))]).toEqual([]);
    expect([...d.feed(enc.encode("73 "))]).toEqual([
      { port: 5173, scheme: false },
    ]);
  });

  it("tells whether a port was written with a scheme", () => {
    const d = new PortDetector();
    expect([
      ...d.feed(
        enc.encode(
          "127.0.0.1:40001 http://localhost:40002/ localhost:5173 https://localhost:5173\r\n",
        ),
      ),
    ]).toEqual([
      { port: 40001, scheme: false },
      { port: 40002, scheme: true },
      { port: 5173, scheme: true },
    ]);
  });

  it("scans a word only when a port follows a loopback host", () => {
    const scan = vi.fn(findLoopbackAddresses);
    const d = new PortDetector(scan);
    d.feed(
      enc.encode(
        "2026-11-20T12:34:56.789Z INFO server.ts:123 12:34:56 example.com:8080 src/a.ts:12:5 [10:30:00]\r\n",
      ),
    );
    expect(scan).not.toHaveBeenCalled();
    const ports = d.feed(
      enc.encode(
        "LOCALHOST:3000 127.0.0.1:8000 0.0.0.0:3001 [::1]:4000 xlocalhost:9\r\n",
      ),
    );
    expect(scan.mock.calls.map(([word]) => word)).toEqual([
      "LOCALHOST:3000",
      "127.0.0.1:8000",
      "0.0.0.0:3001",
      "[::1]:4000",
      "xlocalhost:9",
    ]);
    expect(ports.map((f) => f.port)).toEqual([3000, 8000, 3001, 4000]);
  });

  it("scans a host split from its port by a chunk or a color change", () => {
    const scan = vi.fn(findLoopbackAddresses);
    const d = new PortDetector(scan);
    d.feed(enc.encode("http://localhost:"));
    const ports = d.feed(enc.encode("\x1b[1m5173\x1b[22m/\r\n"));
    expect(scan).toHaveBeenCalledOnce();
    expect(ports).toEqual([{ port: 5173, scheme: true }]);
  });

  it("treats cursor movement as a word break", () => {
    expect(detect("localhost:\x1b[2C3000\r\n")).toEqual([]);
    expect(detect("\x1b[2K\x1b[1Glocalhost:3000\x1b[K\r\n")).toEqual([3000]);
  });

  it("reads through OSC 8 hyperlinks and skips OSC payloads", () => {
    expect(
      detect(
        "\x1b]8;;http://localhost:9999\x1b\\localhost:3000\x1b]8;;\x1b\\\r\n",
      ),
    ).toEqual([3000]);
    expect(detect("\x1b]0;localhost:7777\x07 done\r\n")).toEqual([]);
  });

  it("survives an escape sequence split across chunks", () => {
    expect(detect("localhost:\x1b", "[1m4000\x1b[0", "m\r\n")).toEqual([4000]);
  });

  it("returns each port once per chunk", () => {
    expect(detect("localhost:3000 localhost:3000\r\n")).toEqual([3000]);
  });

  it("ignores other schemes, users and host suffixes", () => {
    expect(
      detect(
        "ws://localhost:24678 me@localhost:2222 xlocalhost:3000 10:30:00\r\n",
      ),
    ).toEqual([]);
  });

  it("bounds the carried word on long unbroken output", () => {
    const d = new PortDetector();
    d.feed(enc.encode("a".repeat(100_000)));
    expect([...d.feed(enc.encode(",http://localhost:3000\r\n"))]).toEqual([
      { port: 3000, scheme: true },
    ]);
  });
});

describe("findLoopbackAddresses", () => {
  it("returns the clickable span of each loopback address in a line", () => {
    const line = "see localhost:3000 and https://github.com/x";
    expect(findLoopbackAddresses(line)).toEqual([
      {
        start: 4,
        end: 18,
        text: "localhost:3000",
        scheme: null,
        port: 3000,
        rest: "",
      },
    ]);
  });

  it("keeps path and query and drops trailing punctuation", () => {
    const [a] = findLoopbackAddresses("open http://localhost:4000/a?b=1.");
    expect(a.text).toBe("http://localhost:4000/a?b=1");
    expect(a.rest).toBe("/a?b=1");
  });

  it("stops at closing brackets and quotes", () => {
    const [a] = findLoopbackAddresses('("localhost:3000/docs")');
    expect(a.text).toBe("localhost:3000/docs");
  });
});

describe("Mac address", () => {
  it("is localhost with the Mac port", () => {
    expect(macUrl(5174)).toBe("http://localhost:5174");
  });

  it("keeps scheme, path and query of a clicked address", () => {
    const at = (text: string, port: number) => {
      const a = parseLoopbackAddress(text);
      if (!a) throw new Error(text);
      return macUrlFor(a, port);
    };
    expect(at("localhost:3000/docs?x=1", 3000)).toBe(
      "http://localhost:3000/docs?x=1",
    );
    expect(at("0.0.0.0:80", 80)).toBe("http://localhost:80/");
    expect(at("https://127.0.0.1:8443/", 8443)).toBe("https://localhost:8443/");
    expect(at("http://localhost:4000/a?b=1", 4001)).toBe(
      "http://localhost:4001/a?b=1",
    );
  });

  it("parses only a whole address", () => {
    expect(parseLoopbackAddress("see localhost:3000")).toBeNull();
    expect(parseLoopbackAddress("example.com:3000")).toBeNull();
  });
});

describe("parseLoopbackLink", () => {
  const mac = (text: string, port: number) => {
    const a = parseLoopbackLink(text);
    return a ? [a.port, macUrlFor(a, port)] : null;
  };

  it("keeps brackets and other URL characters in path, query and fragment", () => {
    expect(
      mac("http://localhost:3000/items?filter[status]=open", 3001),
    ).toEqual([3000, "http://localhost:3001/items?filter[status]=open"]);
    expect(mac("http://[::1]:4000/a/b?x=[1]#top", 4000)).toEqual([
      4000,
      "http://localhost:4000/a/b?x=[1]#top",
    ]);
    expect(mac("HTTPS://127.0.0.1:8443/x~y", 8443)).toEqual([
      8443,
      "https://localhost:8443/x~y",
    ]);
  });

  it("takes the scheme's default port when none is written", () => {
    expect(mac("http://localhost/x", 80)).toEqual([
      80,
      "http://localhost:80/x",
    ]);
    expect(mac("https://localhost/", 443)).toEqual([
      443,
      "https://localhost:443/",
    ]);
    expect(mac("http://0.0.0.0:80/", 8080)).toEqual([
      80,
      "http://localhost:8080/",
    ]);
  });

  it("refuses other hosts, user info and broken URLs", () => {
    expect(parseLoopbackLink("http://app.localhost:3000/")).toBeNull();
    expect(parseLoopbackLink("https://github.com/x")).toBeNull();
    expect(parseLoopbackLink("http://user@localhost:3000/")).toBeNull();
    expect(parseLoopbackLink("http://localhost:99999/")).toBeNull();
  });

  it("reads a link without a scheme as a bare address", () => {
    expect(mac("localhost:3000/docs?x=1", 3000)).toEqual([
      3000,
      "http://localhost:3000/docs?x=1",
    ]);
    expect(parseLoopbackLink("see localhost:3000")).toBeNull();
  });
});
