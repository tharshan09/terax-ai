type MediaPlayback = Pick<
  HTMLMediaElement,
  "pause" | "addEventListener" | "removeEventListener"
>;

export type MediaPlaybackState = {
  tabVisible: boolean;
  windowHidden: boolean;
};

export function mediaPlaybackAllowed(state: MediaPlaybackState): boolean {
  return state.tabVisible && !state.windowHidden;
}

/**
 * Pauses `media` while playback is not allowed and takes back every play
 * started meanwhile. Never starts playback; the returned dispose pauses.
 */
export function bindMediaPlayback(
  media: MediaPlayback,
  state: MediaPlaybackState,
): () => void {
  const pause = () => media.pause();
  const blocked = !mediaPlaybackAllowed(state);
  if (blocked) {
    pause();
    media.addEventListener("play", pause);
  }
  return () => {
    if (blocked) media.removeEventListener("play", pause);
    pause();
  };
}
