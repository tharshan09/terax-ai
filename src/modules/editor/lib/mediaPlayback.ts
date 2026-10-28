type MediaPlayback = Pick<
  HTMLMediaElement,
  "pause" | "addEventListener" | "removeEventListener"
> & {
  webkitDisplayingFullscreen?: boolean;
  webkitPresentationMode?: string;
};

type PresentationDocument = {
  readonly fullscreenElement?: unknown;
  readonly pictureInPictureElement?: unknown;
};

export type MediaPlaybackState = {
  tabVisible: boolean;
  windowHidden: boolean;
};

const PRESENTATION_EVENTS = [
  "fullscreenchange",
  "webkitfullscreenchange",
  "webkitbeginfullscreen",
  "webkitendfullscreen",
  "enterpictureinpicture",
  "leavepictureinpicture",
  "webkitpresentationmodechanged",
] as const;

// Native fullscreen and picture-in-picture move the video out of the window,
// which then reads as hidden; that alone must not stop the video.
export function presentedOutsideWindow(
  media: MediaPlayback,
  doc: PresentationDocument | undefined,
): boolean {
  return (
    doc?.fullscreenElement === media ||
    doc?.pictureInPictureElement === media ||
    media.webkitDisplayingFullscreen === true ||
    media.webkitPresentationMode === "fullscreen" ||
    media.webkitPresentationMode === "picture-in-picture"
  );
}

export function mediaPlaybackAllowed(
  state: MediaPlaybackState,
  presentedOutside = false,
): boolean {
  return state.tabVisible && (!state.windowHidden || presentedOutside);
}

/**
 * Pauses `media` while playback is not allowed and takes back every play
 * started meanwhile. Never starts playback; the returned dispose pauses unless
 * the media is in fullscreen or picture-in-picture.
 */
export function bindMediaPlayback(
  media: MediaPlayback,
  state: MediaPlaybackState,
  doc: PresentationDocument | undefined = typeof document === "undefined"
    ? undefined
    : document,
): () => void {
  const pauseIfBlocked = () => {
    if (!mediaPlaybackAllowed(state, presentedOutsideWindow(media, doc))) {
      media.pause();
    }
  };
  pauseIfBlocked();
  media.addEventListener("play", pauseIfBlocked);
  for (const type of PRESENTATION_EVENTS) {
    media.addEventListener(type, pauseIfBlocked);
  }
  return () => {
    media.removeEventListener("play", pauseIfBlocked);
    for (const type of PRESENTATION_EVENTS) {
      media.removeEventListener(type, pauseIfBlocked);
    }
    if (!presentedOutsideWindow(media, doc)) media.pause();
  };
}
