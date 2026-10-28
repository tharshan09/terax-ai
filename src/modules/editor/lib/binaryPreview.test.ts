import { describe, expect, it } from "vitest";
import {
  binaryPreviewMode,
  extOf,
  isMediaPath,
  readsImageRemotely,
  remoteImageMime,
} from "./binaryPreview";

describe("extOf", () => {
  it("returns the lower-cased extension", () => {
    expect(extOf("/a/b/Report.PDF")).toBe("pdf");
    expect(extOf("noext")).toBe("noext");
  });
});

describe("isMediaPath", () => {
  it("recognizes media extensions", () => {
    expect(isMediaPath("a.png")).toBe(true);
    expect(isMediaPath("a.mp4")).toBe(true);
    expect(isMediaPath("a.pdf")).toBe(true);
    expect(isMediaPath("a.txt")).toBe(false);
    expect(isMediaPath("a.zip")).toBe(false);
  });
});

describe("binaryPreviewMode", () => {
  it("shows the loader while a media path is not yet ready", () => {
    expect(binaryPreviewMode("png", false, null)).toBe("loading");
    expect(binaryPreviewMode("pdf", false, null)).toBe("loading");
  });

  it("shows the card for a non-media binary immediately", () => {
    // A .zip is never media, so it does not wait for the asset scope.
    expect(binaryPreviewMode("zip", false, null)).toBe("card");
  });

  it("routes image / video / audio to their viewer once ready", () => {
    expect(binaryPreviewMode("png", true, null)).toBe("image");
    expect(binaryPreviewMode("mp4", true, null)).toBe("video");
    expect(binaryPreviewMode("mp3", true, null)).toBe("audio");
  });

  it("renders the pdf iframe ONLY when the backend verified the magic bytes", () => {
    expect(binaryPreviewMode("pdf", true, true)).toBe("pdf");
  });

  it("drops a fake .pdf (verification failed) to the inert card, never the iframe", () => {
    // This is the FE-4 security invariant: an attacker-named .pdf whose bytes
    // are HTML must reach the card, not the sandbox-less iframe.
    expect(binaryPreviewMode("pdf", true, false)).toBe("card");
  });

  it("never shows the iframe while pdf verification is still pending", () => {
    // Ready but verification not settled: must not be "pdf".
    expect(binaryPreviewMode("pdf", true, null)).toBe("card");
  });
});

describe("readsImageRemotely", () => {
  it("routes only SSH images past the local asset protocol", () => {
    const ssh = { kind: "ssh", host: "box" } as const;
    expect(readsImageRemotely("png", ssh)).toBe(true);
    expect(readsImageRemotely("svg", ssh)).toBe(true);
    expect(readsImageRemotely("pdf", ssh)).toBe(false);
    expect(readsImageRemotely("mp4", ssh)).toBe(false);
    expect(readsImageRemotely("png", { kind: "local" })).toBe(false);
    expect(readsImageRemotely("png", { kind: "wsl", distro: "Ubuntu" })).toBe(
      false,
    );
  });
});

describe("remoteImageMime", () => {
  it("types raster images and leaves svg and unknown names untyped", () => {
    expect(remoteImageMime("jpg")).toBe("image/jpeg");
    expect(remoteImageMime("png")).toBe("image/png");
    expect(remoteImageMime("svg")).toBeNull();
    expect(remoteImageMime("constructor")).toBeNull();
  });
});
