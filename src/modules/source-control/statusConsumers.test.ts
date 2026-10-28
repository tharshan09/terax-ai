import { describe, expect, it } from "vitest";
import {
  DEFAULT_STATUSBAR_LAYOUT,
  GIT_STATUS_WIDGET_IDS,
  STATUSBAR_WIDGETS,
  type StatusbarLayout,
  type StatusbarWidgetId,
} from "@/modules/statusbar/layout";
import {
  isGitTabKind,
  type StatusConsumerInput,
  statusConsumers,
} from "./statusConsumers";

const noGitWidgets: StatusbarLayout = STATUSBAR_WIDGETS.map((id) => ({
  id,
  visible: !GIT_STATUS_WIDGET_IDS.has(id),
}));

const only = (id: StatusbarWidgetId): StatusbarLayout =>
  STATUSBAR_WIDGETS.map((w) => ({ id: w, visible: w === id }));

const idle: StatusConsumerInput = {
  sidebarView: "explorer",
  sidebarCollapsed: true,
  activeTabKind: "terminal",
  explorerGitDecorations: false,
  statusbarLayout: noGitWidgets,
  zenMode: false,
};

const live = (over: Partial<StatusConsumerInput>) =>
  statusConsumers({ ...idle, ...over }).live;

describe("statusConsumers", () => {
  // [AC-5]
  it("is idle with the sidebar collapsed, a terminal tab and no git widget", () => {
    expect(live({})).toBe(false);
    expect(live({ activeTabKind: "editor" })).toBe(false);
    expect(live({ activeTabKind: undefined })).toBe(false);
    expect(live({ explorerGitDecorations: true })).toBe(false);
    expect(live({ sidebarView: "source-control" })).toBe(false);
  });

  // [AC-5]
  it("goes live whenever the sidebar is open, through its rail badge", () => {
    for (const sidebarView of ["explorer", "source-control"] as const) {
      for (const explorerGitDecorations of [false, true]) {
        const out = statusConsumers({
          ...idle,
          sidebarCollapsed: false,
          sidebarView,
          explorerGitDecorations,
        });
        expect(out.railBadge).toBe(true);
        expect(out.live).toBe(true);
      }
    }
  });

  it("counts the panel and explorer decorations only for the shown sidebar view", () => {
    const panel = statusConsumers({
      ...idle,
      sidebarCollapsed: false,
      sidebarView: "source-control",
      explorerGitDecorations: true,
    });
    expect(panel.panel).toBe(true);
    expect(panel.explorerDecorations).toBe(false);

    const explorer = statusConsumers({
      ...idle,
      sidebarCollapsed: false,
      explorerGitDecorations: true,
    });
    expect(explorer.panel).toBe(false);
    expect(explorer.explorerDecorations).toBe(true);
  });

  // [AC-5]
  it("goes live for an active git tab with the sidebar collapsed", () => {
    for (const kind of ["git-diff", "git-history", "git-commit-file"]) {
      expect(live({ activeTabKind: kind })).toBe(true);
    }
    expect(isGitTabKind("ai-diff")).toBe(false);
    expect(isGitTabKind("terminal")).toBe(false);
    expect(isGitTabKind(undefined)).toBe(false);
  });

  // [AC-5]
  it("goes live for each git widget shown in the status bar", () => {
    for (const id of GIT_STATUS_WIDGET_IDS) {
      expect(live({ statusbarLayout: only(id) })).toBe(true);
    }
    expect(live({ statusbarLayout: only("cwd") })).toBe(false);
    expect(live({ statusbarLayout: DEFAULT_STATUSBAR_LAYOUT })).toBe(true);
  });

  // [AC-5]
  it("ignores status bar widgets in zen mode", () => {
    expect(live({ zenMode: true, statusbarLayout: only("git-branch") })).toBe(
      false,
    );
    expect(
      live({ zenMode: true, statusbarLayout: DEFAULT_STATUSBAR_LAYOUT }),
    ).toBe(false);
    expect(
      live({
        zenMode: true,
        statusbarLayout: only("git-branch"),
        activeTabKind: "git-diff",
      }),
    ).toBe(true);
    expect(live({ zenMode: true, sidebarCollapsed: false })).toBe(true);
  });
});
