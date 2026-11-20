import { copyFailureReason } from "@/lib/copyFailure";
import { describe, expect, it } from "vitest";

describe("copyFailureReason", () => {
  const failed = [
    { source: "/x/b.png", message: "Permission denied" },
    { source: "/x/c.zip", message: "lost", maybePlaced: true },
  ];

  it("names the first failed item with its message", () => {
    expect(copyFailureReason({ created: [], failed })).toBe(
      "/x/b.png: Permission denied",
    );
    expect(copyFailureReason({ created: [], failed }, () => "b")).toBe(
      "b: Permission denied",
    );
  });

  it("lets a lost connection beat the first failed item", () => {
    expect(
      copyFailureReason({ created: [], failed, aborted: "connection lost" }),
    ).toBe("connection lost");
  });

  it("has no reason when nothing failed", () => {
    expect(copyFailureReason({ created: ["/ws/a"], failed: [] })).toBeNull();
    expect(
      copyFailureReason({ created: [], failed: [], aborted: null }),
    ).toBeNull();
  });
});
