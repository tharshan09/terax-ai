import { describe, expect, it } from "vitest";
import { isLikelyExecutable } from "./openWith";

describe("isLikelyExecutable", () => {
  it("flags executables / installers / launchers across platforms", () => {
    for (const p of [
      "/repo/installer.command",
      "/repo/setup.bat",
      "/Applications/Evil.app",
      "C:/Users/me/Downloads/thing.exe",
      "/repo/launch.desktop",
      "/repo/run.ps1",
      "/repo/x.msi",
      "/repo/a.jar",
    ]) {
      expect(isLikelyExecutable(p)).toBe(true);
    }
  });

  it("catches a disguised double extension (report.pdf.exe)", () => {
    expect(isLikelyExecutable("/downloads/report.pdf.exe")).toBe(true);
  });

  it("is case-insensitive on the extension", () => {
    expect(isLikelyExecutable("/repo/Setup.EXE")).toBe(true);
  });

  it("allows ordinary documents and media", () => {
    for (const p of [
      "/repo/report.pdf",
      "/repo/archive.zip",
      "/repo/clip.mp4",
      "/repo/notes.docx",
      "/repo/image.png",
    ]) {
      expect(isLikelyExecutable(p)).toBe(false);
    }
  });

  it("treats plain source files as viewable, not executable", () => {
    // Their default handler is an editor, not an interpreter.
    for (const p of ["/repo/script.js", "/repo/main.py", "/repo/build.sh"]) {
      expect(isLikelyExecutable(p)).toBe(false);
    }
  });

  it("does not treat an extensionless file or a dotfile as executable", () => {
    expect(isLikelyExecutable("/usr/local/bin/tool")).toBe(false);
    expect(isLikelyExecutable("/repo/.gitignore")).toBe(false);
  });
});
