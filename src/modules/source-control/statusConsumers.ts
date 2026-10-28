import type { SidebarViewId } from "@/modules/sidebar";
import {
  GIT_STATUS_WIDGET_IDS,
  type StatusbarLayout,
} from "@/modules/statusbar/layout";

export type StatusConsumerInput = {
  sidebarView: SidebarViewId;
  /** The sidebar panel is collapsed to 0 px (still mounted, not on screen). */
  sidebarCollapsed: boolean;
  activeTabKind: string | undefined;
  explorerGitDecorations: boolean;
  statusbarLayout: StatusbarLayout;
  /** Zen mode hides the status bar. */
  zenMode: boolean;
};

export type StatusConsumers = {
  panel: boolean;
  gitTab: boolean;
  explorerDecorations: boolean;
  railBadge: boolean;
  statusbarWidgets: boolean;
  /** Some consumer is on screen, so `git status` should stay fresh. */
  live: boolean;
};

const GIT_TAB_KINDS: ReadonlySet<string> = new Set([
  "git-diff",
  "git-history",
  "git-commit-file",
]);

export function isGitTabKind(kind: string | undefined): boolean {
  return kind !== undefined && GIT_TAB_KINDS.has(kind);
}

export function statusConsumers(input: StatusConsumerInput): StatusConsumers {
  const sidebarShown = !input.sidebarCollapsed;
  const panel = sidebarShown && input.sidebarView === "source-control";
  const gitTab = isGitTabKind(input.activeTabKind);
  const explorerDecorations =
    sidebarShown &&
    input.sidebarView === "explorer" &&
    input.explorerGitDecorations;
  // The rail with its changed-files badge is part of every open sidebar.
  const railBadge = sidebarShown;
  const statusbarWidgets =
    !input.zenMode &&
    input.statusbarLayout.some(
      (w) => w.visible && GIT_STATUS_WIDGET_IDS.has(w.id),
    );
  return {
    panel,
    gitTab,
    explorerDecorations,
    railBadge,
    statusbarWidgets,
    live:
      panel || gitTab || explorerDecorations || railBadge || statusbarWidgets,
  };
}
