import type { StatusbarWidgetId } from "../layout";
import type { StatusbarWidgetComponent } from "./context";
import { AgentStatusWidget } from "./AgentStatusWidget";
import {
  ClaudeContextWidget,
  ClaudeCostWidget,
  ClaudeModelWidget,
} from "./ClaudeWidgets";
import { CwdWidget } from "./CwdWidget";
import {
  GitBranchWidget,
  GitChangesWidget,
  GitStagedWidget,
  GitSyncWidget,
  LineChangesWidget,
} from "./GitWidgets";
import { PrivateWidget } from "./PrivateWidget";
import { WorkspaceEnvWidget } from "./WorkspaceEnvWidget";

export const STATUSBAR_WIDGET_COMPONENTS: Record<
  StatusbarWidgetId,
  StatusbarWidgetComponent
> = {
  "workspace-env": WorkspaceEnvWidget,
  cwd: CwdWidget,
  "git-branch": GitBranchWidget,
  "git-sync": GitSyncWidget,
  "git-changes": GitChangesWidget,
  "git-staged": GitStagedWidget,
  "line-changes": LineChangesWidget,
  "agent-status": AgentStatusWidget,
  "claude-model": ClaudeModelWidget,
  "claude-context": ClaudeContextWidget,
  "claude-cost": ClaudeCostWidget,
  private: PrivateWidget,
};
