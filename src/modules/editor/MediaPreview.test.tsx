// @vitest-environment jsdom
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
import { MediaPreview } from "./MediaPreview";

const SRC = "asset://localhost/preview";

let visibility: DocumentVisibilityState = "visible";

function setVisibility(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

function mediaIn(container: HTMLElement, kind: "video" | "audio") {
  const media = container.querySelector<HTMLMediaElement>(kind);
  if (!media) throw new Error(`no <${kind}> rendered`);
  return media;
}

function userPlays(media: HTMLMediaElement) {
  media.dispatchEvent(new Event("play"));
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

describe.each(["video", "audio"] as const)("%s preview", (kind) => {
  it.each([true, false])(
    "renders native controls without autoplay, tabVisible=%s",
    (tabVisible) => {
      const { container } = render(
        <MediaPreview kind={kind} src={SRC} tabVisible={tabVisible} />,
      );
      const media = mediaIn(container, kind);
      expect(media.hasAttribute("controls")).toBe(true);
      expect(media.getAttribute("preload")).toBe("metadata");
      expect(media.getAttribute("src")).toBe(SRC);
      expect(media.hasAttribute("autoplay")).toBe(false);
      expect(media.classList.contains("hidden")).toBe(!tabVisible);
    },
  );

  it("[AC-7] stays visible but paused while the window is hidden", () => {
    const { container } = render(
      <MediaPreview kind={kind} src={SRC} tabVisible />,
    );
    const media = mediaIn(container, kind);
    userPlays(media);
    expect(pause).not.toHaveBeenCalled();

    act(() => setVisibility("hidden"));
    expect(pause).toHaveBeenCalled();
    expect(pause.mock.contexts.every((c) => c === media)).toBe(true);
    expect(media.classList.contains("hidden")).toBe(false);

    pause.mockClear();
    userPlays(media);
    expect(pause).toHaveBeenCalledOnce();

    act(() => setVisibility("visible"));
    expect(media.classList.contains("hidden")).toBe(false);
    expect(play).not.toHaveBeenCalled();
    pause.mockClear();
    userPlays(media);
    expect(pause).not.toHaveBeenCalled();
  });

  it("[AC-6] hides and pauses in a background tab and stays paused on return", () => {
    const { container, rerender } = render(
      <MediaPreview kind={kind} src={SRC} tabVisible />,
    );
    const media = mediaIn(container, kind);
    userPlays(media);

    rerender(<MediaPreview kind={kind} src={SRC} tabVisible={false} />);
    expect(pause).toHaveBeenCalled();
    expect(media.classList.contains("hidden")).toBe(true);

    pause.mockClear();
    userPlays(media);
    expect(pause).toHaveBeenCalledOnce();

    rerender(<MediaPreview kind={kind} src={SRC} tabVisible />);
    expect(media.classList.contains("hidden")).toBe(false);
    expect(play).not.toHaveBeenCalled();
    pause.mockClear();
    userPlays(media);
    expect(pause).not.toHaveBeenCalled();
  });
});
