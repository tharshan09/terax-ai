// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { invoke, convertFileSrc } = vi.hoisted(() => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn(
    (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
  ),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke, convertFileSrc }));
vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(),
  listen: () => Promise.resolve(() => {}),
}));
vi.mock("@/modules/editor/lib/useEditorThemeExt", () => ({
  useEditorThemeExt: () => [],
}));

import { EditorPane } from "@/modules/editor/EditorPane";
import { LOCAL_WORKSPACE, useWorkspaceEnvStore } from "@/modules/workspace";

const PHOTO = "/work/photo.png";
const ASSET_SRC = `asset://localhost/${encodeURIComponent(PHOTO)}`;

beforeEach(() => {
  useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
  invoke.mockReset();
  convertFileSrc.mockClear();
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "fs_read_file") {
      return Promise.resolve({ kind: "binary", size: 8 });
    }
    return Promise.resolve(null);
  });
});

afterEach(() => {
  cleanup();
  useWorkspaceEnvStore.setState({ env: LOCAL_WORKSPACE });
});

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

describe("EditorPane binary preview env", () => {
  it("keeps a local tab on the asset protocol after the ambient env moves to SSH", async () => {
    const { container, rerender } = render(<EditorPane path={PHOTO} />);
    await settle();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      ASSET_SRC,
    );

    act(() => {
      useWorkspaceEnvStore.getState().setEnv({ kind: "ssh", host: "box" });
    });
    rerender(<EditorPane path={PHOTO} visible={false} />);
    await settle();
    rerender(<EditorPane path={PHOTO} />);
    await settle();

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      ASSET_SRC,
    );
    const commands = invoke.mock.calls.map(([cmd]) => cmd);
    expect(commands).not.toContain("fs_read_remote_image");
    expect(invoke).toHaveBeenCalledWith("fs_read_file", {
      path: PHOTO,
      workspace: LOCAL_WORKSPACE,
      trusted: true,
    });
  });

  it.each([
    "/home/u/clip.mp4",
    "/home/u/song.mp3",
    "/home/u/report.pdf",
  ])("shows the card for %s over SSH without touching the asset protocol", async (path) => {
    const { container } = render(
      <EditorPane path={path} workspace={{ kind: "ssh", host: "box" }} />,
    );
    await settle();

    const commands = invoke.mock.calls.map(([cmd]) => cmd);
    expect(commands).not.toContain("asset_allow");
    expect(convertFileSrc).not.toHaveBeenCalled();
    expect(container.querySelector("video, audio, iframe, img")).toBeNull();
    expect(container.textContent).toContain("preview not available over SSH");
    expect(container.textContent).not.toContain("Open with default app");
  });
});
