// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fakeEngine = {
  fileIconUrl: (name: string) => `data:file,${name}`,
  folderIconUrl: (name: string, open: boolean) => `data:folder,${name}:${open}`,
};

type Modules = {
  FileIcon: typeof import("./FileIcon").FileIcon;
  FolderIcon: typeof import("./FileIcon").FolderIcon;
  preloadFileIcons: typeof import("./lib/iconResolver").preloadFileIcons;
  loads: () => number;
  release: () => void;
};

// The engine import is held until `release()`, so the placeholder phase is observable.
async function setup(outcome: "load" | "fail"): Promise<Modules> {
  vi.resetModules();
  let count = 0;
  let open: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  vi.doMock("./lib/iconEngine", async () => {
    count++;
    await gate;
    if (outcome === "fail") throw new Error("chunk failed");
    return { iconEngine: fakeEngine };
  });
  const { FileIcon, FolderIcon } = await import("./FileIcon");
  const { preloadFileIcons } = await import("./lib/iconResolver");
  return {
    FileIcon,
    FolderIcon,
    preloadFileIcons,
    loads: () => count,
    release: () => open(),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.doUnmock("./lib/iconEngine");
});

describe("FileIcon / FolderIcon", () => {
  it("fetches the icon set once, holds a same-size slot, then fades the icon in", async () => {
    const m = await setup("load");
    const tree = render(
      <div>
        <m.FileIcon name="a.ts" className="size-4 shrink-0" />
        <m.FolderIcon
          name="src"
          expanded
          width={15}
          height={15}
          className="mx-1.5"
        />
      </div>,
    );

    expect(tree.container.querySelector("img")).toBeNull();
    const slots = tree.container.querySelectorAll("span[aria-hidden]");
    expect(slots).toHaveLength(2);
    expect(slots[0].className).toBe("block size-4 shrink-0");
    expect((slots[1] as HTMLElement).style.width).toBe("15px");
    expect((slots[1] as HTMLElement).style.height).toBe("15px");
    expect(slots[1].className).toBe("block mx-1.5");

    const tabs = render(<m.FileIcon name="b.rs" className="size-3.5" />);
    await vi.waitFor(() => expect(m.loads()).toBe(1));
    expect(tabs.container.querySelector("img")).toBeNull();
    expect(tree.container.querySelector("img")).toBeNull();

    await act(async () => {
      m.release();
      await m.preloadFileIcons();
    });

    const imgs = tree.container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    expect(tree.container.querySelector("span[aria-hidden]")).toBeNull();
    expect(imgs[0].getAttribute("src")).toBe("data:file,a.ts");
    expect(imgs[0].getAttribute("alt")).toBe("");
    expect(imgs[0].className).toBe("size-4 shrink-0 terax-icon-in");
    expect(imgs[1].getAttribute("src")).toBe("data:folder,src:true");
    expect(imgs[1].getAttribute("width")).toBe("15");
    expect(imgs[1].getAttribute("height")).toBe("15");
    expect(imgs[1].className).toBe("mx-1.5 terax-icon-in");
    expect(tabs.container.querySelector("img")?.getAttribute("src")).toBe(
      "data:file,b.rs",
    );

    const palette = render(<m.FileIcon name="c.md" className="size-4" />);
    const late = palette.container.querySelector("img");
    expect(late?.getAttribute("src")).toBe("data:file,c.md");
    expect(late?.className).toBe("size-4");
    expect(m.loads()).toBe(1);
  });

  it("keeps the placeholder and logs once when the icon chunk does not load", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const m = await setup("fail");
    const view = render(
      <div>
        <m.FileIcon name="a.ts" className="size-4" />
        <m.FileIcon name="b.ts" className="size-4" />
        <m.FolderIcon name="src" className="size-4" />
      </div>,
    );

    await act(async () => {
      m.release();
      await m.preloadFileIcons();
    });

    const more = render(<m.FileIcon name="c.ts" className="size-4" />);
    await act(async () => {
      await m.preloadFileIcons();
    });

    expect(view.container.querySelector("img")).toBeNull();
    expect(view.container.querySelectorAll("span[aria-hidden]")).toHaveLength(
      3,
    );
    expect(more.container.querySelector("img")).toBeNull();
    expect(more.container.querySelector("span[aria-hidden]")).not.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
  });
});
