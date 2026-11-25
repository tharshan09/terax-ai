// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// AI and terminal modules replaced; the composer input is a plain textarea so
// a typed draft is visible in the DOM.
vi.mock("@/modules/ai", () => ({
  AiInputBarConnect: () => <div data-testid="ai-connect" />,
}));
vi.mock("@/modules/ai/components/Chip", () => ({ Chip: () => null }));
vi.mock("@/modules/ai/components/ChipsRow", () => ({ ChipsRow: () => null }));
vi.mock("@/modules/ai/lib/composer", () => ({
  useComposer: () => ({
    files: [],
    removeFile: () => {},
    pickedSnippets: [],
    removeSnippet: () => {},
    pickedCommands: [],
    removeCommand: () => {},
    setValue: () => {},
    textareaRef: { current: null },
  }),
}));
vi.mock("@/modules/ai/components/AiComposerInput", () => ({
  AiComposerInput: () => <textarea aria-label="Ask AI" />,
}));
vi.mock("@/modules/terminal/block/ShellInput", () => ({
  default: () => <input aria-label="Shell" />,
}));
vi.mock("@/modules/terminal/lib/blockController", () => ({
  useBlockController: () => null,
}));
vi.mock("@/modules/terminal/lib/useTerminalSession", () => ({
  focusLeafInput: () => {},
}));
vi.mock("@/modules/theme", () => ({
  useTheme: () => ({ resolvedMode: "dark", themeId: "t", customThemes: [] }),
}));
vi.mock("./OsIcon", () => ({ OsIcon: () => null }));
vi.mock("./useGitBranch", () => ({ useGitBranch: () => null }));
vi.mock("./useSystemInfo", () => ({
  useSystemInfo: () => ({ os: null, shell: null }),
}));

import { WorkspaceInputBar } from "./WorkspaceInputBar";

type Props = ComponentProps<typeof WorkspaceInputBar>;

// An editor tab with the AI panel open and the keys loaded.
const base: Props = {
  isBlockTab: false,
  isTerminalTab: false,
  activeLeafId: null,
  cwd: null,
  home: null,
  hasComposer: true,
  panelOpen: true,
  keysLoaded: true,
  onConnect: () => {},
};

const bar = () => {
  const el = document.querySelector<HTMLElement>("[data-ai-input-bar]");
  if (!el) throw new Error("input bar not mounted");
  return el;
};

afterEach(cleanup);

describe("WorkspaceInputBar in zen", () => {
  it("[AC-8] stays mounted but hidden with hiddenInZen, keeping a draft", async () => {
    const { rerender } = render(<WorkspaceInputBar {...base} />);
    const input = await screen.findByLabelText("Ask AI");
    fireEvent.change(input, { target: { value: "draft text" } });
    const before = bar();

    rerender(<WorkspaceInputBar {...base} hiddenInZen />);
    expect(bar()).toBe(before);
    expect(bar().hidden).toBe(true);
    expect(screen.getByLabelText("Ask AI")).toBe(input);
    expect((input as HTMLTextAreaElement).value).toBe("draft text");

    rerender(<WorkspaceInputBar {...base} hiddenInZen={false} />);
    expect(bar()).toBe(before);
    expect(bar().hidden).toBe(false);
    expect((screen.getByLabelText("Ask AI") as HTMLTextAreaElement).value).toBe(
      "draft text",
    );
  });

  it("[AC-8] shows the bar as before with hiddenInZen off", async () => {
    render(<WorkspaceInputBar {...base} hiddenInZen={false} />);
    await screen.findByLabelText("Ask AI");
    expect(bar().hidden).toBe(false);
    expect(bar().hasAttribute("hidden")).toBe(false);
    expect(bar().getAttribute("data-state")).toBe("open");
    expect(bar().getAttribute("aria-hidden")).toBe("false");
  });

  it("[AC-8] shows the bar as before without the prop", async () => {
    render(<WorkspaceInputBar {...base} />);
    await screen.findByLabelText("Ask AI");
    expect(bar().hasAttribute("hidden")).toBe(false);
    expect(bar().getAttribute("data-state")).toBe("open");
    expect(bar().getAttribute("aria-hidden")).toBe("false");
  });
});
