import type { WorkspaceEnv } from "@/modules/workspace";
import { describe, expect, it } from "vitest";
import { browserOpenable } from "./browserOpenable";

const OPENABLE = [
  "report.html",
  "a.HTM",
  "p.png",
  "p.jpg",
  "p.jpeg",
  "p.gif",
  "p.webp",
  "p.ico",
  "p.svg",
  "doc.pdf",
];

const LOCAL: WorkspaceEnv = { kind: "local" };
const SSH: WorkspaceEnv = { kind: "ssh", host: "devbox" };
const WSL: WorkspaceEnv = { kind: "wsl", distro: "Ubuntu" };

describe("browserOpenable", () => {
  it.each(OPENABLE)("[AC-1] offers %s locally", (name) => {
    expect(browserOpenable(`/p/${name}`, LOCAL)).toBe(true);
  });

  it.each(OPENABLE)("[AC-1] offers %s over SSH", (name) => {
    expect(browserOpenable(`/srv/p/${name}`, SSH)).toBe(true);
  });

  it.each(OPENABLE)("[AC-1] offers %s without a workspace", (name) => {
    expect(browserOpenable(`/p/${name}`, undefined)).toBe(true);
  });

  it("[AC-1] does not offer an HTML file in WSL", () => {
    expect(browserOpenable("/p/report.html", WSL)).toBe(false);
  });

  it.each([
    "notes.md",
    "notes.markdown",
    "x.mdx",
    "a.txt",
    "clip.mp4",
    "pic.avif",
  ])("[AC-1] does not offer %s locally (not in wave 1)", (name) => {
    expect(browserOpenable(`/p/${name}`, LOCAL)).toBe(false);
  });

  it("[AC-1] reads only the last extension of the file name", () => {
    expect(browserOpenable("/p/site.html/readme", LOCAL)).toBe(false);
    expect(browserOpenable("/p/report.html.txt", LOCAL)).toBe(false);
    expect(browserOpenable("C:\\p\\report.HTML", LOCAL)).toBe(true);
    expect(browserOpenable("/p/html", LOCAL)).toBe(false);
  });
});
