import { describe, expect, it } from "vitest";
import type { WorkspaceEnv } from "@/modules/workspace";
import {
  type PaneEnvSession,
  paneWorkspace,
  spawnEnvFor,
} from "@/modules/terminal/lib/paneEnv";

const DEVBOX: WorkspaceEnv = { kind: "ssh", host: "devbox" };
const LOCAL: WorkspaceEnv = { kind: "local" };

function spawned(
  own: WorkspaceEnv | undefined,
  ambient: () => WorkspaceEnv,
): PaneEnvSession {
  return {
    disposed: false,
    workspace: own,
    spawnEnv: spawnEnvFor(own, ambient),
  };
}

describe("paneWorkspace", () => {
  it("keeps reporting SSH for a tab without its own env spawned in an SSH workspace", () => {
    let active: WorkspaceEnv = DEVBOX;
    const session = spawned(undefined, () => active);
    active = LOCAL;
    expect(paneWorkspace(session)).toEqual({ kind: "ssh", host: "devbox" });
  });

  it("reports local for a pane spawned locally", () => {
    expect(paneWorkspace(spawned(undefined, () => LOCAL))).toEqual(LOCAL);
  });

  it("lets a tab's own env win over the active one", () => {
    expect(paneWorkspace(spawned(DEVBOX, () => LOCAL))).toEqual(DEVBOX);
  });

  it("falls back to the tab's env before the PTY has spawned", () => {
    expect(
      paneWorkspace({ disposed: false, workspace: DEVBOX, spawnEnv: null }),
    ).toEqual(DEVBOX);
  });

  it("is null once the pane is closed or gone", () => {
    const session = spawned(undefined, () => DEVBOX);
    session.disposed = true;
    expect(paneWorkspace(session)).toBeNull();
    expect(paneWorkspace(undefined)).toBeNull();
  });
});
