import { useChatStore } from "@/modules/ai";
import { AgentStatusPill } from "@/modules/ai/components/AgentStatusPill";
import {
  AiOpenButton,
  AiStatusBarControls,
} from "@/modules/ai/components/AiStatusBarControls";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { SourceControlSummary } from "@/modules/source-control";
import type { WorkspaceEnv } from "@/modules/workspace";
import { useClaudeStatus } from "./lib/useClaudeStatus";
import { StatusbarConfig } from "./StatusbarConfig";
import type { StatusbarWidgetCtx } from "./widgets/context";
import { STATUSBAR_WIDGET_COMPONENTS } from "./widgets/registry";

type Props = {
  cwd: string | null;
  filePath?: string | null;
  home: string | null;
  onCd: (path: string) => void;
  onWorkspaceChange: (env: WorkspaceEnv) => void;
  onOpenMini: () => void;
  /** Only rendered when the AI panel is open and a key is loaded. */
  hasComposer: boolean;
  privateActive: boolean;
  sourceControl: SourceControlSummary;
  activeLeafId: number | null;
  /** Active terminal tab's env + tmux session, so Claude stats can be read from
   *  the host (and session) Claude actually runs on over SSH. */
  activeWorkspace?: WorkspaceEnv;
  activeTmuxSession?: string;
};

export function StatusBar({
  cwd,
  filePath,
  home,
  onCd,
  onWorkspaceChange,
  onOpenMini,
  hasComposer,
  privateActive,
  sourceControl,
  activeLeafId,
  activeWorkspace,
  activeTmuxSession,
}: Props) {
  const panelOpen = useChatStore((s) => s.panelOpen);
  const openPanel = useChatStore((s) => s.openPanel);
  const layout = usePreferencesStore((s) => s.statusbarLayout);
  const showAi = usePreferencesStore((s) => s.statusbarShowAi);

  // Only poll Claude Code stats when a Claude widget is actually shown.
  const claudeShown = layout.some(
    (w) => w.visible && w.id.startsWith("claude-"),
  );
  const claudeStatus = useClaudeStatus(
    activeLeafId,
    claudeShown,
    activeWorkspace,
    activeTmuxSession,
  );

  const ctx: StatusbarWidgetCtx = {
    cwd,
    filePath: filePath ?? null,
    home,
    onCd,
    onWorkspaceChange,
    sourceControl,
    activeLeafId,
    privateActive,
    claudeStatus,
  };

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-card/60 px-3 text-[11px]">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {layout.map((item) => {
          if (!item.visible) return null;
          const Widget = STATUSBAR_WIDGET_COMPONENTS[item.id];
          return <Widget key={item.id} ctx={ctx} />;
        })}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <StatusbarConfig />
        <AgentStatusPill onClick={onOpenMini} />
        {showAi &&
          (panelOpen && hasComposer ? (
            <AiStatusBarControls />
          ) : (
            <AiOpenButton onOpen={openPanel} />
          ))}
      </div>
    </footer>
  );
}
