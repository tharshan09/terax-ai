import { describe, expect, it } from "vitest";
import { type WorkspaceEnv, workspaceScopeKey } from "./env";

// workspaceScopeKey is the sole producer of the per-environment scope key used
// to bucket persistent shell sessions (ai/tools/shell.ts), the diff cache and
// source-control state (useSourceControl.ts). A collision would leak one
// environment's cached state into another - e.g. a command run against SSH host
// A reusing a session that actually lives on host B.
describe("workspaceScopeKey", () => {
  it("returns a stable key per env kind", () => {
    expect(workspaceScopeKey({ kind: "local" })).toBe("local");
    expect(workspaceScopeKey({ kind: "wsl", distro: "Ubuntu" })).toBe(
      "wsl:Ubuntu",
    );
    expect(workspaceScopeKey({ kind: "ssh", host: "box" })).toBe("ssh:box");
  });

  it("never collides across two SSH hosts", () => {
    expect(workspaceScopeKey({ kind: "ssh", host: "alpha" })).not.toBe(
      workspaceScopeKey({ kind: "ssh", host: "beta" }),
    );
  });

  it("never collides across two WSL distros", () => {
    expect(workspaceScopeKey({ kind: "wsl", distro: "Ubuntu" })).not.toBe(
      workspaceScopeKey({ kind: "wsl", distro: "Debian" }),
    );
  });

  it("never collides across env kinds", () => {
    const keys = [
      workspaceScopeKey({ kind: "local" }),
      workspaceScopeKey({ kind: "wsl", distro: "box" }),
      workspaceScopeKey({ kind: "ssh", host: "box" }),
    ];
    // Even when the distro and host strings are identical ("box"), the kind
    // prefix keeps the keys distinct.
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("ignores the optional SSH label (it is not part of identity)", () => {
    const withLabel: WorkspaceEnv = {
      kind: "ssh",
      host: "box",
      label: "Production",
    };
    expect(workspaceScopeKey(withLabel)).toBe(
      workspaceScopeKey({ kind: "ssh", host: "box" }),
    );
  });
});
