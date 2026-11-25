// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { createElement, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The panes render for real; only CodeMirror, language loading and Tauri are
// replaced, since the test is about the classes of the pane's outer frame.
vi.mock("@uiw/react-codemirror", () => ({
  default: () => createElement("div", { "data-testid": "codemirror" }),
}));
vi.mock("@/modules/editor/lib/useEditorThemeExt", () => ({
  useEditorThemeExt: () => [],
}));
vi.mock("@/modules/editor/lib/languageResolver", () => ({
  resolveLanguage: () => Promise.resolve(null),
  resolveLanguageSync: () => null,
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: () => Promise.resolve(null),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: () => Promise.resolve(() => {}),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: () => Promise.resolve(),
}));

import { AiDiffPane } from "@/modules/editor/AiDiffPane";
import { GitDiffPane } from "@/modules/editor/GitDiffPane";
import { PreviewPane } from "@/modules/preview/PreviewPane";
import { usePaneFrameClass } from "./usePaneFrameClass";
import { useZenStore } from "./zenStore";

afterEach(() => {
  cleanup();
  useZenStore.setState({ on: false });
});

// The class string the panes carried before zen existed (PreviewPane.tsx,
// GitDiffPane.tsx, AiDiffPane.tsx at cf07327), written out here on purpose.
const FRAME = "rounded-md border border-border/60";

describe("usePaneFrameClass", () => {
  it("[AC-3] drops border and corners in zen and brings them back after", () => {
    const { result } = renderHook(() => usePaneFrameClass());
    expect(result.current).toBe(FRAME);
    act(() => useZenStore.getState().enterZen());
    expect(result.current).toBe("");
    act(() => useZenStore.getState().exitZen());
    expect(result.current).toBe(FRAME);
  });
});

const PANES: [string, () => ReactElement][] = [
  [
    "web preview",
    () =>
      createElement(PreviewPane, {
        url: "http://127.0.0.1:5173/",
        visible: true,
        onUrlChange: () => {},
      }),
  ],
  [
    "git diff",
    () =>
      createElement(GitDiffPane, {
        source: {
          kind: "working",
          repoRoot: "/w",
          path: "a.ts",
          mode: "+",
          originalPath: null,
        },
        active: false,
      }),
  ],
  [
    "ai diff",
    () =>
      createElement(AiDiffPane, {
        path: "/w/a.ts",
        originalContent: "a\n",
        proposedContent: "b\n",
        status: "pending",
        isNewFile: false,
        onAccept: () => {},
        onReject: () => {},
      }),
  ],
];

const frameClassesOf = (root: Element | null) =>
  FRAME.split(" ").filter((c) => root?.classList.contains(c));

describe("pane frames in zen", () => {
  it.each(PANES)(
    "[AC-3] the %s pane has its frame outside zen and none in zen",
    (_name, pane) => {
      const { container, rerender } = render(pane());
      const root = container.firstElementChild;
      expect(frameClassesOf(root)).toEqual(FRAME.split(" "));
      expect(root?.classList.contains("bg-background")).toBe(true);

      act(() => useZenStore.getState().enterZen());
      rerender(pane());
      expect(frameClassesOf(container.firstElementChild)).toEqual([]);
      expect(
        container.firstElementChild?.classList.contains("bg-background"),
      ).toBe(true);

      act(() => useZenStore.getState().exitZen());
      expect(frameClassesOf(container.firstElementChild)).toEqual(
        FRAME.split(" "),
      );
    },
  );
});
