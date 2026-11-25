import type { Tab } from "@/modules/tabs/lib/useTabs";

export type TabKind = Tab["kind"];

/** Which parts of the app chrome are on screen; `true` = shown. */
export type ZenChrome = {
  header: boolean;
  statusBar: boolean;
  sidebar: boolean;
  resizeHandle: boolean;
  /** The `px-3 pt-2 pb-2` padding around each workspace layer. */
  surfacePadding: boolean;
  /** Border and rounded corners of a pane. */
  paneFrame: boolean;
  /** The AI / block-command input bar under the workspace. */
  inputBar: boolean;
};

const ALL_SHOWN: ZenChrome = {
  header: true,
  statusBar: true,
  sidebar: true,
  resizeHandle: true,
  surfacePadding: true,
  paneFrame: true,
  inputBar: true,
};

/**
 * Whether the input bar stays in zen, per tab kind. Only terminal tabs keep it
 * (block tabs need it to type commands); preview and code tabs give the whole
 * window to the content. A `Record` on purpose: a new tab kind does not compile
 * until it is placed here, so it never lands in a group silently.
 */
const INPUT_BAR_IN_ZEN: Record<TabKind, boolean> = {
  terminal: true,
  editor: false,
  preview: false,
  markdown: false,
  html: false,
  "ai-diff": false,
  "git-diff": false,
  "git-history": false,
  "git-commit-file": false,
};

/**
 * What the app shows for a zen state and the active tab kind. Zen off is the
 * layout as before zen existed. Zen on hides header, status bar, sidebar,
 * resize handle, surface padding and pane frames; the input bar stays only in
 * terminal tabs (and not without an active tab).
 */
export function zenChrome(
  zenOn: boolean,
  activeKind: TabKind | undefined,
): ZenChrome {
  if (!zenOn) return { ...ALL_SHOWN };
  return {
    header: false,
    statusBar: false,
    sidebar: false,
    resizeHandle: false,
    surfacePadding: false,
    paneFrame: false,
    inputBar: activeKind === undefined ? false : INPUT_BAR_IN_ZEN[activeKind],
  };
}

/**
 * Whether the AI toggle shortcut (`ai.toggle`) acts. While zen hides the input
 * bar it would only flip hidden state and focus a hidden field, so it does
 * nothing; wherever the input bar is shown it works as before.
 */
export function aiToggleAllowed(
  zenOn: boolean,
  activeKind: TabKind | undefined,
): boolean {
  return zenChrome(zenOn, activeKind).inputBar;
}
