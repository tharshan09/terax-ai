import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { WorkspaceEnv } from "@/modules/workspace";
import type { SearchAddon } from "@xterm/addon-search";
import { Fragment, type PointerEvent as ReactPointerEvent } from "react";
import { useTerminalDropStore } from "./lib/dropStore";
import { usePaneDndStore } from "./lib/paneDndStore";
import { type DropEdge, leafIds, type PaneNode } from "./lib/panes";
import { TerminalPane, type TerminalPaneHandle } from "./TerminalPane";

type LeafBundle = {
  setRef: (h: TerminalPaneHandle | null) => void;
  onSearchReady: (leafId: number, addon: SearchAddon) => void;
  onCwd: (leafId: number, cwd: string) => void;
  onExit: (leafId: number, code: number) => void;
};

type Props = {
  node: PaneNode;
  tabVisible: boolean;
  activeLeafId: number;
  blocks: boolean;
  /** Execution env shared by every leaf inside this tab. */
  workspace?: WorkspaceEnv;
  onFocusLeaf: (leafId: number) => void;
  getBundle: (leafId: number) => LeafBundle;
  /** True once inside a split subtree — enables the active-pane highlight. A
   *  lone pane is always "focused", so the effect is skipped for it. */
  split?: boolean;
  /** Start a pane drag from a leaf's grab handle (pane drag & drop). */
  onPaneDragStart?: (leafId: number, e: ReactPointerEvent) => void;
};

export function PaneTreeView(props: Props) {
  const { node } = props;
  const marker = usePreferencesStore((s) => s.activePaneMarker);
  const inactiveStyle = usePreferencesStore((s) => s.inactivePaneStyle);
  const paneHeaders = usePreferencesStore((s) => s.paneHeaders);
  if (node.kind === "leaf") {
    const {
      tabVisible,
      activeLeafId,
      blocks,
      workspace,
      onFocusLeaf,
      getBundle,
      split,
      onPaneDragStart,
    } = props;
    const focused = node.id === activeLeafId;
    const b = getBundle(node.id);
    // Highlights only matter inside a split — a lone pane is always active.
    const focusMarker = split && focused && marker === "edge";
    const dim =
      split &&
      !focused &&
      (inactiveStyle === "dim" || inactiveStyle === "both");
    const desaturate =
      split &&
      !focused &&
      (inactiveStyle === "desaturate" || inactiveStyle === "both");
    const grayed = split && !focused && inactiveStyle === "grayed";
    const showHeader = split === true && paneHeaders;
    return (
      <div
        onMouseDownCapture={() => {
          if (!focused) onFocusLeaf(node.id);
        }}
        // Catches focus from Tab, programmatic focus, or any path that
        // skips mousedown — keeps activeLeafId in sync with DOM focus.
        onFocus={() => {
          if (!focused) onFocusLeaf(node.id);
        }}
        data-pane-leaf={node.id}
        className={cn(
          // Original BLOCK layout — the resize handle depends on this. All the
          // focus styling below is layered as pure overlays so it never touches
          // the pane's box or the handle's hit geometry.
          "group relative h-full w-full transition-[opacity,filter] duration-150",
          dim && "opacity-55",
          desaturate && "saturate-[0.35]",
          // Grayed (iTerm-style): a neutral veil over the whole inactive pane.
          grayed &&
            "after:pointer-events-none after:absolute after:inset-0 after:z-10 after:bg-neutral-500/15 after:content-['']",
        )}
      >
        <TerminalPane
          leafId={node.id}
          visible={tabVisible}
          focused={focused}
          initialCwd={node.cwd}
          tmuxSession={node.tmuxSession}
          blocks={blocks}
          workspace={workspace}
          ref={b.setRef}
          onSearchReady={b.onSearchReady}
          onCwd={b.onCwd}
          onExit={b.onExit}
        />
        <DropOverlay leafId={node.id} />
        {split && <PaneDropOverlay leafId={node.id} />}
        {split && onPaneDragStart && (
          <button
            type="button"
            aria-label="Drag pane"
            title="Drag to move this pane"
            onPointerDown={(e) => onPaneDragStart(node.id, e)}
            className="pointer-events-auto absolute top-1 left-1/2 z-20 flex h-4 w-9 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-border/50 bg-background/80 opacity-0 backdrop-blur-sm transition-opacity active:cursor-grabbing group-hover:opacity-100"
          >
            <span className="h-0.5 w-4 rounded-full bg-muted-foreground/60" />
          </button>
        )}
        {showHeader && <PaneHeader cwd={node.cwd} focused={focused} />}
        {focusMarker && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[3px] bg-primary" />
        )}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation={node.dir === "row" ? "horizontal" : "vertical"}
    >
      {node.children.map((child, i) => {
        // "divider" marker: tint the handle(s) that touch the active pane.
        const prev = node.children[i - 1];
        const dividerActive =
          marker === "divider" &&
          ((prev !== undefined && leafIds(prev).includes(props.activeLeafId)) ||
            leafIds(child).includes(props.activeLeafId));
        return (
          // Keyed by the subtree's first leaf, not the node id: when a leaf is
          // split in place, the replacing split node gets a fresh id and would
          // otherwise remount the surviving pane.
          <Fragment key={leafIds(child)[0]}>
            {i > 0 && (
              <ResizableHandle
                withHandle
                className={dividerActive ? "bg-primary/70" : undefined}
              />
            )}
            <ResizablePanel id={`pane-${child.id}`} minSize="10%">
              <PaneTreeView {...props} node={child} split />
            </ResizablePanel>
          </Fragment>
        );
      })}
    </ResizablePanelGroup>
  );
}

function PaneHeader({ cwd, focused }: { cwd?: string; focused: boolean }) {
  const label = cwd
    ? cwd.split(/[\\/]/).filter(Boolean).slice(-1)[0] || cwd
    : "shell";
  return (
    <div
      title={cwd}
      className={cn(
        // Absolute overlay across the top — keeps the pane's block layout intact
        // (so resizing still works); it covers the terminal's top row.
        "pointer-events-none absolute inset-x-0 top-0 z-[15] flex h-6 select-none items-center gap-1.5 border-b px-2 font-mono text-[10.5px] leading-none backdrop-blur-sm",
        focused
          ? "border-primary/40 bg-primary/15 text-foreground"
          : "border-border/40 bg-muted/40 text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          focused ? "bg-primary" : "bg-muted-foreground/40",
        )}
      />
      <span className="truncate">{label}</span>
    </div>
  );
}

function DropOverlay({ leafId }: { leafId: number }) {
  const active = useTerminalDropStore((s) => s.targetLeafId === leafId);
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg border border-primary/45 bg-background/70 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm">
      Drop file path here
    </div>
  );
}

const EDGE_POS: Record<DropEdge, string> = {
  left: "inset-y-0 left-0 w-1/2",
  right: "inset-y-0 right-0 w-1/2",
  top: "inset-x-0 top-0 h-1/2",
  bottom: "inset-x-0 bottom-0 h-1/2",
};

// Highlights the half of the target pane where a dragged pane would land.
function PaneDropOverlay({ leafId }: { leafId: number }) {
  const edge = usePaneDndStore((s) =>
    s.targetLeafId === leafId ? s.edge : null,
  );
  if (!edge) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[19]">
      <div
        className={cn(
          "absolute rounded-md border-2 border-primary bg-primary/20",
          EDGE_POS[edge],
        )}
      />
    </div>
  );
}
