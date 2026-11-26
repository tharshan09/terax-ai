import type {
  BrowserOpen,
  BrowserOpenStatus,
  FrameSource,
  FrameStatus,
} from "@/modules/preview-server/types";
import { describe, expect, expectTypeOf, it } from "vitest";

// Written out from the Rust wire values (`preview_contracts.rs`), not derived
// from the types under test. `pnpm check-types` enforces the type assertions;
// the `satisfies` records fail to compile on a missing or an extra status.
const BROWSER_OPEN_STATUSES = {
  opened: true,
  unsupported: true,
  refused: true,
  too_large: true,
  unreachable: true,
  limit_reached: true,
  open_failed: true,
} satisfies Record<BrowserOpenStatus, true>;

const FRAME_STATUSES = {
  ready: true,
  unsupported: true,
  refused: true,
  too_large: true,
  unreachable: true,
  limit_reached: true,
} satisfies Record<FrameStatus, true>;

describe("preview server wire types", () => {
  it("[AC-3] BrowserOpen has exactly status and reason", () => {
    expectTypeOf<keyof BrowserOpen>().toEqualTypeOf<"status" | "reason">();
    expectTypeOf<BrowserOpen>().toEqualTypeOf<{
      status: BrowserOpenStatus;
      reason: string | null;
    }>();
  });

  it("[AC-3] FrameSource has exactly status, url and reason", () => {
    expectTypeOf<keyof FrameSource>().toEqualTypeOf<
      "status" | "url" | "reason"
    >();
    expectTypeOf<FrameSource>().toEqualTypeOf<{
      status: FrameStatus;
      url: string | null;
      reason: string | null;
    }>();
  });

  it("[AC-3] BrowserOpenStatus is exactly the seven Rust wire values", () => {
    expectTypeOf<BrowserOpenStatus>().toEqualTypeOf<
      | "opened"
      | "unsupported"
      | "refused"
      | "too_large"
      | "unreachable"
      | "limit_reached"
      | "open_failed"
    >();
    expect(Object.keys(BROWSER_OPEN_STATUSES).sort()).toEqual(
      [
        "opened",
        "unsupported",
        "refused",
        "too_large",
        "unreachable",
        "limit_reached",
        "open_failed",
      ].sort(),
    );
  });

  it("[AC-3] FrameStatus is exactly the six Rust wire values", () => {
    expectTypeOf<FrameStatus>().toEqualTypeOf<
      | "ready"
      | "unsupported"
      | "refused"
      | "too_large"
      | "unreachable"
      | "limit_reached"
    >();
    expect(Object.keys(FRAME_STATUSES).sort()).toEqual(
      [
        "ready",
        "unsupported",
        "refused",
        "too_large",
        "unreachable",
        "limit_reached",
      ].sort(),
    );
  });
});
