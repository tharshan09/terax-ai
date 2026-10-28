import { describe, expect, it, vi } from "vitest";
import {
  bindMediaPlayback,
  type MediaPlaybackState,
  mediaPlaybackAllowed,
  type WindowHiddenSource,
} from "./mediaPlayback";

type WebkitPresentation = {
  webkitDisplayingFullscreen?: boolean;
  webkitPresentationMode?: string;
};

type PresentationDoc = {
  fullscreenElement: unknown;
  pictureInPictureElement: unknown;
};

function mediaElement(presentation: WebkitPresentation = {}) {
  return Object.assign(
    new EventTarget(),
    { pause: vi.fn(), play: vi.fn() },
    presentation,
  );
}

type Media = ReturnType<typeof mediaElement>;

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
  const doc: PresentationDoc = {
    fullscreenElement: kind === "fullscreen" ? media : null,
    pictureInPictureElement: kind === "picture-in-picture" ? media : null,
  };
  return { media, doc };
}

function fakeWindow(hidden: boolean) {
  const listeners = new Set<(hidden: boolean) => void>();
  const source: WindowHiddenSource = {
    isHidden: () => hidden,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    source,
    set(next: boolean) {
      hidden = next;
      for (const listener of [...listeners]) listener(next);
    },
    listenerCount: () => listeners.size,
  };
}

function bind(
  media: Media,
  { tabVisible, windowHidden }: MediaPlaybackState,
  doc: PresentationDoc = {
    fullscreenElement: null,
    pictureInPictureElement: null,
  },
) {
  const win = fakeWindow(windowHidden);
  const onPresentedChange = vi.fn();
  const dispose = bindMediaPlayback(media, {
    tabVisible,
    onPresentedChange,
    windowVisibility: win.source,
    doc,
  });
  return { dispose, win, onPresentedChange };
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
    [true, false, false, true],
    [false, false, false, false],
    [true, true, false, false],
    [false, true, false, false],
    [true, true, true, true],
    [false, false, true, true],
    [false, true, true, true],
  ])(
    "tabVisible=%s windowHidden=%s presentedOutside=%s -> %s",
    (tabVisible, windowHidden, presentedOutside, ok) => {
      expect(
        mediaPlaybackAllowed({ tabVisible, windowHidden }, presentedOutside),
      ).toBe(ok);
    },
  );
});

describe("bindMediaPlayback", () => {
  it("[AC-6] pauses media of a background tab and takes back every play", () => {
    const media = mediaElement();
    const { dispose } = bind(media, backgroundTab);
    expect(media.pause).toHaveBeenCalledOnce();

    userPlays(media);
    expect(media.pause).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("[AC-7] pauses media when the window hides, also in the active tab", () => {
    const media = mediaElement();
    const { dispose, win } = bind(media, shown);
    userPlays(media);
    expect(media.pause).not.toHaveBeenCalled();

    win.set(true);
    expect(media.pause).toHaveBeenCalledOnce();
    userPlays(media);
    expect(media.pause).toHaveBeenCalledTimes(2);

    win.set(false);
    media.pause.mockClear();
    userPlays(media);
    expect(media.pause).not.toHaveBeenCalled();
    expect(media.play).not.toHaveBeenCalled();
    dispose();
  });

  it("lets the active tab of a visible window play and pauses on close", () => {
    const media = mediaElement();
    const { dispose, win } = bind(media, shown);
    userPlays(media);
    expect(media.pause).not.toHaveBeenCalled();

    dispose();
    expect(media.pause).toHaveBeenCalledOnce();
    expect(win.listenerCount()).toBe(0);
  });

  it.each([
    ["the tab", backgroundTab],
    ["the window", hiddenWindow],
  ])("never resumes on its own when %s comes back", (_, away) => {
    const media = mediaElement();
    bind(media, shown).dispose();
    const leaveAway = bind(media, away).dispose;
    expect(media.pause).toHaveBeenCalled();
    leaveAway();

    const { dispose } = bind(media, shown);
    expect(media.play).not.toHaveBeenCalled();
    media.pause.mockClear();
    userPlays(media);
    expect(media.pause).not.toHaveBeenCalled();
    dispose();
  });

  it("drops the play guard once disposed", () => {
    const media = mediaElement();
    const { dispose, win } = bind(media, hiddenWindow);
    dispose();
    media.pause.mockClear();

    userPlays(media);
    win.set(true);
    expect(media.pause).not.toHaveBeenCalled();
  });

  it.each<Presented>([
    "fullscreen",
    "picture-in-picture",
    "webkit fullscreen",
    "webkit picture-in-picture",
  ])(
    "keeps %s media playing in a background tab and a hidden window",
    (kind) => {
      const { media, doc } = presentedMedia(kind);
      const { dispose, win, onPresentedChange } = bind(
        media,
        backgroundTab,
        doc,
      );
      expect(onPresentedChange).toHaveBeenLastCalledWith(true);
      userPlays(media);

      win.set(true);
      userPlays(media);
      dispose();
      expect(media.pause).not.toHaveBeenCalled();
    },
  );

  it("pauses once the media returns inline in a background tab", () => {
    const { media, doc } = presentedMedia("picture-in-picture");
    const { dispose, onPresentedChange } = bind(media, backgroundTab, doc);
    expect(media.pause).not.toHaveBeenCalled();

    doc.pictureInPictureElement = null;
    media.dispatchEvent(new Event("leavepictureinpicture"));
    expect(media.pause).toHaveBeenCalledOnce();
    expect(onPresentedChange).toHaveBeenLastCalledWith(false);
    dispose();
  });

  it("reads the live window state when the media leaves fullscreen", () => {
    const media = mediaElement({ webkitPresentationMode: "fullscreen" });
    const { dispose, win } = bind(media, hiddenWindow);
    expect(media.pause).not.toHaveBeenCalled();

    win.set(false);
    media.webkitPresentationMode = "inline";
    media.dispatchEvent(new Event("webkitendfullscreen"));
    expect(media.pause).not.toHaveBeenCalled();
    dispose();
  });

  it("pauses again when the media leaves fullscreen while the window is still hidden", () => {
    const media = mediaElement({ webkitPresentationMode: "fullscreen" });
    const { dispose } = bind(media, hiddenWindow);
    expect(media.pause).not.toHaveBeenCalled();

    media.webkitPresentationMode = "inline";
    media.dispatchEvent(new Event("webkitpresentationmodechanged"));
    expect(media.pause).toHaveBeenCalledOnce();
    userPlays(media);
    expect(media.pause).toHaveBeenCalledTimes(2);
    dispose();
  });
});
