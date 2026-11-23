import { describe, expect, it } from "vitest";
import type { AgentSession } from "@/modules/agents/lib/types";
import {
  groupAggregateStatus,
  selectTabAgentStatus,
} from "./selectTabAgentStatus";

const sessions = {
  21: { status: "working" },
  22: { status: "waiting" },
  31: { status: "idle" },
} as unknown as Record<number, AgentSession>;

describe("groupAggregateStatus", () => {
  it("lets waiting win over working and ignores idle or unknown panes", () => {
    expect(groupAggregateStatus(sessions, [21, 22])).toBe("waiting");
    expect(groupAggregateStatus(sessions, [21, 31])).toBe("working");
    expect(groupAggregateStatus(sessions, [31, 99])).toBeNull();
  });

  it("leaves the tab badge rule alone", () => {
    expect(selectTabAgentStatus(sessions, [21, 22])).toBe("working");
  });

  it("returns the same primitive for the same input", () => {
    expect(
      Object.is(
        groupAggregateStatus(sessions, [21, 22]),
        groupAggregateStatus(sessions, [21, 22]),
      ),
    ).toBe(true);
  });
});
