// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Each stack is replaced by a marker; its parent is the layer under test.
vi.mock("@/modules/terminal", () => ({
  TerminalStack: () => <div data-testid="stack-terminal" />,
}));
vi.mock("@/modules/editor", () => ({
  EditorStack: () => <div data-testid="stack-editor" />,
  AiDiffStack: () => <div data-testid="stack-ai-diff" />,
  GitDiffStack: () => <div data-testid="stack-git-diff" />,
}));
vi.mock("@/modules/preview", () => ({
  PreviewStack: () => <div data-testid="stack-preview" />,
}));
vi.mock("@/modules/doc", () => ({
  DocStack: ({ kind }: { kind: string }) => (
    <div data-testid={`stack-${kind}`} />
  ),
}));
vi.mock("@/modules/git-history", () => ({
  GitHistoryStack: () => <div data-testid="stack-git-history" />,
}));

import { useZenStore } from "@/modules/zen";
import { WorkspaceSurface } from "./WorkspaceSurface";

type Props = ComponentProps<typeof WorkspaceSurface>;

const noop = () => {};
const props = {
  tabs: [],
  activeId: 1,
  activeTab: { id: 1, kind: "terminal", title: "t", spaceId: "s" },
  registerTerminalHandle: noop,
  onSearchReady: noop,
  onCwd: noop,
  onExit: noop,
  onFocusLeaf: noop,
  movePane: noop,
  swapPanes: noop,
  breakOutPane: noop,
  registerEditorHandle: noop,
  onEditorDirtyChange: noop,
  onEditorCloseTab: noop,
  registerPreviewHandle: noop,
  onPreviewUrlChange: noop,
  onAiDiffAccept: noop,
  onAiDiffReject: noop,
  onOpenCommitFile: noop,
  onGitHistorySearchHandle: noop,
  onSetDocView: noop,
} as unknown as Props;

const PADDED = [
  "terminal",
  "editor",
  "preview",
  "markdown",
  "html",
  "ai-diff",
  "git-diff",
] as const;
const PADDING = ["px-3", "pt-2", "pb-2"];

const layer = (name: string) => {
  const parent = screen.getByTestId(`stack-${name}`).parentElement;
  if (!parent) throw new Error(`no layer around stack-${name}`);
  return parent;
};

afterEach(() => {
  cleanup();
  useZenStore.setState({ on: false });
});

describe("WorkspaceSurface in zen", () => {
  it("[AC-7] pads the seven layers with zen off", () => {
    render(<WorkspaceSurface {...props} />);
    for (const name of PADDED) {
      for (const cls of PADDING) {
        expect(layer(name).classList.contains(cls), `${name} ${cls}`).toBe(
          true,
        );
      }
    }
  });

  it("[AC-7] drops the padding of all seven layers with zen on", () => {
    useZenStore.setState({ on: true });
    render(<WorkspaceSurface {...props} />);
    for (const name of PADDED) {
      for (const cls of PADDING) {
        expect(layer(name).classList.contains(cls), `${name} ${cls}`).toBe(
          false,
        );
      }
    }
  });

  it("[AC-7] follows zen turning on and off while mounted", () => {
    render(<WorkspaceSurface {...props} />);
    act(() => useZenStore.getState().enterZen());
    expect(layer("html").classList.contains("px-3")).toBe(false);
    act(() => useZenStore.getState().exitZen());
    expect(layer("html").classList.contains("px-3")).toBe(true);
  });

  it("[AC-7] keeps the git history layer unpadded either way", () => {
    for (const on of [false, true]) {
      useZenStore.setState({ on });
      render(<WorkspaceSurface {...props} />);
      const cls = layer("git-history").classList;
      for (const c of PADDING)
        expect(cls.contains(c), `zen ${on} ${c}`).toBe(false);
      cleanup();
    }
  });

  it("[AC-7] keeps visibility switching by active tab in zen", () => {
    useZenStore.setState({ on: true });
    render(<WorkspaceSurface {...props} />);
    expect(layer("terminal").classList.contains("invisible")).toBe(false);
    expect(layer("html").classList.contains("invisible")).toBe(true);
  });
});
