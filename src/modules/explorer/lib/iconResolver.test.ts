import catppuccinIcons from "@iconify-json/catppuccin/icons.json";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { IconifySet } from "./iconEngine";

const fakeEngine = {
  fileIconUrl: (name: string) => `file:${name}`,
  folderIconUrl: (name: string, open: boolean) => `folder:${name}:${open}`,
};
const loads = vi.hoisted(() => ({ count: 0, fail: 0 }));

type Resolver = typeof import("./iconResolver");

// `doMock` (not `mock`) so every test gets a fresh factory: its body runs
// exactly when the resolver's dynamic `import("./iconEngine")` fires.
async function loadWithFakeEngine(): Promise<Resolver> {
  vi.resetModules();
  loads.count = 0;
  vi.doMock("./iconEngine", () => {
    loads.count++;
    if (loads.fail > 0) {
      loads.fail--;
      throw new Error("chunk failed");
    }
    return { iconEngine: fakeEngine };
  });
  return import("./iconResolver");
}

async function loadWithRealEngine(): Promise<Resolver> {
  vi.resetModules();
  vi.doUnmock("./iconEngine");
  const r = await import("./iconResolver");
  await r.preloadFileIcons();
  return r;
}

beforeEach(() => {
  loads.fail = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("iconResolver (lazy shell)", () => {
  it("costs nothing until something asks: no engine import on module load", async () => {
    const r = await loadWithFakeEngine();
    expect(loads.count).toBe(0);
    expect(r.peekFileIconUrl("a.ts")).toBe("");
    expect(r.peekFolderIconUrl("src", false)).toBe("");
    expect(loads.count).toBe(0);
  });

  it("subscribing requests the engine once, shares the load, and notifies after it lands", async () => {
    const r = await loadWithFakeEngine();
    const a = vi.fn();
    const b = vi.fn();
    r.subscribeFileIcons(a);
    r.subscribeFileIcons(b);
    expect(r.peekFileIconUrl("x.ts")).toBe("");

    await r.preloadFileIcons();

    expect(loads.count).toBe(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(r.peekFileIconUrl("x.ts")).toBe("file:x.ts");
    expect(r.peekFolderIconUrl("src", true)).toBe("folder:src:true");
  });

  it("does not keep listener slots for subscribers that arrive after the load", async () => {
    const r = await loadWithFakeEngine();
    await r.preloadFileIcons();
    const late = vi.fn();
    const unsubscribe = r.subscribeFileIcons(late);
    unsubscribe();
    expect(late).not.toHaveBeenCalled();
    expect(loads.count).toBe(1);
  });

  it("stops notifying an unsubscribed listener", async () => {
    const r = await loadWithFakeEngine();
    const gone = vi.fn();
    const kept = vi.fn();
    r.subscribeFileIcons(gone)();
    r.subscribeFileIcons(kept);
    await r.preloadFileIcons();
    expect(gone).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledTimes(1);
  });

  it("keeps lookups blank after a failed chunk load and recovers on the next demand", async () => {
    const r = await loadWithFakeEngine();
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    loads.fail = 1;
    await r.preloadFileIcons();
    expect(r.peekFileIconUrl("a.ts")).toBe("");
    expect(error).toHaveBeenCalledTimes(1);

    await r.preloadFileIcons();
    expect(r.peekFileIconUrl("a.ts")).toBe("file:a.ts");
  });

  it("reports a persistently failing chunk with console.error exactly once", async () => {
    const r = await loadWithFakeEngine();
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    loads.fail = 3;
    const listener = vi.fn();
    r.subscribeFileIcons(listener);
    await r.preloadFileIcons();
    r.subscribeFileIcons(listener);
    await r.preloadFileIcons();
    await r.preloadFileIcons();
    expect(loads.count).toBe(3);
    expect(r.peekFileIconUrl("a.ts")).toBe("");
    expect(r.peekFolderIconUrl("src", false)).toBe("");
    expect(listener).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });
});

// The cases recorded against the synchronous resolver before it went lazy;
// after the set has loaded they must resolve exactly as before.
describe("loaded icon set keeps the recorded resolution chain", () => {
  let r: Resolver;
  let fileIconUrl: (name: string) => string;
  let folderIconUrl: (name: string, expanded: boolean) => string;
  let DEFAULT: string;

  beforeAll(async () => {
    r = await loadWithRealEngine();
    fileIconUrl = r.peekFileIconUrl;
    folderIconUrl = r.peekFolderIconUrl;
    DEFAULT = fileIconUrl("file-with-no-known-extension");
  });

  describe("fileIconUrl resolution chain", () => {
    it("returns an inline svg data url", () => {
      expect(fileIconUrl("a.ts")).toContain("data:image/svg");
    });

    it("is deterministic for the same extension", () => {
      expect(fileIconUrl("a.ts")).toBe(fileIconUrl("b.ts"));
    });

    it("resolves a known extension to something other than the default", () => {
      expect(fileIconUrl("a.ts")).not.toBe(DEFAULT);
    });

    it("distinguishes a compound extension from its base", () => {
      expect(fileIconUrl("component.test.tsx")).not.toBe(
        fileIconUrl("component.tsx"),
      );
    });

    it("resolves a by-name match (no extension) to a non-default icon", () => {
      expect(fileIconUrl("Dockerfile")).not.toBe(DEFAULT);
    });

    it("falls back to the default for an unknown extension", () => {
      expect(fileIconUrl("mystery.qzxwv")).toBe(DEFAULT);
    });
  });

  describe("folderIconUrl", () => {
    it("returns an inline svg data url", () => {
      expect(folderIconUrl("src", false)).toContain("data:image/svg");
    });

    it("uses distinct open and closed icons for a mapped folder", () => {
      const closed = folderIconUrl("src", false);
      const expanded = folderIconUrl("src", true);
      expect(expanded).toContain("data:image/svg");
      expect(expanded).not.toBe(closed);
    });

    it("differs from the confirmed unknown-folder fallback when mapped", () => {
      const fallback = folderIconUrl("qzxwv-dir", false);
      const fallbackExpanded = folderIconUrl("qzxwv-dir", true);
      expect(fallback).toContain("data:image/svg");
      expect(fallbackExpanded).toContain("data:image/svg");
      expect(fallbackExpanded).not.toBe(fallback);
      expect(folderIconUrl("src", false)).not.toBe(fallback);
    });
  });

  describe("same icon per name as the synchronous resolver", () => {
    const set = catppuccinIcons as unknown as IconifySet;
    const svgUrl = (slug: string) => {
      const body = set.icons[slug]?.body;
      if (!body) throw new Error(`no icon "${slug}" in the set`);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${set.width ?? 16} ${set.height ?? 16}">${body}</svg>`;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    };

    // Slugs the synchronous resolver produced for these names.
    const FILES: Record<string, string> = {
      "a.ts": "typescript",
      "b.ts": "typescript",
      "component.test.tsx": "typescript-test",
      "component.tsx": "typescript-react",
      Dockerfile: "docker",
      "mystery.qzxwv": "file",
      "file-with-no-known-extension": "file",
      untitled: "file",
      "dummy.txt": "text",
      "main.rs": "rust",
      "index.tsx": "typescript-react",
      "package.json": "package-json",
      "README.md": "readme",
      "styles.css": "css",
      "types.d.ts": "typescript-def",
      "Cargo.toml": "cargo",
      ".gitignore": "git",
      "dummy.py": "python",
      "dummy.go": "go",
      "vite.config.ts": "vite",
      ".env": "env",
      "tsconfig.json": "typescript-config",
      Makefile: "makefile",
      "image.png": "image",
    };
    const FOLDERS: Record<string, [string, string]> = {
      src: ["folder-src", "folder-src-open"],
      "qzxwv-dir": ["folder", "folder-open"],
      "": ["folder", "folder-open"],
      node_modules: ["folder-node", "folder-node-open"],
      ".git": ["folder-git", "folder-git-open"],
      tests: ["folder-tests", "folder-tests-open"],
      docs: ["folder-docs", "folder-docs-open"],
    };

    it.each(Object.entries(FILES))("file %s -> %s", (name, slug) => {
      expect(fileIconUrl(name)).toBe(svgUrl(slug));
    });

    it.each(Object.entries(FOLDERS))(
      "folder %s -> %s",
      (name, [closed, open]) => {
        expect(folderIconUrl(name, false)).toBe(svgUrl(closed));
        expect(folderIconUrl(name, true)).toBe(svgUrl(open));
      },
    );
  });
});
