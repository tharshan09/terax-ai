import { describe, expect, it } from "vitest";
import { aggregateAgentStatus } from "./aggregateAgentStatus";

describe("aggregateAgentStatus", () => {
  it("returns null for no panes", () => {
    expect(aggregateAgentStatus([])).toBeNull();
  });

  it("returns null when every pane is undefined (no agent)", () => {
    expect(aggregateAgentStatus([undefined, undefined])).toBeNull();
  });

  it("returns working when any pane is working", () => {
    expect(aggregateAgentStatus([undefined, "working"])).toBe("working");
  });

  it("returns waiting when only waiting panes are present", () => {
    expect(aggregateAgentStatus([undefined, "waiting"])).toBe("waiting");
  });

  it("prefers working over waiting", () => {
    expect(aggregateAgentStatus(["waiting", "working"])).toBe("working");
  });
});
