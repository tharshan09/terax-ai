import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Tab } from "@/modules/tabs";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { AgentIcon } from "../lib/agentIcon";
import { displayAgent } from "../lib/format";
import {
  type AgentRow,
  buildAgentRows,
  filterAgentRows,
} from "../lib/missionControl";
import type { AgentStatus } from "../lib/types";
import { useAgentStore } from "../store/agentStore";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabs: Tab[];
  onActivate: (tabId: number, leafId: number) => void;
  onActivateLocal: () => void;
};

// Refresh cadence for the elapsed clock while the overview is open. Only runs
// when open, so it costs nothing otherwise.
const TICK_MS = 1000;

function elapsed(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  waiting: "needs input",
  working: "working",
  idle: "idle",
};

function StatusBadge({ status }: { status: AgentStatus }) {
  if (status === "working") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={12}
          className="animate-spin text-primary"
        />
        {STATUS_LABEL.working}
      </span>
    );
  }
  if (status === "waiting") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        {STATUS_LABEL.waiting}
      </span>
    );
  }
  return (
    <span className="text-[11px] text-muted-foreground/70">
      {STATUS_LABEL.idle}
    </span>
  );
}

function subtitle(row: AgentRow): string {
  // host · session · cwd basename — the "where does this agent live" context.
  const parts: string[] = [];
  if (row.host) parts.push(row.host);
  if (row.session) parts.push(row.session);
  if (row.cwd) {
    const base = row.cwd.split(/[\\/]/).filter(Boolean).pop();
    if (base && base !== row.session) parts.push(base);
  }
  return parts.join("  ·  ");
}

function AgentRowItem({
  row,
  now,
  onRun,
}: {
  row: AgentRow;
  now: number;
  onRun: () => void;
}) {
  const sub = subtitle(row);
  return (
    <CommandItem value={row.key} onSelect={onRun} className="gap-2.5 py-2">
      <AgentIcon agent={row.agent} size={16} className="shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] text-foreground">
            {row.title}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground/70">
            {displayAgent(row.agent)}
          </span>
        </div>
        {sub ? (
          <span className="truncate text-[11px] text-muted-foreground">
            {sub}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <StatusBadge status={row.status} />
        {row.startedAt > 0 ? (
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            {elapsed(row.attentionSince ?? row.startedAt, now)}
          </span>
        ) : null}
      </div>
    </CommandItem>
  );
}

export function AgentMissionControl({
  open,
  onOpenChange,
  tabs,
  onActivate,
  onActivateLocal,
}: Props) {
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const sessions = useAgentStore((s) => s.sessions);
  const localAgent = useAgentStore((s) => s.localAgent);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [open]);

  const rows = useMemo(
    () => buildAgentRows(sessions, localAgent, tabs),
    [sessions, localAgent, tabs],
  );
  const filtered = useMemo(() => filterAgentRows(rows, query), [rows, query]);
  const waitingCount = rows.filter((r) => r.status === "waiting").length;

  const run = (row: AgentRow) => {
    onOpenChange(false);
    if (row.kind === "local") onActivateLocal();
    else if (row.tabId !== null && row.leafId !== null) {
      onActivate(row.tabId, row.leafId);
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Agent mission control"
      description="Jump to any running agent."
      className="top-1/2 w-[min(640px,calc(100vw-32px))] -translate-y-1/2"
    >
      <Command shouldFilter={false} loop>
        <div className="flex items-center gap-2 px-3 pt-2.5 pb-0.5">
          <span className="text-[13px] text-foreground">Agents</span>
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {rows.length}
          </span>
          {waitingCount > 0 ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              {waitingCount} waiting
            </span>
          ) : null}
        </div>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Filter agents by name, host, session, path..."
          autoFocus
        />
        <ScrollArea className="max-h-[420px]">
          <CommandList className="max-h-none overflow-visible pr-2">
            <CommandEmpty className="px-3 py-8 text-center text-xs text-muted-foreground">
              {rows.length === 0
                ? "No running agents. Start a coding agent to track it here."
                : "No agents match your filter."}
            </CommandEmpty>
            {filtered.map((row) => (
              <AgentRowItem
                key={row.key}
                row={row}
                now={now}
                onRun={() => run(row)}
              />
            ))}
          </CommandList>
        </ScrollArea>
      </Command>
    </CommandDialog>
  );
}
