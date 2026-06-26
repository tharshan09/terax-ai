import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  resetStatusbarLayout,
  setStatusbarLayout,
} from "@/modules/settings/store";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  GripVerticalIcon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { useRef, useState } from "react";
import {
  moveWidget,
  moveWidgetByDelta,
  setWidgetVisible,
  STATUSBAR_WIDGET_LABELS,
  type StatusbarLayout,
  type StatusbarWidgetId,
} from "./layout";

export function StatusbarConfig() {
  const layout = usePreferencesStore((s) => s.statusbarLayout);
  const [open, setOpen] = useState(false);
  // Live drag preview without writing to the store on every dragenter.
  const [draft, setDraft] = useState<StatusbarLayout | null>(null);
  const dragId = useRef<StatusbarWidgetId | null>(null);
  // null = not yet loaded; reflects whether our statusLine wrapper is installed.
  const [statsEnabled, setStatsEnabled] = useState<boolean | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);

  const view = draft ?? layout;

  const onToggleStats = async (next: boolean) => {
    setStatsBusy(true);
    try {
      await invoke(
        next ? "claude_enable_statusline" : "claude_disable_statusline",
      );
    } catch {
      // Re-read the real state below rather than trusting the optimistic value.
    }
    try {
      setStatsEnabled(await invoke<boolean>("claude_statusline_enabled"));
    } catch {
      setStatsEnabled(next);
    }
    setStatsBusy(false);
  };

  const onDragEnter = (overId: StatusbarWidgetId) => {
    const from = dragId.current;
    if (!from || from === overId) return;
    setDraft(moveWidget(view, from, overId));
  };

  const onDragEnd = () => {
    if (draft) void setStatusbarLayout(draft);
    setDraft(null);
    dragId.current = null;
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          void invoke<boolean>("claude_statusline_enabled")
            .then(setStatsEnabled)
            .catch(() => setStatsEnabled(false));
        } else {
          setDraft(null);
          dragId.current = null;
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Customize status bar"
              aria-label="Customize status bar"
              className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground"
            >
              <HugeiconsIcon
                icon={SlidersHorizontalIcon}
                size={14}
                strokeWidth={1.75}
              />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">Customize status bar</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-64 gap-2 p-2"
      >
        <PopoverHeader className="px-1.5 pt-1">
          <PopoverTitle className="text-sm">Status bar</PopoverTitle>
        </PopoverHeader>
        <ul className="flex list-none flex-col">
          {view.map((item, index) => (
            <ConfigRow
              key={item.id}
              id={item.id}
              visible={item.visible}
              first={index === 0}
              last={index === view.length - 1}
              onDragStart={() => {
                dragId.current = item.id;
              }}
              onDragEnter={() => onDragEnter(item.id)}
              onDragEnd={onDragEnd}
              onMove={(delta) =>
                void setStatusbarLayout(
                  moveWidgetByDelta(layout, item.id, delta),
                )
              }
              onToggle={(next) =>
                void setStatusbarLayout(setWidgetVisible(layout, item.id, next))
              }
            />
          ))}
        </ul>
        <Separator />
        <div className="flex items-start gap-2 px-1.5 py-1">
          <div className="min-w-0 flex-1">
            <div className="text-[12px]">Claude Code stats</div>
            <p className="text-[10.5px] leading-snug text-muted-foreground">
              Model, context and cost for the active tab. Adds a statusLine
              wrapper to ~/.claude/settings.json.
            </p>
          </div>
          <Switch
            size="sm"
            checked={statsEnabled === true}
            disabled={statsEnabled === null || statsBusy}
            onCheckedChange={(next) => void onToggleStats(next)}
            aria-label="Toggle Claude Code stats"
            className="mt-0.5"
          />
        </div>
        <Separator />
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            dragId.current = null;
            void resetStatusbarLayout();
          }}
          className="mx-1 cursor-pointer rounded-sm px-1.5 py-1 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Reset to defaults
        </button>
      </PopoverContent>
    </Popover>
  );
}

type ConfigRowProps = {
  id: StatusbarWidgetId;
  visible: boolean;
  first: boolean;
  last: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onMove: (delta: number) => void;
  onToggle: (next: boolean) => void;
};

function ConfigRow({
  id,
  visible,
  first,
  last,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onMove,
  onToggle,
}: ConfigRowProps) {
  const label = STATUSBAR_WIDGET_LABELS[id];
  return (
    <li
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      className="flex items-center gap-1 rounded-md px-1 py-1 hover:bg-accent/40"
    >
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        aria-label={`Reorder ${label}`}
        title="Drag to reorder"
        className="flex size-5 cursor-grab items-center justify-center text-muted-foreground/70 hover:text-foreground active:cursor-grabbing"
      >
        <HugeiconsIcon icon={GripVerticalIcon} size={14} strokeWidth={1.75} />
      </button>
      <span className="flex-1 truncate text-[12px]">{label}</span>
      <button
        type="button"
        onClick={() => onMove(-1)}
        disabled={first}
        aria-label={`Move ${label} left`}
        className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <HugeiconsIcon icon={ArrowUp01Icon} size={13} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={() => onMove(1)}
        disabled={last}
        aria-label={`Move ${label} right`}
        className="flex size-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={1.75} />
      </button>
      <Switch
        size="sm"
        checked={visible}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${label}`}
        className="ml-1"
      />
    </li>
  );
}
