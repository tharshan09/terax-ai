import type { WorkspaceEnv } from "@/modules/workspace";
import { describe, expect, it } from "vitest";
import {
  binaryHeaderSurface,
  type PreviewHeaderModel,
  previewHeaderModel,
  rawHeaderSurface,
} from "./previewHeader";

const LOCAL: WorkspaceEnv = { kind: "local" };
const SSH: WorkspaceEnv = { kind: "ssh", host: "devbox" };
const WSL: WorkspaceEnv = { kind: "wsl", distro: "Ubuntu" };

// What the user decided for each surface (Q&A 5, SVC-14).
function full(fileName: string, openInBrowser: boolean): PreviewHeaderModel {
  return {
    fileName,
    reload: { disabled: false },
    view: { mode: "rendered", renderedDisabled: false },
    openInBrowser,
    zen: true,
  };
}
function slim(fileName: string): PreviewHeaderModel {
  return { fileName, reload: null, view: null, openInBrowser: true, zen: true };
}

describe("previewHeaderModel", () => {
  it("[AC-7] html: file name, Reload, Rendered/Raw, Open in Browser, Zen", () => {
    expect(
      previewHeaderModel({
        surface: "html",
        path: "/p/a.html",
        workspace: LOCAL,
      }),
    ).toEqual(full("a.html", true));
  });

  it("[AC-7] markdown: the same without Open in Browser (wave 1)", () => {
    expect(
      previewHeaderModel({
        surface: "markdown",
        path: "/p/a.md",
        workspace: LOCAL,
      }),
    ).toEqual(full("a.md", false));
  });

  it("[AC-7] raw of a.html: like html; unsaved locks Reload and Rendered", () => {
    expect(
      previewHeaderModel({
        surface: "raw",
        path: "/p/a.html",
        workspace: LOCAL,
      }),
    ).toEqual({
      ...full("a.html", true),
      view: { mode: "raw", renderedDisabled: false },
    });
    expect(
      previewHeaderModel({
        surface: "raw",
        path: "/p/a.html",
        workspace: LOCAL,
        dirty: true,
      }),
    ).toEqual({
      ...full("a.html", true),
      reload: { disabled: true },
      view: { mode: "raw", renderedDisabled: true },
    });
  });

  it.each<[string, "image" | "pdf", string, WorkspaceEnv]>([
    ["image locally", "image", "/p/a.png", LOCAL],
    ["image over SSH", "image", "/srv/p/a.png", SSH],
    ["pdf locally", "pdf", "/p/doc.pdf", LOCAL],
    ["pdf over SSH (card)", "pdf", "/srv/p/doc.pdf", SSH],
  ])(
    "[AC-7] %s: only file name, Open in Browser and Zen",
    (_, surface, path, workspace) => {
      expect(previewHeaderModel({ surface, path, workspace })).toEqual(
        slim(path.split("/").pop() as string),
      );
    },
  );

  it("[AC-7] html in WSL shows no Open in Browser", () => {
    expect(
      previewHeaderModel({
        surface: "html",
        path: "/p/a.html",
        workspace: WSL,
      }),
    ).toEqual(full("a.html", false));
  });
});

describe("which editor views get the header", () => {
  it("[AC-11] raw view only for Markdown and HTML", () => {
    expect(
      [
        "a.md",
        "a.markdown",
        "a.mdx",
        "a.html",
        "a.HTM",
        "main.rs",
        "a.txt",
        "a.svg",
      ].map((p) => [p, rawHeaderSurface(`/p/${p}`)]),
    ).toEqual([
      ["a.md", "raw"],
      ["a.markdown", "raw"],
      ["a.mdx", "raw"],
      ["a.html", "raw"],
      ["a.HTM", "raw"],
      ["main.rs", null],
      ["a.txt", null],
      ["a.svg", null],
    ]);
  });

  it("[AC-17] binary preview only for images and PDF", () => {
    expect(
      [
        "a.png",
        "a.JPG",
        "a.svg",
        "a.ico",
        "doc.pdf",
        "clip.mp4",
        "song.mp3",
        "x.bin",
      ].map((p) => [p, binaryHeaderSurface(`/p/${p}`)]),
    ).toEqual([
      ["a.png", "image"],
      ["a.JPG", "image"],
      ["a.svg", "image"],
      ["a.ico", "image"],
      ["doc.pdf", "pdf"],
      ["clip.mp4", null],
      ["song.mp3", null],
      ["x.bin", null],
    ]);
  });
});
