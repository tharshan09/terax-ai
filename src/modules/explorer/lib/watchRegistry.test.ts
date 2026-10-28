import { describe, expect, it, vi } from "vitest";
import { createWatchRegistry, planVisibilityEdge } from "./watchRegistry";

function setup(armed = true) {
  const io = { add: vi.fn(), remove: vi.fn() };
  return { io, registry: createWatchRegistry(io, armed) };
}

const nativePaths = (calls: unknown[][]): string[] =>
  calls.flatMap(([paths]) => paths as string[]);

describe("createWatchRegistry", () => {
  // [AC-1]
  it("releases on disarm, stays silent while disarmed, and arms exactly the current set", () => {
    const { io, registry } = setup();
    registry.addMany(["/ws", "/ws/src"]);
    io.add.mockClear();

    registry.disarm();
    registry.disarm();
    expect(nativePaths(io.remove.mock.calls)).toEqual(["/ws", "/ws/src"]);
    io.remove.mockClear();

    registry.add("/ws/lib");
    registry.remove("/ws/src");
    expect(io.add).not.toHaveBeenCalled();
    expect(io.remove).not.toHaveBeenCalled();

    registry.arm();
    registry.arm();
    expect(nativePaths(io.add.mock.calls)).toEqual(["/ws", "/ws/lib"]);
    expect(io.remove).not.toHaveBeenCalled();
  });

  it("registers natively only while armed, once per path", () => {
    const { io, registry } = setup();
    registry.add("/a");
    registry.add("/a");
    registry.addMany(["/a", "/b", "/c"]);
    expect(io.add.mock.calls).toEqual([[["/a"]], [["/b", "/c"]]]);
    registry.remove("/b");
    registry.remove("/b");
    registry.removeMany(["/c", "/nope"]);
    expect(io.remove.mock.calls).toEqual([[["/b"]], [["/c"]]]);
    expect(registry.paths()).toEqual(["/a"]);
  });

  it("makes no native calls while disarmed, however the set changes", () => {
    const { io, registry } = setup(false);
    registry.add("/a");
    registry.addMany(["/b", "/c"]);
    registry.remove("/b");
    registry.removeMany(["/c"]);
    expect(io.add).not.toHaveBeenCalled();
    expect(io.remove).not.toHaveBeenCalled();
    expect(registry.paths()).toEqual(["/a"]);
    expect(registry.armed).toBe(false);
  });

  it("disarming remembers the set for the next arm", () => {
    const { io, registry } = setup();
    registry.addMany(["/a", "/b"]);
    io.add.mockClear();
    registry.disarm();
    expect(io.remove.mock.calls).toEqual([[["/a", "/b"]]]);
    expect(registry.has("/a")).toBe(true);

    registry.arm();
    expect(io.add.mock.calls).toEqual([[["/a", "/b"]]]);
    expect(registry.armed).toBe(true);
  });

  it("does not touch the native side when arming or disarming an empty set", () => {
    const { io, registry } = setup();
    registry.disarm();
    registry.arm();
    expect(io.add).not.toHaveBeenCalled();
    expect(io.remove).not.toHaveBeenCalled();
  });

  it("clear releases natively only when armed and forgets the set", () => {
    const armed = setup();
    armed.registry.addMany(["/a", "/b"]);
    armed.registry.clear();
    expect(armed.io.remove.mock.calls).toEqual([[["/a", "/b"]]]);
    expect(armed.registry.paths()).toEqual([]);

    const idle = setup(false);
    idle.registry.addMany(["/a"]);
    idle.registry.clear();
    expect(idle.io.remove).not.toHaveBeenCalled();
    expect(idle.registry.paths()).toEqual([]);
  });
});

describe("planVisibilityEdge", () => {
  it("hiding releases the watchers and marks the data stale", () => {
    expect(
      planVisibilityEdge({ visible: false, stale: false, hasRoot: true }),
    ).toEqual({ arm: false, resync: false, stale: true });
  });

  it("showing after a hide re-arms and reloads exactly once", () => {
    const shown = planVisibilityEdge({
      visible: true,
      stale: true,
      hasRoot: true,
    });
    expect(shown).toEqual({ arm: true, resync: true, stale: false });
    expect(
      planVisibilityEdge({ visible: true, stale: shown.stale, hasRoot: true }),
    ).toEqual({ arm: true, resync: false, stale: false });
  });

  it("never reloads a shown explorer with fresh data", () => {
    expect(
      planVisibilityEdge({ visible: true, stale: false, hasRoot: true }),
    ).toEqual({ arm: true, resync: false, stale: false });
  });

  it("has nothing to reload without a root but still clears the stale flag", () => {
    expect(
      planVisibilityEdge({ visible: true, stale: true, hasRoot: false }),
    ).toEqual({ arm: true, resync: false, stale: false });
  });
});
