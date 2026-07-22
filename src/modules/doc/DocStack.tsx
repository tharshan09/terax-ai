import { cn } from "@/lib/utils";
import type { HtmlTab, MarkdownTab, Tab } from "@/modules/tabs";
import type { WorkspaceEnv } from "@/modules/workspace";
import {
  type ComponentType,
  lazy,
  memo,
  Suspense,
  useCallback,
  useMemo,
} from "react";

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

type DocTabLayerProps = {
  Pane: ComponentType<DocPaneProps>;
  tab: MarkdownTab | HtmlTab;
  visible: boolean;
  onSetDocView: (id: number, mode: "rendered" | "raw") => void;
};

/**
 * One keep-alive layer per doc tab. Memoized so a bare `activeId` switch only
 * re-renders the two tabs whose visibility flips; every other layer bails on the
 * shallow prop compare. `Pane` is a module-level constant, so it stays stable.
 */
const DocTabLayer = memo(function DocTabLayer({
  Pane,
  tab,
  visible,
  onSetDocView,
}: DocTabLayerProps) {
  const setView = useCallback(
    (mode: "rendered" | "raw") => onSetDocView(tab.id, mode),
    [onSetDocView, tab.id],
  );
  return (
    <div
      className={cn(
        "absolute inset-0",
        !visible && "invisible pointer-events-none",
      )}
      aria-hidden={!visible}
    >
      <Pane
        path={tab.path}
        workspace={tab.workspace}
        visible={visible}
        onSetView={setView}
      />
    </div>
  );
});

/**
 * Renders the doc-preview tabs of one kind (markdown or html) for a workspace.
 * Generic over the kind: filters the tab list, then renders the matching
 * lazily-loaded preview pane. Every matching tab stays mounted (just hidden
 * when inactive) so per-tab state — scroll position, render cache — survives a
 * tab switch. Both kinds carry a `workspace` fixed at open (see WS2-a), so the
 * pane reads from the host the file actually lives on.
 */
function DocStackInner({ kind, tabs, activeId, onSetDocView }: Props) {
  const docs = useMemo(
    () =>
      tabs.filter(
        (t): t is MarkdownTab | HtmlTab => t.kind === kind && !t.cold,
      ),
    [tabs, kind],
  );
  if (docs.length === 0) return null;
  const Pane = PANES[kind];
  return (
    <Suspense fallback={null}>
      <div className="relative h-full w-full">
        {docs.map((t) => (
          <DocTabLayer
            key={t.id}
            Pane={Pane}
            tab={t}
            visible={t.id === activeId}
            onSetDocView={onSetDocView}
          />
        ))}
      </div>
    </Suspense>
  );
}

export const DocStack = memo(DocStackInner);
