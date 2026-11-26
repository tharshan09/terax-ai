import type { FrameStatus } from "@/modules/preview-server/types";
import type { WorkspaceEnv } from "@/modules/workspace";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type FrameAnswer,
  frameRoute,
  HTML_PREVIEW_VIA_SERVER,
  htmlPreviewSource,
} from "./htmlPreviewSource";

const LOCAL: WorkspaceEnv = { kind: "local" };
const SSH: WorkspaceEnv = { kind: "ssh", host: "devbox" };
const WSL: WorkspaceEnv = { kind: "wsl", distro: "Ubuntu" };
const PLACES: Array<[string, WorkspaceEnv | undefined]> = [
  ["local", LOCAL],
  ["ssh", SSH],
  ["wsl", WSL],
  ["no workspace", undefined],
];
const FRAME_URL = "http://127.0.0.1:5000/T/a.html";

describe("htmlPreviewSource", () => {
  it("[AC-12] with the server on: server, server, srcdoc, server", () => {
    expect(PLACES.map(([, ws]) => htmlPreviewSource(ws, true))).toEqual([
      "server",
      "server",
      "srcdoc",
      "server",
    ]);
  });

  it("[AC-12] with the server off: asset, srcdoc, srcdoc, asset", () => {
    expect(PLACES.map(([, ws]) => htmlPreviewSource(ws, false))).toEqual([
      "asset",
      "srcdoc",
      "srcdoc",
      "asset",
    ]);
  });

  it("[AC-12] the server is on in wave 1", () => {
    expect(HTML_PREVIEW_VIA_SERVER).toBe(true);
  });
});

// The decided route for each answer of preview_frame_source and for a failed
// call, local and over SSH. Typed as a record over the status union, so a new
// status fails the type check here as well as in frameRoute.
type Expected = { local: string; ssh: string };
const BY_ANSWER: Record<FrameStatus | "call_failed", Expected> = {
  ready: { local: "server", ssh: "server" },
  unsupported: { local: "asset", ssh: "srcdoc" },
  refused: { local: "asset", ssh: "srcdoc" },
  too_large: { local: "asset", ssh: "srcdoc" },
  unreachable: { local: "asset", ssh: "srcdoc" },
  limit_reached: { local: "asset", ssh: "srcdoc" },
  call_failed: { local: "asset", ssh: "srcdoc" },
};

function answer(status: FrameStatus | "call_failed"): FrameAnswer {
  if (status === "call_failed") return { status };
  return status === "ready"
    ? { status, url: FRAME_URL, reason: null }
    : {
        status,
        url: null,
        reason: status === "refused" ? "path is inside a .git folder" : null,
      };
}

describe("frameRoute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(
    Object.entries(BY_ANSWER) as Array<[FrameStatus | "call_failed", Expected]>,
  )(
    "[AC-13] %s loads the decided way, locally and over SSH",
    (status, expected) => {
      expect(frameRoute(answer(status), LOCAL).kind).toBe(expected.local);
      expect(frameRoute(answer(status), SSH).kind).toBe(expected.ssh);
      expect(frameRoute(answer(status), undefined).kind).toBe(expected.local);
    },
  );

  it("[AC-13] ready hands over the address for the frame", () => {
    expect(frameRoute(answer("ready"), LOCAL)).toEqual({
      kind: "server",
      url: FRAME_URL,
    });
  });

  it("[AC-13] a status unknown to this build loads the built-in way and warns with the status only", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const odd = {
      status: "paused",
      url: FRAME_URL,
      reason: null,
    } as unknown as FrameAnswer;
    expect(frameRoute(odd, SSH)).toEqual({ kind: "srcdoc" });
    expect(frameRoute(odd, LOCAL)).toEqual({ kind: "asset" });
    expect(warn).toHaveBeenCalledTimes(2);
    const text = warn.mock.calls.flat().join(" ");
    expect(text).toContain("paused");
    expect(text).not.toContain("127.0.0.1");
  });

  it("[AC-13] ready without an address loads the built-in way", () => {
    expect(
      frameRoute({ status: "ready", url: null, reason: null }, SSH),
    ).toEqual({ kind: "srcdoc" });
  });
});
