import { describe, expect, it } from "vitest";
import { filterReadableHits } from "./search";

describe("filterReadableHits — FS-7 grep/glob hit filter", () => {
  it("drops secret-basename and protected-dir hits, keeps clean ones", () => {
    const hits = [
      { path: "/home/u/project/.env" }, // secret basename
      { path: "/etc/nginx/nginx.conf" }, // protected dir
      { path: "/home/u/project/src/main.rs" },
      { path: "/home/u/project/README.md" },
    ];
    expect(filterReadableHits(hits)).toEqual([
      { path: "/home/u/project/src/main.rs" },
      { path: "/home/u/project/README.md" },
    ]);
  });

  it("filters on `path`, not `rel`, even when a `rel` field is present", () => {
    // A clean `rel` must not rescue a secret `path` — document that the field
    // choice is `path`.
    const hits = [
      { path: "/home/u/project/.env", rel: "src/main.rs" },
      { path: "/home/u/project/src/main.rs", rel: "src/main.rs" },
    ];
    expect(filterReadableHits(hits)).toEqual([
      { path: "/home/u/project/src/main.rs", rel: "src/main.rs" },
    ]);
  });
});
