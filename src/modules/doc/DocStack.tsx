import { cn } from "@/lib/utils";
import type { HtmlTab, MarkdownTab, Tab } from "@/modules/tabs";
import type { WorkspaceEnv } from "@/modules/workspace";
import { type ComponentType, lazy, Suspense } from "react";

type DocKind = "html" | "markdown";

type DocPaneProps = {
  path: string;
  workspace?: WorkspaceEnv;
  visible: boolean;
  onSetView: (mode: "rendered" | "raw") => void;
};

// Each preview pane is code-split into its own chunk (markdown pulls in
// Streamdown + the markdown code renderer). Keeping the lazy boundary here, at
// the pane level, means a workspace that only ever opens one doc kind never
// downloads the other pane.
const PANES: Record<DocKind, ComponentType<DocPaneProps>> = {
  html: lazy(() =>
    import("@/modules/html/HtmlPreviewPane").then((m) => ({
      default: m.HtmlPreviewPane,
    })),
  ),
  markdown: lazy(() =>
    import("@/modules/markdown/MarkdownPreviewPane").then((m) => ({
      default: m.MarkdownPreviewPane,
    })),
  ),
};

type Props = {
  kind: DocKind;
  tabs: Tab[];
  activeId: number;
  onSetDocView: (id: number, mode: "rendered" | "raw") => void;
};

/**
 * Renders the doc-preview tabs of one kind (markdown or html) for a workspace.
 * Generic over the kind: filters the tab list, then renders the matching
 * lazily-loaded preview pane. Every matching tab stays mounted (just hidden
 * when inactive) so per-tab state — scroll position, render cache — survives a
 * tab switch. Both kinds carry a `workspace` fixed at open (see WS2-a), so the
 * pane reads from the host the file actually lives on.
 */
export function DocStack({ kind, tabs, activeId, onSetDocView }: Props) {
  const docs = tabs.filter(
    (t): t is MarkdownTab | HtmlTab => t.kind === kind && !t.cold,
  );
  if (docs.length === 0) return null;
  const Pane = PANES[kind];
  return (
    <Suspense fallback={null}>
      <div className="relative h-full w-full">
        {docs.map((t) => {
          const visible = t.id === activeId;
          return (
            <div
              key={t.id}
              className={cn(
                "absolute inset-0",
                !visible && "invisible pointer-events-none",
              )}
              aria-hidden={!visible}
            >
              <Pane
                path={t.path}
                workspace={t.workspace}
                visible={visible}
                onSetView={(mode) => onSetDocView(t.id, mode)}
              />
            </div>
          );
        })}
      </div>
    </Suspense>
  );
}
