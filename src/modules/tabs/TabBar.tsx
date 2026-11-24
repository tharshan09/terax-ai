import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SshHost } from "@/modules/workspace/sshHosts";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePaneDndStore } from "@/modules/terminal/lib/paneDndStore";
import { gapTargetAt, TAB_GROUP_ATTR, TAB_STRIP_ATTR } from "./lib/tabStripGap";
import { canMergeTabs } from "./lib/useTabs";
import { fmtShortcut, MOD_KEY, SHIFT_KEY } from "@/lib/platform";
import { cn } from "@/lib/utils";
import {
  ALL_LANGUAGES,
  EXPOSED_LANGUAGES,
} from "@/modules/editor/lib/languageDefinitions";
import { resolveDisplayName } from "@/modules/editor/lib/languageResolver";
import { FileIcon } from "@/modules/explorer/FileIcon";
import {
  Cancel01Icon,
  Clock01Icon,
  ComputerTerminal02Icon,
  GitBranchIcon,
  GitCompareIcon,
  Globe02Icon,
  IncognitoIcon,
  Layers01Icon,
  MinusSignSquareIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  PlusSignSquareIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Fragment,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { labelFor } from "./lib/tabLabel";
import {
  type GapTarget,
  type StripItem,
  stripLayout,
  type TabGroup,
} from "./lib/tabGroups";
import type { EditorTab, Tab, TerminalTab } from "./lib/useTabs";
import { TabActivityIndicator } from "./TabActivityIndicator";
import { groupColor, groupDisplayName, TabGroupHeader } from "./TabGroupHeader";

type DropTarget =
  | { kind: "gap"; gap: GapTarget }
  | { kind: "merge"; id: number }
  | null;

type DragSource = { kind: "tab"; id: number } | { kind: "group"; id: string };

type GroupItem = Extract<StripItem, { kind: "group" }>;

/** Where a drop would land, as drawn: a line before drawn element `index`
 *  (group-coloured inside a group), or a highlighted collapsed header. */
type DropMarker =
  | { kind: "line"; index: number; color: string | null }
  | { kind: "header"; groupId: string }
  | null;

/** A drag moves only past this many pixels; below it the release is a click. */
const DRAG_THRESHOLD = 4;

/** How far above/below the tab strip a merge drop still counts; further away
 *  the gesture falls back to a (reversible) reorder, never a merge. */
const MERGE_Y_SLACK = 8;

const TAB_MENU_ITEM = "gap-2 rounded-xl px-2.5 py-1.5 text-[13px]";

export type TabBarGroupProps = {
  spaceId: string;
  groups: TabGroup[];
  renamingGroupId: string | null;
  onRenamingGroupChange: (groupId: string | null) => void;
  onCreateGroup: (tabId: number) => void;
  onAddToGroup: (tabId: number, groupId: string) => void;
  onRemoveFromGroup: (tabId: number) => void;
  onUngroup: (groupId: string) => void;
  onRenameGroup: (groupId: string, name: string) => void;
  onSetGroupColor: (groupId: string, color: number) => void;
  onToggleGroup: (groupId: string) => void;
  onMoveGroup: (groupId: string, target: GapTarget) => void;
  onMoveGroupToSpace: (groupId: string, spaceId: string) => void;
  onCloseGroup: (groupId: string) => void;
};

type Props = {
  /** The whole strip of the active space, collapsed members included. */
  tabs: Tab[];
  activeId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewBlock: () => void;
  onNewPrivate: () => void;
  /** Open a remote terminal connected to the given ~/.ssh/config host. */
  onNewSsh: (host: string) => void;
  /** Hosts from ~/.ssh/config shown in the SSH submenu. */
  sshHosts: SshHost[];
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
  onClose: (id: number) => void;
  /** Pin (promote) a preview tab to persistent on double-click. */
  onPin: (id: number) => void;
  /** Set a terminal tab's custom label; empty string resets to default. */
  onRename: (id: number, title: string) => void;
  /** Move a dragged tab to the insertion gap it was dropped on. */
  onReorder: (fromId: number, target: GapTarget) => void;
  /** Drop a terminal tab onto another terminal tab: merge it in as a split pane. */
  onMergeInto?: (fromId: number, intoId: number) => void;
  onOverrideLanguage?: (id: number, lang: string | null) => void;
  compact?: boolean;
  groupProps: TabBarGroupProps;
};

export function TabBar({
  tabs,
  activeId,
  onSelect,
  onNew,
  onNewBlock,
  onNewPrivate,
  onNewSsh,
  sshHosts,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
  onClose,
  onPin,
  onRename,
  onReorder,
  onMergeInto,
  onOverrideLanguage,
  compact,
  groupProps,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  // The typed name of the tab being renamed; null until the field changes.
  const renameDraft = useRef<{ value: string; initial: string } | null>(null);
  const [dragging, setDragging] = useState<DragSource | null>(null);
  // Visual only; the release handler reads the ref so it is never a frame
  // behind the last pointermove.
  const [dropTarget, setDropTargetState] = useState<DropTarget>(null);
  const mergeTargetId = dropTarget?.kind === "merge" ? dropTarget.id : null;
  // A pane dragged onto the strip breaks out into a tab of its own. It lands in
  // the same insertion gaps a tab reorder uses, so it reuses the same indicator.
  const paneDropTab = usePaneDndStore((s) =>
    s.target?.kind === "newTab" ? s.sourceTabId : null,
  );
  const paneDropAt = usePaneDndStore((s) =>
    s.target?.kind === "newTab" ? s.target.gap : null,
  );
  // Only when this strip is the pane's own. The strip lists one space and the
  // space shortcuts keep working during a drag, so checking at render time is
  // what keeps a stale target from painting a line in the wrong space.
  const paneDropGap =
    paneDropTab !== null && tabs.some((t) => String(t.id) === paneDropTab)
      ? paneDropAt
      : null;
  const tabById = useMemo(() => new Map(tabs.map((t) => [t.id, t])), [tabs]);
  const { groups, spaceId } = groupProps;
  const layout = useMemo(
    () => stripLayout({ tabs, groups }, spaceId),
    [tabs, groups, spaceId],
  );
  // Drawn-element positions (headers and visible tabs), the unit every gap
  // index counts in.
  const { tabIndex, groupRange, stripGroups } = useMemo(() => {
    const tabIndex = new Map<number, number>();
    const groupRange = new Map<string, { start: number; end: number }>();
    const stripGroups: TabGroup[] = [];
    let i = 0;
    for (const item of layout) {
      if (item.kind === "tab") {
        tabIndex.set(item.tab.id, i++);
        continue;
      }
      stripGroups.push(item.group);
      const start = i++;
      if (!item.group.collapsed) {
        for (const m of item.members) tabIndex.set(m.id, i++);
      }
      groupRange.set(item.group.id, { start, end: i });
    }
    return { tabIndex, groupRange, stripGroups };
  }, [layout]);
  // React fires no blur when the focused field unmounts (its group collapsed,
  // the space switched), so the edit is resolved here the way a blur would.
  useEffect(() => {
    if (editingId === null || tabIndex.has(editingId)) return;
    const draft = renameDraft.current;
    renameDraft.current = null;
    setEditingId(null);
    if (draft !== null && draft.value.trim() !== draft.initial.trim()) {
      onRename(editingId, draft.value);
    }
  }, [editingId, tabIndex, onRename]);
  const colorOfGroup = (id: string | null): string | null => {
    if (id === null) return null;
    const g = stripGroups.find((x) => x.id === id);
    return g ? groupColor(g.color) : null;
  };
  const [showAllLanguages, setShowAllLanguages] = useState(false);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    source: DragSource;
    active: boolean;
    /** Source is a terminal tab and a merge handler exists. */
    canMerge: boolean;
    target: DropTarget;
  } | null>(null);

  const setDropTarget = (next: DropTarget) => {
    if (drag.current) drag.current.target = next;
    setDropTargetState(next);
  };

  // Play the enter animation only for tabs opened after the first paint, never
  // the restored set and never on switch/reorder (triggers are keyed, so they
  // don't remount then). The ref is seeded with the initial ids on first render.
  const seenRef = useRef<Set<number> | null>(null);
  const firstRender = seenRef.current === null;
  let seen = seenRef.current;
  if (seen === null) {
    seen = new Set(tabs.map((t) => t.id));
    seenRef.current = seen;
  }
  useEffect(() => {
    seenRef.current = new Set(tabs.map((t) => t.id));
  }, [tabs]);

  // Single shared pill slides to the active tab instead of each tab toggling
  // its own background. Measured relative to the list (its offsetParent) so it
  // scrolls with the strip for free; transform/width only, no layout on siblings.
  const [pill, setPill] = useState<{ left: number; width: number } | null>(
    null,
  );
  const [pillReady, setPillReady] = useState(false);

  const measurePill = useCallback(() => {
    const el = listRef.current?.querySelector<HTMLElement>(
      '[data-tab-active="true"]',
    );
    setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, []);

  // `layout` covers collapsing and renaming groups, which move tabs without
  // changing the tab list.
  useLayoutEffect(() => {
    measurePill();
  }, [measurePill, activeId, layout]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(measurePill);
    ro.observe(list);
    return () => ro.disconnect();
  }, [measurePill]);

  // Hold the transition off until the pill is first placed, so it never slides
  // in from the origin on mount.
  useEffect(() => {
    if (pill && !pillReady) {
      const id = requestAnimationFrame(() => setPillReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [pill, pillReady]);

  // The inner half of a mergeable terminal tab (pointer still on the strip
  // vertically) means "onto" it; everything else resolves to an insertion gap,
  // via the same helper the pane drag uses so both land in the same place.
  const dropTargetAt = (
    clientX: number,
    clientY: number,
    source: DragSource,
    canMerge: boolean,
  ): DropTarget => {
    const strip = scrollRef.current;
    if (!strip) {
      return {
        kind: "gap",
        gap: { index: 0, groupId: null, onCollapsedHeader: false },
      };
    }
    if (source.kind === "group") {
      return { kind: "gap", gap: gapTargetAt(strip, clientX) };
    }
    if (canMerge) {
      for (const el of strip.querySelectorAll<HTMLElement>("[data-tab-id]")) {
        const id = Number(el.dataset.tabId);
        if (id === source.id) continue;
        const r = el.getBoundingClientRect();
        const inner =
          clientX >= r.left + r.width / 4 &&
          clientX <= r.right - r.width / 4 &&
          clientY >= r.top - MERGE_Y_SLACK &&
          clientY <= r.bottom + MERGE_Y_SLACK;
        if (!inner) continue;
        if (canMergeTabs(tabById.get(source.id), tabById.get(id)) === null) {
          return { kind: "merge", id };
        }
      }
    }
    return {
      kind: "gap",
      gap: gapTargetAt(strip, clientX, { headerDrop: true }),
    };
  };

  const beginPointer = (
    e: PointerEvent<HTMLElement>,
    source: DragSource,
    canMerge: boolean,
  ) => {
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      source,
      active: false,
      canMerge,
      target: null,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const movePointer = (e: PointerEvent<HTMLElement>) => {
    const st = drag.current;
    if (!st || st.pointerId !== e.pointerId) return;
    if (!st.active) {
      if (Math.abs(e.clientX - st.startX) < DRAG_THRESHOLD) return;
      st.active = true;
      setDragging(st.source);
      document.body.style.userSelect = "none";
    }
    e.preventDefault();
    setDropTarget(dropTargetAt(e.clientX, e.clientY, st.source, st.canMerge));
  };

  const endDrag = (currentTarget: HTMLElement) => {
    const st = drag.current;
    if (st) currentTarget.releasePointerCapture?.(st.pointerId);
    drag.current = null;
    setDragging(null);
    setDropTargetState(null);
    document.body.style.userSelect = "";
  };

  // Horizontal wheel scroll without holding shift.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the active tab visible after selection / open.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  // A gap that would leave the dragged tab or group where it is draws nothing;
  // a pane breaking out has no such no-op position, every gap is real.
  const marker = ((): DropMarker => {
    const gap =
      dragging && dropTarget?.kind === "gap"
        ? dropTarget.gap
        : dragging
          ? null
          : paneDropGap;
    if (!gap) return null;
    if (gap.onCollapsedHeader && gap.groupId !== null) {
      return { kind: "header", groupId: gap.groupId };
    }
    if (dragging?.kind === "tab") {
      const src = tabIndex.get(dragging.id);
      const own = tabById.get(dragging.id)?.groupId ?? null;
      if (
        src !== undefined &&
        (gap.index === src || gap.index === src + 1) &&
        gap.groupId === own
      ) {
        return null;
      }
    }
    if (dragging?.kind === "group") {
      if (gap.groupId === dragging.id) return null;
      // A group never lands inside another one: it goes right behind it.
      const index =
        gap.groupId !== null
          ? (groupRange.get(gap.groupId)?.end ?? gap.index)
          : gap.index;
      const own = groupRange.get(dragging.id);
      if (own && index >= own.start && index <= own.end) return null;
      return { kind: "line", index, color: null };
    }
    return { kind: "line", index: gap.index, color: colorOfGroup(gap.groupId) };
  })();

  const lineAt = (index: number): ReactNode =>
    marker?.kind === "line" && marker.index === index ? (
      <DropIndicator color={marker.color} />
    ) : null;

  const groupTargetsFor = (t: Tab): TabGroup[] =>
    stripGroups.filter((g) => g.id !== t.groupId);

  const renderTab = (t: Tab): ReactNode => {
    const isPreview = t.kind === "editor" && (t as EditorTab).preview;
    const isActive = t.id === activeId;
    const isNew = !firstRender && !seen.has(t.id);
    const groupAttr =
      t.groupId !== undefined ? { [TAB_GROUP_ATTR]: t.groupId } : {};

    // While renaming, render a non-button cell so the <input> is not
    // nested inside the trigger <button> (invalid HTML, and WebKit
    // blocks focus/selection on inputs inside buttons).
    if (editingId === t.id && t.kind === "terminal") {
      return (
        <div
          data-tab-id={t.id}
          {...groupAttr}
          className={cn(
            "flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent text-xs text-foreground",
            compact ? "px-1.5" : "px-2",
          )}
        >
          <TabIcon tab={t} />
          <TabRenameInput
            initial={labelFor(t)}
            onDraft={(value) => {
              renameDraft.current = { value, initial: labelFor(t) };
            }}
            onCommit={(value) => {
              renameDraft.current = null;
              onRename(t.id, value);
              setEditingId(null);
            }}
            onCancel={() => {
              renameDraft.current = null;
              setEditingId(null);
            }}
          />
        </div>
      );
    }

    // Counted over the whole strip, collapsed members included: a lone
    // visible tab beside a collapsed group can still close.
    const hasClose = tabs.length > 1;
    // Content of the single rightmost slot while not hovering: an
    // editor's unsaved-changes dot or the terminal agent activity
    // indicator (which itself renders nothing when no agent is live).
    const indicator =
      t.kind === "editor" && t.dirty ? (
        <span
          aria-label="Unsaved changes"
          className="size-1.5 shrink-0 rounded-full bg-foreground/70"
        />
      ) : t.kind === "terminal" ? (
        <TabActivityIndicator paneTree={(t as TerminalTab).paneTree} />
      ) : null;

    const trigger = (
      <TabsTrigger
        value={String(t.id)}
        data-tab-id={t.id}
        {...groupAttr}
        data-tab-active={isActive ? "true" : undefined}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
          beginPointer(
            e,
            { kind: "tab", id: t.id },
            Boolean(onMergeInto) && t.kind === "terminal",
          );
        }}
        onPointerMove={movePointer}
        onPointerUp={(e) => {
          const st = drag.current;
          const target = st?.target ?? null;
          if (st?.active && target?.kind === "merge" && onMergeInto) {
            onMergeInto(t.id, target.id);
          } else if (st?.active && target?.kind === "gap") {
            onReorder(t.id, target.gap);
          } else if (st && !st.active) {
            onSelect(t.id);
          }
          endDrag(e.currentTarget);
        }}
        onPointerCancel={(e) => endDrag(e.currentTarget)}
        onDoubleClick={() => isPreview && onPin(t.id)}
        onAuxClick={(e) => {
          if (e.button === 1 && tabs.length > 1) {
            e.preventDefault();
            e.stopPropagation();
            onClose(t.id);
          }
        }}
        // Suppress Radix's switch-on-mousedown so a tab grabbed to
        // drag (or a plain click) only activates on release.
        onMouseDown={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            return;
          }
          if (
            e.button === 0 &&
            !(e.target as HTMLElement).closest("[data-no-drag]")
          ) {
            e.preventDefault();
          }
        }}
        className={cn(
          "group relative z-[1] h-7 shrink-0 justify-between gap-1.5 rounded-md bg-transparent text-xs transition-colors data-active:bg-transparent dark:data-active:bg-transparent",
          isNew && "terax-tab-in",
          isActive
            ? "text-foreground dark:text-foreground"
            : "text-muted-foreground hover:text-foreground/80 dark:text-muted-foreground",
          dragging?.kind === "tab" && dragging.id === t.id && "opacity-50",
          mergeTargetId === t.id && "ring-1 ring-primary/70 bg-primary/10",
          compact ? "px-1.5!" : tabs.length === 1 ? "px-2!" : "ps-2! pe-1!",
        )}
      >
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5",
            compact ? "max-w-48" : "max-w-80",
          )}
        >
          {t.kind === "editor" ? (
            <DropdownMenu
              onOpenChange={(open) => {
                if (!open) setShowAllLanguages(false);
              }}
            >
              <DropdownMenuTrigger asChild>
                {/* span, not button: a button nested in the TabsTrigger button is invalid DOM and breaks WebKit focus. */}
                <span
                  role="button"
                  tabIndex={-1}
                  data-no-drag
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm p-1 -m-1 transition-all hover:bg-accent hover:text-accent-foreground hover:ring-1 hover:ring-primary/30 hover:shadow-[0_0_4px_var(--color-popover-foreground)]"
                >
                  <TabIcon tab={t} />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                side="bottom"
                sideOffset={6}
                alignOffset={-4}
                className="max-h-75 w-48 overflow-y-auto rounded-xl border border-border/40 bg-popover/90 p-1 backdrop-blur-md shadow-lg"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
              >
                <DropdownMenuItem
                  onSelect={() => {
                    onOverrideLanguage?.(t.id, null);
                  }}
                  className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-default focus:bg-accent focus:text-accent-foreground"
                >
                  <FileIcon
                    name={t.title}
                    className="size-3.5 shrink-0 object-contain"
                  />
                  <div className="flex flex-1 flex-col">
                    <span>Auto Detect</span>
                    <span className="text-[10px] text-muted-foreground italic">
                      Mode: {resolveDisplayName(t.title)}
                    </span>
                  </div>
                  {!(t as EditorTab).overrideLanguage && (
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      className="size-3.5 text-primary"
                    />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setShowAllLanguages((v) => !v);
                  }}
                  className="w-full px-2.5 py-1.5 text-left text-xs text-primary/60 hover:text-primary rounded-lg transition-colors hover:bg-accent"
                >
                  {showAllLanguages ? "↑ Fewer languages" : "↓ All languages"}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 border-t border-border/30" />
                {(showAllLanguages ? ALL_LANGUAGES : EXPOSED_LANGUAGES).map(
                  (lang) => {
                    const isSelected =
                      (t as EditorTab).overrideLanguage === lang.ext;
                    return (
                      <DropdownMenuItem
                        key={lang.ext}
                        onSelect={() => onOverrideLanguage?.(t.id, lang.ext)}
                        className="flex items-center gap-2 px-2.5 py-1.5 text-xs rounded-lg cursor-default focus:bg-accent focus:text-accent-foreground"
                      >
                        <FileIcon
                          name={`dummy.${lang.ext}`}
                          className="size-3.5 shrink-0 object-contain"
                        />
                        <span className="flex-1">{lang.name}</span>
                        {isSelected && (
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            className="size-3.5 text-primary"
                          />
                        )}
                      </DropdownMenuItem>
                    );
                  },
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <TabIcon tab={t} />
          )}
          {/* Preview tabs use italic to signal the transient state,
              matching the visual convention from VSCode. */}
          <span className={cn("truncate", isPreview && "italic")}>
            {labelFor(t)}
          </span>
        </span>
        {/* Fixed-size rightmost slot. When the tab is closable the
            indicator and the close button overlay each other in one
            cell, so hovering swaps them with no reflow: the tab never
            changes width. A lone tab has no close button, so its
            indicator can size naturally. */}
        {hasClose ? (
          <span className="relative flex size-4 shrink-0 items-center justify-center">
            <span className="absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0">
              {indicator}
            </span>
            <span
              role="button"
              aria-label="Close tab"
              data-no-drag
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onClose(t.id);
              }}
              className="absolute inset-0 hidden items-center justify-center rounded transition-colors hover:bg-accent group-hover:flex"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
            </span>
          </span>
        ) : indicator ? (
          <span className="flex shrink-0 items-center">{indicator}</span>
        ) : null}
      </TabsTrigger>
    );

    const targets = groupTargetsFor(t);
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
        <ContextMenuContent
          className="min-w-32 p-1"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <ContextMenuItem
            className={TAB_MENU_ITEM}
            onSelect={() => groupProps.onCreateGroup(t.id)}
          >
            <HugeiconsIcon
              icon={PlusSignSquareIcon}
              size={13}
              strokeWidth={1.75}
            />
            <span className="flex-1">Add to new group</span>
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger
              className={TAB_MENU_ITEM}
              disabled={targets.length === 0}
            >
              <HugeiconsIcon icon={Layers01Icon} size={13} strokeWidth={1.75} />
              <span className="flex-1">Add to group</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-36 p-1">
              {targets.map((g) => (
                <ContextMenuItem
                  key={g.id}
                  className={TAB_MENU_ITEM}
                  onSelect={() => groupProps.onAddToGroup(t.id, g.id)}
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: groupColor(g.color) }}
                  />
                  <span className="flex-1 truncate">
                    {groupDisplayName(g.name)}
                  </span>
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          {t.groupId !== undefined && (
            <ContextMenuItem
              className={TAB_MENU_ITEM}
              onSelect={() => groupProps.onRemoveFromGroup(t.id)}
            >
              <HugeiconsIcon
                icon={MinusSignSquareIcon}
                size={13}
                strokeWidth={1.75}
              />
              <span className="flex-1">Remove from group</span>
            </ContextMenuItem>
          )}
          {t.kind === "terminal" && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className={TAB_MENU_ITEM}
                onSelect={() => {
                  renameDraft.current = null;
                  setEditingId(t.id);
                }}
              >
                <HugeiconsIcon
                  icon={PencilEdit02Icon}
                  size={13}
                  strokeWidth={1.75}
                />
                <span className="flex-1">Rename</span>
              </ContextMenuItem>
              {tabs.length > 1 && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    className={TAB_MENU_ITEM}
                    onSelect={() => onClose(t.id)}
                  >
                    <HugeiconsIcon
                      icon={Cancel01Icon}
                      size={13}
                      strokeWidth={1.75}
                    />
                    <span className="flex-1">Close</span>
                  </ContextMenuItem>
                </>
              )}
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderGroup = (item: GroupItem, start: number): ReactNode => {
    const { group, members } = item;
    const color = groupColor(group.color);
    return (
      <div
        className="flex shrink-0 items-center gap-0.5"
        // A background, not a border or a positioned child: the line must not
        // change the strip's height or become the tabs' offsetParent, which
        // would throw the active-tab pill off.
        style={
          group.collapsed
            ? undefined
            : {
                backgroundImage: `linear-gradient(${color}, ${color})`,
                backgroundSize: "calc(100% - 8px) 2px",
                backgroundPosition: "center bottom",
                backgroundRepeat: "no-repeat",
              }
        }
      >
        <TabGroupHeader
          item={item}
          groupProps={groupProps}
          compact={compact}
          dragging={dragging?.kind === "group" && dragging.id === group.id}
          dropHighlight={
            marker?.kind === "header" && marker.groupId === group.id
          }
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            beginPointer(e, { kind: "group", id: group.id }, false);
          }}
          onPointerMove={movePointer}
          onPointerUp={(e) => {
            const st = drag.current;
            const target = st?.target ?? null;
            if (st?.active && target?.kind === "gap") {
              groupProps.onMoveGroup(group.id, target.gap);
            } else if (st && !st.active) {
              groupProps.onToggleGroup(group.id);
            }
            endDrag(e.currentTarget);
          }}
          onPointerCancel={(e) => endDrag(e.currentTarget)}
        />
        {!group.collapsed &&
          members.map((m, j) => (
            <Fragment key={m.id}>
              {lineAt(start + 1 + j)}
              {renderTab(m)}
            </Fragment>
          ))}
      </div>
    );
  };

  let drawnCount = 0;
  const stripNodes = layout.map((item) => {
    const start = drawnCount;
    if (item.kind === "tab") {
      drawnCount += 1;
      return (
        <Fragment key={item.tab.id}>
          {lineAt(start)}
          {renderTab(item.tab)}
        </Fragment>
      );
    }
    drawnCount += item.group.collapsed ? 1 : 1 + item.members.length;
    return (
      <Fragment key={`group:${item.group.id}`}>
        {lineAt(start)}
        {renderGroup(item, start)}
      </Fragment>
    );
  });

  return (
    <div
      ref={scrollRef}
      {...{ [TAB_STRIP_ATTR]: "" }}
      data-tauri-drag-region
      className="min-w-0 shrink overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max items-center gap-0.5">
        <Tabs
          value={String(activeId)}
          onValueChange={(v) => onSelect(Number(v))}
        >
          <TabsList
            ref={listRef}
            className="relative h-7 w-max gap-0.5 bg-transparent p-0"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-1/2 h-7 rounded-md bg-foreground/[0.07] shadow-sm ring-1 ring-inset ring-foreground/[0.05]"
              style={
                pill
                  ? {
                      width: pill.width,
                      transform: `translate(${pill.left}px, -50%)`,
                      transitionProperty: pillReady
                        ? "transform, width"
                        : "none",
                      transitionDuration: "var(--dur-base)",
                      transitionTimingFunction: "var(--ease-premium)",
                    }
                  : { opacity: 0 }
              }
            />
            {stripNodes}
            {lineAt(drawnCount)}
          </TabsList>
        </Tabs>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="New tab"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="min-w-44"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem onSelect={() => onNew()}>
              <HugeiconsIcon
                icon={ComputerTerminal02Icon}
                size={14}
                strokeWidth={1.75}
              />
              <span className="flex-1">Terminal</span>
              <span className="text-xs text-muted-foreground">
                {fmtShortcut(MOD_KEY, "T")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewBlock()}>
              <HugeiconsIcon
                icon={ComputerTerminal02Icon}
                size={14}
                strokeWidth={1.75}
              />
              <span className="flex-1">Blocks</span>
              <span className="text-xs text-muted-foreground">
                {fmtShortcut(MOD_KEY, SHIFT_KEY, "T")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewPrivate()}>
              <HugeiconsIcon
                icon={IncognitoIcon}
                size={14}
                strokeWidth={1.75}
              />
              <span className="flex-1">Privacy</span>
              <span className="text-xs text-muted-foreground">
                {fmtShortcut(MOD_KEY, "R")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewEditor()}>
              <HugeiconsIcon
                icon={PencilEdit02Icon}
                size={14}
                strokeWidth={1.75}
              />
              <span className="flex-1">Editor</span>
              <span className="text-xs text-muted-foreground">
                {fmtShortcut(MOD_KEY, "E")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewPreview()}>
              <HugeiconsIcon icon={Globe02Icon} size={14} strokeWidth={1.75} />
              <span className="flex-1">Preview</span>
              <span className="text-xs text-muted-foreground">
                {fmtShortcut(MOD_KEY, "P")}
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewGitGraph()}>
              <HugeiconsIcon
                icon={GitBranchIcon}
                size={14}
                strokeWidth={1.75}
              />
              <span className="flex-1">Git Graph</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon
                  icon={ComputerTerminal02Icon}
                  size={14}
                  strokeWidth={1.75}
                />
                <span className="flex-1">SSH</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-44">
                {sshHosts.length === 0 ? (
                  <DropdownMenuItem disabled>
                    <span className="flex-1 text-muted-foreground">
                      No ~/.ssh/config hosts
                    </span>
                  </DropdownMenuItem>
                ) : (
                  sshHosts.map((h) => (
                    <DropdownMenuItem
                      key={h.host}
                      onSelect={() => onNewSsh(h.host)}
                    >
                      <span className="flex-1">{h.host}</span>
                      {(h.user || h.hostName) && (
                        <span className="text-xs text-muted-foreground">
                          {h.user ? `${h.user}@` : ""}
                          {h.hostName ?? ""}
                        </span>
                      )}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function DropIndicator({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      data-drop-marker=""
      className={cn(
        "my-0.5 w-0.5 shrink-0 self-stretch rounded-full",
        color === null && "bg-primary",
      )}
      style={color === null ? undefined : { backgroundColor: color }}
    />
  );
}

export function TabIcon({ tab }: { tab: Tab }) {
  if (tab.kind === "editor" || tab.kind === "markdown" || tab.kind === "html") {
    return (
      <FileIcon
        name={
          tab.kind === "editor" && tab.overrideLanguage
            ? `dummy.${tab.overrideLanguage}`
            : tab.title
        }
        className="size-3.5 shrink-0 object-contain"
      />
    );
  }
  if (tab.kind === "preview") {
    return (
      <HugeiconsIcon
        icon={Globe02Icon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "ai-diff") {
    return (
      <HugeiconsIcon
        icon={GitCompareIcon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "terminal" && tab.private) {
    return (
      <HugeiconsIcon
        icon={IncognitoIcon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "git-diff" || tab.kind === "git-commit-file") {
    return (
      <HugeiconsIcon
        icon={GitCompareIcon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "git-history") {
    return (
      <HugeiconsIcon
        icon={Clock01Icon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  return (
    <HugeiconsIcon
      icon={ComputerTerminal02Icon}
      size={14}
      strokeWidth={2}
      className="shrink-0"
    />
  );
}

function TabRenameInput({
  initial,
  onDraft,
  onCommit,
  onCancel,
}: {
  initial: string;
  onDraft: (value: string) => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Guards against a trailing blur re-resolving an edit that Enter/Escape
  // already finished (Escape must never commit).
  const done = useRef(false);

  useEffect(() => {
    // Focus on the next frame so it runs after the context menu restores focus
    // to its trigger when closing; a synchronous focus would be stolen.
    const raf = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };

  // explicit = the user pressed Enter, which pins even the unchanged label. A
  // plain blur with no change must not freeze the cwd-derived default into a
  // custom title.
  const commit = (value: string, explicit: boolean) => {
    if (!explicit && value.trim() === initial.trim()) finish(onCancel);
    else finish(() => onCommit(value));
  };

  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Rename tab"
      className={cn(
        "w-28 min-w-0 rounded-sm bg-background px-1 text-xs text-foreground",
        "outline-none ring-1 ring-border focus:ring-ring",
      )}
      onChange={(e) => onDraft(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit(e.currentTarget.value, true);
        else if (e.key === "Escape") finish(onCancel);
      }}
      onBlur={(e) => {
        // Switching windows/apps blurs the input; keep the edit open instead
        // of resolving it on the way out.
        if (!document.hasFocus()) return;
        commit(e.currentTarget.value, false);
      }}
    />
  );
}
