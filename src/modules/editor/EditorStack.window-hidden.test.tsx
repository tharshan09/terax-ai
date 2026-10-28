// @vitest-environment jsdom
import type { EditorTab } from "@/modules/tabs";
import { act, cleanup, render } from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";

// Stands in for EditorPane's media branch so the stack renders without
// CodeMirror or Tauri IPC; the default mirrors EditorPane's `visible = true`.
vi.mock("./EditorPane", async () => {
  const { createElement } = await import("react");
  const { MediaPreview } = await import("./MediaPreview");
  return {
    EditorPane: ({
      path,
      visible = true,
    }: {
      path: string;
      visible?: boolean;
    }) =>
      path.endsWith(".mp4")
        ? createElement(MediaPreview, {
            kind: "video",
            src: path,
            tabVisible: visible,
          })
        : null,
  };
});

import { EditorStack } from "./EditorStack";

const CLIP = "/test/clip.mp4";

function editorTab(id: number, path: string): EditorTab {
  return {
    id,
    kind: "editor",
    title: path,
    path,
    dirty: false,
    preview: false,
    spaceId: "default",
  };
}

const TABS = [editorTab(1, CLIP), editorTab(2, "/test/notes.txt")];
const noop = () => {};

function stack(activeId: number) {
  return (
    <EditorStack
      tabs={TABS}
      activeId={activeId}
      onDirtyChange={noop}
      registerHandle={noop}
      onCloseTab={noop}
      onSetDocView={noop}
    />
  );
}

function clipIn(container: HTMLElement) {
  const video = container.querySelector<HTMLVideoElement>(
    `video[src="${CLIP}"]`,
  );
  if (!video) throw new Error("clip.mp4 is not rendered");
  return video;
}

function userPlays(media: HTMLMediaElement) {
  media.dispatchEvent(new Event("play"));
}

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

let pause: MockInstance<HTMLMediaElement["pause"]>;
let play: MockInstance<HTMLMediaElement["play"]>;

beforeAll(() => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

beforeEach(() => {
  pause = vi
    .spyOn(HTMLMediaElement.prototype, "pause")
    .mockImplementation(() => {});
  play = vi
    .spyOn(HTMLMediaElement.prototype, "play")
    .mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  setVisibility("visible");
  vi.restoreAllMocks();
});

describe("EditorStack media in hidden tabs and windows", () => {
  it("[AC-6] pauses and hides a playing clip in a background tab, and keeps it paused on return", () => {
    const { container, rerender } = render(stack(1));
    const video = clipIn(container);
    userPlays(video);
    expect(pause).not.toHaveBeenCalled();
    expect(video.classList.contains("hidden")).toBe(false);

    rerender(stack(2));
    expect(pause).toHaveBeenCalled();
    expect(pause.mock.contexts.every((c) => c === video)).toBe(true);
    expect(video.classList.contains("hidden")).toBe(true);

    pause.mockClear();
    userPlays(video);
    expect(pause).toHaveBeenCalledOnce();

    rerender(stack(1));
    expect(video.classList.contains("hidden")).toBe(false);
    expect(play).not.toHaveBeenCalled();
    pause.mockClear();
    userPlays(video);
    expect(pause).not.toHaveBeenCalled();
  });

  it("[AC-7] pauses the active tab's clip while the window is hidden, without hiding it", () => {
    const { container } = render(stack(1));
    const video = clipIn(container);
    userPlays(video);

    act(() => setVisibility("hidden"));
    expect(pause).toHaveBeenCalled();
    expect(video.classList.contains("hidden")).toBe(false);

    pause.mockClear();
    userPlays(video);
    expect(pause).toHaveBeenCalledOnce();

    act(() => setVisibility("visible"));
    expect(play).not.toHaveBeenCalled();
    pause.mockClear();
    userPlays(video);
    expect(pause).not.toHaveBeenCalled();
  });

  it("keeps a background clip paused and hidden when the window comes back", () => {
    const { container } = render(stack(2));
    const video = clipIn(container);

    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    expect(video.classList.contains("hidden")).toBe(true);

    pause.mockClear();
    userPlays(video);
    expect(pause).toHaveBeenCalledOnce();
    expect(play).not.toHaveBeenCalled();
  });
});
