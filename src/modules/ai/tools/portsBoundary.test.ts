import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "./context";
import { buildTerminalTools } from "./terminal";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

// BR-13: forwarding is user-triggered only, so open_preview opens and nothing
// in the AI module reaches the forward commands or the ports module.
const AI = fileURLToPath(new URL("..", import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(path);
  }
  return out;
}

const PORTS_SURFACE = /ssh_port_|modules\/ports/;

const openPreview = vi.fn((_url: string) => true);

function openPreviewTool() {
  const ctx = { openPreview } as unknown as ToolContext;
  const tool = buildTerminalTools(ctx).open_preview;
  return (url: string) =>
    tool.execute?.({ url }, { toolCallId: "t", messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("agent ports boundary", () => {
  it("never reaches the forward commands from the AI module", () => {
    const offenders = sources(AI).filter((file) =>
      PORTS_SURFACE.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("opens a loopback URL as is, without forwarding", async () => {
    const run = openPreviewTool();
    expect(await run("http://localhost:3000")).toEqual({
      url: "http://localhost:3000",
      ok: true,
    });
    expect(openPreview).toHaveBeenCalledExactlyOnceWith(
      "http://localhost:3000",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("accepts the same hosts as before the shared loopback rule", async () => {
    const run = openPreviewTool();
    for (const url of [
      "http://127.0.0.1:8000",
      "http://0.0.0.0:3000",
      "http://[::1]:4000/",
      "https://app.localhost:5173/x",
    ])
      expect(await run(url)).toEqual({ url, ok: true });
    for (const url of [
      "http://192.168.1.5:3000",
      "http://localhost.example.com",
      "https://example.com",
    ])
      expect(await run(url)).toMatchObject({ url, error: expect.any(String) });
    expect(await run("file:///etc/hosts")).toMatchObject({
      error: "only http/https URLs are allowed",
    });
  });
});
