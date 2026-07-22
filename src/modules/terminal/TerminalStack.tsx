import type { Tab, TerminalTab } from "@/modules/tabs";
import type { SearchAddon } from "@xterm/addon-search";
import {
  memo,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { selectLiveTerminals } from "./lib/liveTerminals";
import { type DropEdge, leafIds } from "./lib/panes";
import { useTerminalPaneDnd } from "./lib/useTerminalPaneDnd";
import { PaneTreeView } from "./PaneTreeView";
import type { TerminalPaneHandle } from "./TerminalPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  /** Register/unregister handle by leaf id (not tab id). */
  registerHandle: (leafId: number, handle: TerminalPaneHandle | null) => void;
  onSearchReady: (leafId: number, addon: SearchAddon) => void;
  onCwd: (leafId: number, cwd: string) => void;
  onExit: (leafId: number, code: number) => void;
  onFocusLeaf: (tabId: number, leafId: number) => void;
  movePane: (
    sourceLeafId: number,
    targetLeafId: number,
    edge: DropEdge,
  ) => void;
};

type Bundle = {
  setRef: (h: TerminalPaneHandle | null) => void;
  onSearchReady: (leafId: number, addon: SearchAddon) => void;
  onCwd: (leafId: number, cwd: string) => void;
  onExit: (leafId: number, code: number) => void;
};

type TerminalTabLayerProps = {
  tab: TerminalTab;
  tabVisible: boolean;
  onFocusLeaf: (tabId: number, leafId: number) => void;
  getBundle: (leafId: number) => Bundle;
  onPaneDragStart: (leafId: number, e: ReactPointerEvent) => void;
};

/**
 * One keep-alive layer per terminal tab. Memoized so a bare `activeId` switch
 * only re-renders the two tabs whose visibility actually flips (the outgoing and
 * incoming tab); every other layer bails on the shallow prop compare, which is
 * what keeps a tab switch from scaling with the open-tab count. All props it
 * receives are reference-stable across a switch: `tab` keeps identity via the
 * store's structural sharing, and the callbacks are stabilized in the parent.
 */
const TerminalTabLayer = memo(function TerminalTabLayer({
  tab,
  tabVisible,
  onFocusLeaf,
  getBundle,
  onPaneDragStart,
}: TerminalTabLayerProps) {
  const focusLeaf = useCallback(
    (leafId: number) => onFocusLeaf(tab.id, leafId),
    [onFocusLeaf, tab.id],
  );
  return (
    <div
      className="absolute inset-0"
      style={{
        visibility: tabVisible ? "visible" : "hidden",
        pointerEvents: tabVisible ? "auto" : "none",
      }}
      aria-hidden={!tabVisible}
    >
      <PaneTreeView
        node={tab.paneTree}
        tabVisible={tabVisible}
        activeLeafId={tab.activeLeafId}
        blocks={tab.blocks ?? false}
        workspace={tab.workspace}
        onFocusLeaf={focusLeaf}
        getBundle={getBundle}
        onPaneDragStart={onPaneDragStart}
      />
    </div>
  );
});

function TerminalStackInner({
  tabs,
  activeId,
  registerHandle,
  onSearchReady,
  onCwd,
  onExit,
  onFocusLeaf,
  movePane,
}: Props) {
  const terminals = useMemo(() => selectLiveTerminals(tabs), [tabs]);
  const paneDnd = useTerminalPaneDnd(movePane);

  const registerRef = useRef(registerHandle);
  const searchReadyRef = useRef(onSearchReady);
  const cwdRef = useRef(onCwd);
  const exitRef = useRef(onExit);
  useEffect(() => {
    registerRef.current = registerHandle;
  }, [registerHandle]);
  useEffect(() => {
    searchReadyRef.current = onSearchReady;
  }, [onSearchReady]);
  useEffect(() => {
    cwdRef.current = onCwd;
  }, [onCwd]);
  useEffect(() => {
    exitRef.current = onExit;
  }, [onExit]);

  const bundles = useRef(new Map<number, Bundle>());
  // Stable identity so the memoized layers below aren't invalidated every
  // render. It reads the latest callbacks through refs, so a fresh
  // `registerHandle`/`onCwd`/... never needs a new `getBundle`.
  const getBundle = useCallback((leafId: number): Bundle => {
    let b = bundles.current.get(leafId);
    if (!b) {
      b = {
        setRef: (h) => registerRef.current(leafId, h),
        onSearchReady: (id, addon) => searchReadyRef.current(id, addon),
        onCwd: (id, cwd) => cwdRef.current(id, cwd),
        onExit: (id, code) => exitRef.current(id, code),
      };
      bundles.current.set(leafId, b);
    }
    return b;
  }, []);

  useEffect(() => {
    const live = new Set<number>();
    for (const t of terminals)
      for (const id of leafIds(t.paneTree)) live.add(id);
    for (const id of bundles.current.keys()) {
      if (!live.has(id)) bundles.current.delete(id);
    }
  }, [terminals]);

  return (
    <div className="relative h-full w-full">
      {terminals.map((t) => (
        <TerminalTabLayer
          key={t.id}
          tab={t}
          tabVisible={t.id === activeId}
          onFocusLeaf={onFocusLeaf}
          getBundle={getBundle}
          onPaneDragStart={paneDnd.startDrag}
        />
      ))}
      {paneDnd.dragging && (
        <div
          ref={paneDnd.ghostRef}
          className="pointer-events-none fixed top-0 left-0 z-50 rounded-md border border-primary/50 bg-background/90 px-2 py-1 font-medium text-foreground text-xs shadow-lg backdrop-blur-sm"
        >
          Move pane
        </div>
      )}
    </div>
  );
}

export const TerminalStack = memo(TerminalStackInner);
