import { describe, expect, it } from "vitest";
import { labelFor } from "./tabLabel";
import type { TerminalTab } from "./useTabs";

function terminalTab(over: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id: 1,
    kind: "terminal",
    spaceId: "default",
    title: "shell",
    paneTree: { kind: "leaf", id: 2 },
    activeLeafId: 2,
    ...over,
  };
}

describe("labelFor (terminal tabs)", () => {
  it("derives the label from the last cwd segment", () => {
    expect(labelFor(terminalTab({ cwd: "/Users/me/projects/terax-ai" }))).toBe(
      "terax-ai",
    );
  });

  it("falls back to the title when there is no cwd", () => {
    expect(labelFor(terminalTab({ title: "private" }))).toBe("private");
  });

  it("prefers a custom title over the cwd-derived name", () => {
    expect(
      labelFor(terminalTab({ cwd: "/Users/me/projects/terax-ai", customTitle: "Server" })),
    ).toBe("Server");
  });

  it("keeps the custom title after the cwd changes (survives cd)", () => {
    const renamed = terminalTab({ cwd: "/Users/me/a", customTitle: "Server" });
    const afterCd = { ...renamed, cwd: "/Users/me/b/c" };
    expect(labelFor(afterCd)).toBe("Server");
  });

  it("handles Windows-style cwd separators", () => {
    expect(labelFor(terminalTab({ cwd: "C:\\Users\\me\\proj" }))).toBe("proj");
  });

  it("shows the tmux session name instead of the (always '~') cwd", () => {
    expect(
      labelFor(terminalTab({ cwd: "~", tmuxSession: "main" })),
    ).toBe("main");
  });

  it("lets a custom title still win over the tmux session", () => {
    expect(
      labelFor(terminalTab({ cwd: "~", tmuxSession: "main", customTitle: "Server" })),
    ).toBe("Server");
  });

  it("keeps the cwd label for a managed (restart-safe) session, not the token", () => {
    expect(
      labelFor(
        terminalTab({
          cwd: "/Users/me/projects/trade-insight",
          tmuxSession: "terax-rs-fe9da7a131d3",
        }),
      ),
    ).toBe("trade-insight");
  });

  it("follows the focused pane's cwd in a split", () => {
    const split = terminalTab({
      cwd: "/Users/me/a",
      paneTree: {
        kind: "split",
        id: 10,
        dir: "row",
        children: [
          { kind: "leaf", id: 2, cwd: "/Users/me/a" },
          { kind: "leaf", id: 3, cwd: "/Users/me/b/api" },
        ],
      },
      activeLeafId: 3,
    });
    expect(labelFor(split)).toBe("api");
    expect(labelFor({ ...split, activeLeafId: 2 })).toBe("a");
  });

  it("follows the focused pane's tmux session in a split", () => {
    const split = terminalTab({
      cwd: "~",
      paneTree: {
        kind: "split",
        id: 10,
        dir: "row",
        children: [
          { kind: "leaf", id: 2, cwd: "~", tmuxSession: "main" },
          { kind: "leaf", id: 3, cwd: "/Users/me/proj" },
        ],
      },
      activeLeafId: 2,
    });
    expect(labelFor(split)).toBe("main");
    expect(labelFor({ ...split, activeLeafId: 3 })).toBe("proj");
  });

  it("still lets a custom title win in a split", () => {
    const split = terminalTab({
      customTitle: "Server",
      paneTree: {
        kind: "split",
        id: 10,
        dir: "row",
        children: [
          { kind: "leaf", id: 2, cwd: "/Users/me/a" },
          { kind: "leaf", id: 3, cwd: "/Users/me/b" },
        ],
      },
      activeLeafId: 3,
    });
    expect(labelFor(split)).toBe("Server");
  });
});
