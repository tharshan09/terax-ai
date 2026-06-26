import type { ReactElement } from "react";
import type { SourceControlSummary } from "@/modules/source-control";
import type { WorkspaceEnv } from "@/modules/workspace";
import type { ClaudeStatus } from "../lib/useClaudeStatus";

/**
 * Everything a status-bar widget might need, derived once per render in
 * StatusBar and handed to each widget. Widgets that need live reactive data
 * (workspace env, terminal agent status) subscribe to their own store instead
 * of taking it from here, matching the house pattern.
 */
export type StatusbarWidgetCtx = {
  cwd: string | null;
  filePath: string | null;
  home: string | null;
  onCd: (path: string) => void;
  onWorkspaceChange: (env: WorkspaceEnv) => void;
  sourceControl: SourceControlSummary;
  activeLeafId: number | null;
  privateActive: boolean;
  claudeStatus: ClaudeStatus | null;
};

export type StatusbarWidgetComponent = (props: {
  ctx: StatusbarWidgetCtx;
}) => ReactElement | null;
