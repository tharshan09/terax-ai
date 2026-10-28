import { describe, expect, it, vi } from "vitest";
import {
  bindMediaPlayback,
  type MediaPlaybackState,
  mediaPlaybackAllowed,
} from "./mediaPlayback";

function mediaElement() {
  return Object.assign(new EventTarget(), {
    pause: vi.fn(),
    play: vi.fn(),
  });
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
});
