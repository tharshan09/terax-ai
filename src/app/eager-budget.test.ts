import { describe, expect, it } from "vitest";
import { traceEager } from "../../scripts/eager-graph.mjs";

// Locks the startup-bundle invariant: the heavy editor / AI / markdown stacks
// must stay out of the eager graph of both window entries so they load only
// when the user opens those surfaces. A static import that re-introduces any of
// these (e.g. a barrel re-export of chat runtime, or a `cn`-style util getting
// absorbed into a feature chunk) will fail here. xterm and motion are
// intentionally eager (terminal-first shell) and are not asserted against.
const HEAVY = [
  "@ai-sdk",
  "ai",
  "streamdown",
  "katex",
  "@codemirror",
  "@uiw",
  // The icon set may only be reached through the dynamic import in iconResolver.ts.
  "@iconify-json",
];

const ICON_DATA_FILES = [
  "src/modules/explorer/lib/fileIcons.ts",
  "src/modules/explorer/lib/folderIcons.ts",
  "src/modules/explorer/lib/iconEngine.ts",
];

function heavyEagerHits(entry: string): string[] {
  const { files, hits } = traceEager(entry, HEAVY);
  const eagerFiles = [...files];
  const fileHits = ICON_DATA_FILES.filter((data) =>
    eagerFiles.some((file) => file.endsWith(`/${data}`)),
  );
  return [
    ...[...hits.entries()].map(([pkg, info]) => `${pkg} <- ${info.file}`),
    ...fileHits,
  ];
}

describe("startup bundle budget", () => {
  it("main window does not eagerly pull editor/AI/markdown stacks or icon data", () => {
    expect(heavyEagerHits("src/main.tsx")).toEqual([]);
  });

  it("settings window does not eagerly pull editor/AI/markdown stacks or icon data", () => {
    expect(heavyEagerHits("src/settings/main.tsx")).toEqual([]);
  });
});
