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

import { ImagePreview } from "@/modules/editor/ImagePreview";
import type { WorkspaceEnv } from "@/modules/workspace";

const SSH: WorkspaceEnv = { kind: "ssh", host: "box" };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let created: Blob[];
let revoked: string[];

beforeEach(() => {
  created = [];
  revoked = [];
  // jsdom implements neither, so every URL handed out is recorded here.
  Object.assign(URL, {
    createObjectURL: (blob: Blob) => {
      created.push(blob);
      return `blob:terax/${created.length}`;
    },
    revokeObjectURL: (url: string) => {
      revoked.push(url);
    },
  });
  invoke.mockReset();
  convertFileSrc.mockClear();
});

afterEach(() => {
  cleanup();
});

async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function deferred() {
  let resolve!: (bytes: ArrayBuffer) => void;
  const promise = new Promise<ArrayBuffer>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function imgSrc(container: HTMLElement): string | null {
  return container.querySelector("img")?.getAttribute("src") ?? null;
}

describe("ImagePreview over SSH", () => {
  it("reads the bytes over the remote helper and shows them from a blob URL", async () => {
    invoke.mockResolvedValue(PNG.buffer);
    const { container } = render(
      <ImagePreview path="/home/u/photo.jpg" remote={SSH} size={4096} />,
    );
    expect(imgSrc(container)).toBeNull();
    expect(container.textContent).toContain("Loading");

    await settle();

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("fs_read_remote_image", {
      path: "/home/u/photo.jpg",
      workspace: SSH,
      size: 4096,
    });
    expect(convertFileSrc).not.toHaveBeenCalled();
    expect(imgSrc(container)).toBe("blob:terax/1");
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe("image/jpeg");
    expect(created[0].size).toBe(PNG.byteLength);
  });

  it("revokes the object URL when the path or host changes and on unmount", async () => {
    invoke.mockResolvedValue(PNG.buffer);
    const { container, rerender, unmount } = render(
      <ImagePreview path="/home/u/a.png" remote={SSH} />,
    );
    await settle();
    expect(imgSrc(container)).toBe("blob:terax/1");

    rerender(<ImagePreview path="/home/u/b.png" remote={SSH} />);
    // The revoked URL is never left on screen while the next read runs.
    expect(imgSrc(container)).toBeNull();
    expect(revoked).toEqual(["blob:terax/1"]);
    await settle();
    expect(imgSrc(container)).toBe("blob:terax/2");

    const other: WorkspaceEnv = { kind: "ssh", host: "other" };
    rerender(<ImagePreview path="/home/u/b.png" remote={other} />);
    await settle();
    expect(invoke).toHaveBeenLastCalledWith("fs_read_remote_image", {
      path: "/home/u/b.png",
      workspace: other,
    });
    expect(revoked).toEqual(["blob:terax/1", "blob:terax/2"]);
    expect(imgSrc(container)).toBe("blob:terax/3");

    unmount();
    expect(revoked).toEqual(["blob:terax/1", "blob:terax/2", "blob:terax/3"]);
  });

  it("drops a reply that arrives after the path changed", async () => {
    const first = deferred();
    const second = deferred();
    invoke
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { container, rerender } = render(
      <ImagePreview path="/home/u/a.png" remote={SSH} />,
    );
    await settle();
    rerender(<ImagePreview path="/home/u/b.png" remote={SSH} />);
    await settle();

    first.resolve(PNG.buffer);
    await settle();
    expect(created).toHaveLength(0);
    expect(imgSrc(container)).toBeNull();

    second.resolve(PNG.buffer);
    await settle();
    expect(created).toHaveLength(1);
    expect(imgSrc(container)).toBe("blob:terax/1");
  });

  it("shows why a refused read has no preview instead of a broken image", async () => {
    invoke.mockRejectedValue("sensitive-file: refusing to read");
    const { container } = render(
      <ImagePreview path="/home/u/.env.png" remote={SSH} />,
    );
    await settle();
    expect(imgSrc(container)).toBeNull();
    expect(container.textContent).toContain("Image preview unavailable");
    expect(container.textContent).toContain("sensitive-file");
    expect(created).toHaveLength(0);
  });

  it("refuses a file past the read cap without a round-trip", async () => {
    const { container } = render(
      <ImagePreview path="/home/u/huge.png" remote={SSH} tooLarge />,
    );
    await settle();
    expect(invoke).not.toHaveBeenCalled();
    expect(imgSrc(container)).toBeNull();
    expect(container.textContent).toContain("too large");
  });
});

describe("ImagePreview in a local workspace", () => {
  it("keeps the asset protocol URL and never reads over SSH", async () => {
    const { container } = render(
      <ImagePreview path="/work/photo.png" remote={null} tooLarge />,
    );
    await settle();
    expect(convertFileSrc).toHaveBeenCalledWith("/work/photo.png");
    expect(imgSrc(container)).toBe(
      `asset://localhost/${encodeURIComponent("/work/photo.png")}`,
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(created).toHaveLength(0);
  });
});
