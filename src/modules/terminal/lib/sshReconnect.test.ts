import { describe, expect, it } from "vitest";
import { isSshDisconnect } from "./sshReconnect";

describe("isSshDisconnect", () => {
  it("treats a non-zero exit on an SSH tab as a dropped connection", () => {
    expect(isSshDisconnect({ kind: "ssh", host: "box" }, 255)).toBe(true);
    expect(isSshDisconnect({ kind: "ssh", host: "box" }, 1)).toBe(true);
  });

  it("treats a clean exit (0) on an SSH tab as a real exit, so the tab closes", () => {
    expect(isSshDisconnect({ kind: "ssh", host: "box" }, 0)).toBe(false);
  });

  it("never offers reconnect for local, WSL, or unknown workspaces", () => {
    expect(isSshDisconnect(undefined, 255)).toBe(false);
    expect(isSshDisconnect({ kind: "local" }, 255)).toBe(false);
    expect(isSshDisconnect({ kind: "wsl", distro: "Ubuntu" }, 1)).toBe(false);
  });
});
