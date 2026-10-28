// GUARD: Window visibility has one owner; no other source reads document visibility on its own.
// DISPOSITION: specs/2026-10-20-upstream-sync-090/architecture.md#anti-slop-dispositions
// RULE: --
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));

const VISIBILITY_READ = /document\.hidden|visibilityState|visibilitychange/;

/** File (relative to src/) -> why it may read document visibility itself. */
const ALLOWED: Record<string, string> = {
  "lib/windowVisibility.ts": "the owner",
  "modules/terminal/lib/rendererPool.ts":
    "couples focus and visibility for cursor blink and renderer slots",
};

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (
      /\.[cm]?[jt]sx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name)
    )
      out.push(path);
  }
  return out;
}

const files = sources(SRC).map((path) =>
  relative(SRC, path).split(sep).join("/"),
);

describe("window visibility owner", () => {
  it("scans the app sources", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("lib/windowVisibility.ts");
  });

  it("reads document visibility only in the allowlisted files", () => {
    const offenders = files.filter(
      (file) =>
        !(file in ALLOWED) &&
        VISIBILITY_READ.test(readFileSync(join(SRC, file), "utf8")),
    );
    expect(
      offenders,
      "use isWindowHidden / subscribeWindowHidden / useWindowHidden from @/lib/windowVisibility",
    ).toEqual([]);
  });

  it("keeps the allowlist honest", () => {
    for (const file of Object.keys(ALLOWED)) {
      expect(
        VISIBILITY_READ.test(readFileSync(join(SRC, file), "utf8")),
        `${file} no longer reads document visibility; drop it from ALLOWED`,
      ).toBe(true);
    }
  });
});
