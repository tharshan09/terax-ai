import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { InlineRename } from "@/modules/spaces/components/InlineRename";
import { SpaceAvatar } from "@/modules/spaces/SpaceAvatar";
import { SPACE_COLORS } from "@/modules/spaces/lib/spaceColor";
import { useSpaces } from "@/modules/spaces/lib/useSpaces";
import { leafIds } from "@/modules/terminal/lib/panes";
import {
  ArrowMoveUpRightIcon,
  Cancel01Icon,
  PaintBoardIcon,
  PencilEdit02Icon,
  Unlink01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type PointerEvent, useMemo } from "react";
import { groupAggregateStatus } from "./lib/selectTabAgentStatus";
import { GROUP_NAME_MAX, type StripItem } from "./lib/tabGroups";
import { GROUP_COLLAPSED_ATTR, GROUP_HEADER_ATTR } from "./lib/tabStripGap";
import type { Tab } from "./lib/useTabs";
import { AgentStatusBadge } from "./TabActivityIndicator";
import type { TabBarGroupProps } from "./TabBar";

type GroupItem = Extract<StripItem, { kind: "group" }>;

type PointerHandler = (e: PointerEvent<HTMLElement>) => void;

type Props = {
  item: GroupItem;
  groupProps: TabBarGroupProps;
  dragging: boolean;
  dropHighlight: boolean;
  compact?: boolean;
  onPointerDown: PointerHandler;
  onPointerMove: PointerHandler;
  onPointerUp: PointerHandler;
  onPointerCancel: PointerHandler;
};

const COLOR_NAMES = [
  "Blue",
  "Violet",
  "Emerald",
  "Amber",
  "Rose",
  "Cyan",
  "Orange",
  "Pink",
] as const;

const MENU_ITEM = "gap-2 rounded-xl px-2.5 py-1.5 text-[13px]";

export function groupColor(color: number): string {
  return SPACE_COLORS[color] ?? SPACE_COLORS[0];
}

export function groupDisplayName(name: string): string {
  return name || "Unnamed group";
}

function tabCountLabel(count: number): string {
  return count === 1 ? "1 tab" : `${count} tabs`;
}

export function TabGroupHeader({
  item,
  groupProps,
  dragging,
  dropHighlight,
  compact,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: Props) {
  const { group, members, count } = item;
  const renaming = groupProps.renamingGroupId === group.id;
  const color = groupColor(group.color);
  const tooltip = group.name
    ? `${group.name} · ${tabCountLabel(count)}`
    : tabCountLabel(count);

  const chrome = {
    [GROUP_HEADER_ATTR]: group.id,
    ...(group.collapsed ? { [GROUP_COLLAPSED_ATTR]: "" } : {}),
    className: cn(
      "relative z-[1] flex h-7 shrink-0 select-none items-center gap-1.5 rounded-md text-xs font-medium text-foreground/85 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40",
      compact ? "px-1.5" : "px-2",
      !renaming && "cursor-pointer",
      dragging && "opacity-50",
    ),
    style: {
      backgroundColor: `color-mix(in oklch, ${color} ${dropHighlight ? 28 : 14}%, transparent)`,
      boxShadow: dropHighlight
        ? `inset 0 0 0 1px color-mix(in oklch, ${color} 70%, transparent)`
        : undefined,
    },
  };

  const content = (
    <>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {renaming ? (
        <InlineRename
          initial={group.name}
          label="Rename group"
          maxLength={GROUP_NAME_MAX}
          className="w-28 px-1 py-0"
          onCommit={(value) => {
            groupProps.onRenameGroup(group.id, value);
            groupProps.onRenamingGroupChange(null);
          }}
          onCancel={() => groupProps.onRenamingGroupChange(null)}
        />
      ) : (
        group.name && (
          <span className={cn("truncate", compact ? "max-w-24" : "max-w-40")}>
            {group.name}
          </span>
        )
      )}
      {group.collapsed && (
        <>
          <span className="shrink-0 rounded-sm bg-foreground/[0.08] px-1 text-[10px] leading-4 tabular-nums text-muted-foreground">
            {count}
          </span>
          <GroupAggregateIndicator members={members} />
        </>
      )}
    </>
  );

  // While renaming, a plain cell without role=button and the toggle and drag
  // handlers, so clicks and keys belong to the field.
  const header = renaming ? (
    <div {...chrome}>{content}</div>
  ) : (
    // biome-ignore lint/a11y/useSemanticElements: the same cell hosts the rename input, which must never sit in a <button>
    <div
      {...chrome}
      role="button"
      tabIndex={0}
      aria-expanded={!group.collapsed}
      aria-label={tooltip}
      title={tooltip}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onMouseDown={(e) => {
        if (e.button === 0) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          groupProps.onToggleGroup(group.id);
        }
      }}
    >
      {content}
    </div>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={renaming}>
        {header}
      </ContextMenuTrigger>
      <ContextMenuContent
        className="min-w-40 p-1"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <ContextMenuItem
          className={MENU_ITEM}
          onSelect={() => groupProps.onRenamingGroupChange(group.id)}
        >
          <HugeiconsIcon icon={PencilEdit02Icon} size={13} strokeWidth={1.75} />
          <span className="flex-1">Rename group</span>
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger className={MENU_ITEM}>
            <HugeiconsIcon icon={PaintBoardIcon} size={13} strokeWidth={1.75} />
            <span className="flex-1">Change color</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="p-1.5">
            <ContextMenuRadioGroup
              value={String(group.color)}
              onValueChange={(v) =>
                groupProps.onSetGroupColor(group.id, Number(v))
              }
              className="flex gap-0.5"
            >
              {SPACE_COLORS.map((c, i) => (
                <ContextMenuRadioItem
                  key={c}
                  value={String(i)}
                  aria-label={COLOR_NAMES[i]}
                  className="size-7 justify-center rounded-full p-0 data-[state=checked]:bg-accent [&>span:first-child]:hidden"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-3 rounded-full",
                      i === group.color &&
                        "ring-2 ring-foreground/60 ring-offset-1 ring-offset-popover",
                    )}
                    style={{ backgroundColor: c }}
                  />
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem
          className={MENU_ITEM}
          onSelect={() => groupProps.onUngroup(group.id)}
        >
          <HugeiconsIcon icon={Unlink01Icon} size={13} strokeWidth={1.75} />
          <span className="flex-1">Ungroup</span>
        </ContextMenuItem>
        <MoveToSpaceSub
          spaceId={group.spaceId}
          onMove={(spaceId) => groupProps.onMoveGroupToSpace(group.id, spaceId)}
        />
        <ContextMenuSeparator />
        <ContextMenuItem
          className={MENU_ITEM}
          onSelect={() => groupProps.onCloseGroup(group.id)}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.75} />
          <span className="flex-1">Close group</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Mounted only while the menu is open, so the strip does not subscribe every
 *  header to the space list. */
function MoveToSpaceSub({
  spaceId,
  onMove,
}: {
  spaceId: string;
  onMove: (spaceId: string) => void;
}) {
  const spaces = useSpaces((s) => s.spaces);
  const others = spaces.filter((s) => s.id !== spaceId);
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger
        className={MENU_ITEM}
        disabled={others.length === 0}
      >
        <HugeiconsIcon
          icon={ArrowMoveUpRightIcon}
          size={13}
          strokeWidth={1.75}
        />
        <span className="flex-1">Move group to space</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="min-w-40 p-1">
        {others.map((s) => (
          <ContextMenuItem
            key={s.id}
            className={MENU_ITEM}
            onSelect={() => onMove(s.id)}
          >
            <SpaceAvatar space={s} size="sm" />
            <span className="flex-1 truncate">{s.name}</span>
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

/** Only collapsed headers mount this, so an expanded group never reads the
 *  agent store. The member walk reruns on membership changes, not on store
 *  changes, and the primitive result keeps unrelated sessions from re-rendering. */
function GroupAggregateIndicator({ members }: { members: Tab[] }) {
  const ids = useMemo(() => {
    const out: number[] = [];
    for (const t of members) {
      if (t.kind === "terminal")
        for (const id of leafIds(t.paneTree)) out.push(id);
    }
    return out;
  }, [members]);
  const status = useAgentStore((s) => groupAggregateStatus(s.sessions, ids));
  return <AgentStatusBadge status={status} />;
}
