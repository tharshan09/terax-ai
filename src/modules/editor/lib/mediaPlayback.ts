import { isWindowHidden, subscribeWindowHidden } from "@/lib/windowVisibility";

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

export type WindowHiddenSource = {
  isHidden: () => boolean;
  subscribe: (listener: (hidden: boolean) => void) => () => void;
};

export type MediaPlaybackState = {
  tabVisible: boolean;
  windowHidden: boolean;
};

export type MediaPlaybackOptions = {
  tabVisible: boolean;
  onPresentedChange?: (presented: boolean) => void;
  windowVisibility?: WindowHiddenSource;
  doc?: PresentationDocument;
};

const LIVE_WINDOW: WindowHiddenSource = {
  isHidden: isWindowHidden,
  subscribe: subscribeWindowHidden,
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

// Fullscreen and picture-in-picture show the video outside the window, so
// neither a background tab nor a hidden window may stop it there.
export function mediaPlaybackAllowed(
  state: MediaPlaybackState,
  presentedOutside = false,
): boolean {
  return presentedOutside || (state.tabVisible && !state.windowHidden);
}

export function bindMediaPlayback(
  media: MediaPlayback,
  {
    tabVisible,
    onPresentedChange,
    windowVisibility = LIVE_WINDOW,
    doc = typeof document === "undefined" ? undefined : document,
  }: MediaPlaybackOptions,
): () => void {
  const check = (): boolean => {
    const presented = presentedOutsideWindow(media, doc);
    const state = { tabVisible, windowHidden: windowVisibility.isHidden() };
    if (!mediaPlaybackAllowed(state, presented)) media.pause();
    return presented;
  };
  const onPresentation = () => onPresentedChange?.(check());

  onPresentation();
  media.addEventListener("play", check);
  for (const type of PRESENTATION_EVENTS) {
    media.addEventListener(type, onPresentation);
  }
  const unsubscribe = windowVisibility.subscribe(check);
  return () => {
    unsubscribe();
    media.removeEventListener("play", check);
    for (const type of PRESENTATION_EVENTS) {
      media.removeEventListener(type, onPresentation);
    }
    if (!presentedOutsideWindow(media, doc)) media.pause();
  };
}
