import { describe, expect, it } from "vitest";
import { isLoopbackHost, isLoopbackUrl } from "@/lib/loopback";

const HOSTS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "app.localhost",
  "::1",
  "192.168.1.5",
  "localhost.example.com",
];

describe("isLoopbackHost", () => {
  it("accepts exactly the four detection hosts in the detect variant", () => {
    expect(HOSTS.filter((h) => isLoopbackHost(h, "detect"))).toEqual([
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "[::1]",
    ]);
  });

  it("adds *.localhost and ::1 in the preview variant", () => {
    expect(HOSTS.filter((h) => isLoopbackHost(h, "preview"))).toEqual([
      "localhost",
      "127.0.0.1",
      "0.0.0.0",
      "[::1]",
      "app.localhost",
      "::1",
    ]);
  });

  it("ignores case", () => {
    expect(isLoopbackHost("LocalHost", "detect")).toBe(true);
    expect(isLoopbackHost("App.LOCALHOST", "preview")).toBe(true);
  });
});

describe("isLoopbackUrl", () => {
  it("judges the URL host like the preview always did", () => {
    expect(isLoopbackUrl("http://localhost:5173/x", "preview")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:4000/", "preview")).toBe(true);
    expect(isLoopbackUrl("http://app.localhost:3000", "preview")).toBe(true);
    expect(isLoopbackUrl("https://example.com", "preview")).toBe(false);
    expect(isLoopbackUrl("http://localhost.example.com", "preview")).toBe(
      false,
    );
    expect(isLoopbackUrl("not a url", "preview")).toBe(false);
  });

  it("keeps app.localhost out of the detect variant", () => {
    expect(isLoopbackUrl("http://app.localhost:3000", "detect")).toBe(false);
  });
});
