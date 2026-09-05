import { describe, expect, it } from "vitest";
import { envsMatch } from "./useWorkspaceCwd";

// envsMatch decides whether a cached/inherited cwd may be reused for a target
// env. A false positive hands a path to the wrong shell environment (a local
// /Users path to a remote host, or one SSH host's cwd to another) - silent
// ENOENT at best, a read against the wrong machine at worst.
describe("envsMatch", () => {
  it("treats an absent env as Local", () => {
    expect(envsMatch(undefined, { kind: "local" })).toBe(true);
    expect(envsMatch(undefined, { kind: "ssh", host: "box" })).toBe(false);
    expect(envsMatch(undefined, { kind: "wsl", distro: "Ubuntu" })).toBe(false);
  });

  it("matches Local to Local", () => {
    expect(envsMatch({ kind: "local" }, { kind: "local" })).toBe(true);
  });

  it("never matches across different kinds", () => {
    expect(envsMatch({ kind: "local" }, { kind: "ssh", host: "box" })).toBe(
      false,
    );
    expect(
      envsMatch({ kind: "wsl", distro: "Ubuntu" }, { kind: "ssh", host: "box" }),
    ).toBe(false);
  });

  it("matches SSH only on the same host", () => {
    expect(
      envsMatch({ kind: "ssh", host: "alpha" }, { kind: "ssh", host: "alpha" }),
    ).toBe(true);
    // Two different SSH hosts must never share a cwd cache entry.
    expect(
      envsMatch({ kind: "ssh", host: "alpha" }, { kind: "ssh", host: "beta" }),
    ).toBe(false);
  });

  it("matches WSL only on the same distro", () => {
    expect(
      envsMatch(
        { kind: "wsl", distro: "Ubuntu" },
        { kind: "wsl", distro: "Ubuntu" },
      ),
    ).toBe(true);
    expect(
      envsMatch(
        { kind: "wsl", distro: "Ubuntu" },
        { kind: "wsl", distro: "Debian" },
      ),
    ).toBe(false);
  });
});
