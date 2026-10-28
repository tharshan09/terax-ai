import { describe, expect, it, vi } from "vitest";
import {
  bindMediaPlayback,
  type MediaPlaybackState,
  mediaPlaybackAllowed,
} from "./mediaPlayback";

type WebkitPresentation = {
  webkitDisplayingFullscreen?: boolean;
  webkitPresentationMode?: string;
};

function mediaElement(presentation: WebkitPresentation = {}) {
  return Object.assign(
    new EventTarget(),
    { pause: vi.fn(), play: vi.fn() },
    presentation,
  );
}

type Presented =
  | "fullscreen"
  | "picture-in-picture"
  | "webkit fullscreen"
  | "webkit picture-in-picture";

function presentedMedia(kind: Presented) {
  const media = mediaElement(
    kind === "webkit fullscreen"
      ? { webkitDisplayingFullscreen: true }
      : kind === "webkit picture-in-picture"
        ? { webkitPresentationMode: "picture-in-picture" }
        : {},
  );
  const doc = {
    fullscreenElement: kind === "fullscreen" ? media : null,
    pictureInPictureElement: kind === "picture-in-picture" ? media : null,
  };
  return { media, doc };
}

function userPlays(media: EventTarget) {
  media.dispatchEvent(new Event("play"));
}

const shown: MediaPlaybackState = { tabVisible: true, windowHidden: false };
const backgroundTab: MediaPlaybackState = {
  tabVisible: false,
  windowHidden: false,
};
const hiddenWindow: MediaPlaybackState = {
  tabVisible: true,
  windowHidden: true,
};

describe("mediaPlaybackAllowed", () => {
  it.each([
    [true, false, true],
    [false, false, false],
    [true, true, false],
    [false, true, false],
  ])("tabVisible=%s windowHidden=%s -> %s", (tabVisible, windowHidden, ok) => {
    expect(mediaPlaybackAllowed({ tabVisible, windowHidden })).toBe(ok);
  });
});

describe("bindMediaPlayback", () => {
  it("[AC-6] pauses media of a background tab and takes back every play", () => {
    const media = mediaElement();
    const dispose = bindMediaPlayback(media, backgroundTab);
    expect(media.pause).toHaveBeenCalledOnce();

    userPlays(media);
    expect(media.pause).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("[AC-7] pauses media while the window is hidden, also in the active tab", () => {
    const media = mediaElement();
    const dispose = bindMediaPlayback(media, hiddenWindow);
    expect(media.pause).toHaveBeenCalledOnce();

    userPlays(media);
    expect(media.pause).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("lets the active tab of a visible window play and pauses on close", () => {
    const media = mediaElement();
    const dispose = bindMediaPlayback(media, shown);
    userPlays(media);
    expect(media.pause).not.toHaveBeenCalled();

    dispose();
    expect(media.pause).toHaveBeenCalledOnce();
  });

  it.each([
    ["the tab", backgroundTab],
    ["the window", hiddenWindow],
  ])("never resumes on its own when %s comes back", (_, away) => {
    const media = mediaElement();
    bindMediaPlayback(media, shown)();
    const leaveAway = bindMediaPlayback(media, away);
    expect(media.pause).toHaveBeenCalled();
    leaveAway();

    const close = bindMediaPlayback(media, shown);
    expect(media.play).not.toHaveBeenCalled();
    media.pause.mockClear();
    userPlays(media);
    expect(media.pause).not.toHaveBeenCalled();
    close();
  });

  it("drops the play guard once disposed", () => {
    const media = mediaElement();
    const dispose = bindMediaPlayback(media, hiddenWindow);
    dispose();
    media.pause.mockClear();

    userPlays(media);
    expect(media.pause).not.toHaveBeenCalled();
  });

  it.each<Presented>([
    "fullscreen",
    "picture-in-picture",
    "webkit fullscreen",
    "webkit picture-in-picture",
  ])(
    "keeps %s media playing while the window is hidden, not in a background tab",
    (kind) => {
      const { media, doc } = presentedMedia(kind);
      const dispose = bindMediaPlayback(media, hiddenWindow, doc);
      userPlays(media);
      dispose();
      expect(media.pause).not.toHaveBeenCalled();

      const background = bindMediaPlayback(media, backgroundTab, doc);
      expect(media.pause).toHaveBeenCalledOnce();
      userPlays(media);
      expect(media.pause).toHaveBeenCalledTimes(2);
      background();
    },
  );

  it("pauses again when the media leaves fullscreen or picture-in-picture while the window is still hidden", () => {
    const video = mediaElement({ webkitPresentationMode: "fullscreen" });
    const disposeVideo = bindMediaPlayback(video, hiddenWindow, undefined);
    expect(video.pause).not.toHaveBeenCalled();
    video.webkitPresentationMode = "inline";
    video.dispatchEvent(new Event("webkitpresentationmodechanged"));
    expect(video.pause).toHaveBeenCalledOnce();
    userPlays(video);
    expect(video.pause).toHaveBeenCalledTimes(2);
    disposeVideo();

    const pip = mediaElement();
    const doc: { pictureInPictureElement: unknown } = {
      pictureInPictureElement: pip,
    };
    const disposePip = bindMediaPlayback(pip, hiddenWindow, doc);
    expect(pip.pause).not.toHaveBeenCalled();
    doc.pictureInPictureElement = null;
    pip.dispatchEvent(new Event("leavepictureinpicture"));
    expect(pip.pause).toHaveBeenCalledOnce();
    disposePip();
  });
});
