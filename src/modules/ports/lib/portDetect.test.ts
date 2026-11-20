import { describe, expect, it } from "vitest";
import {
  findLoopbackAddresses,
  macUrl,
  macUrlFor,
  PortDetector,
  parseLoopbackAddress,
} from "@/modules/ports/lib/portDetect";

const enc = new TextEncoder();

function detect(...chunks: string[]): number[] {
  const d = new PortDetector();
  return chunks.flatMap((c) => [...d.feed(enc.encode(c))]);
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
    expect([...d.feed(enc.encode("73 "))]).toEqual([5173]);
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
      3000,
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
