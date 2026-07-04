import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
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
import type { AgentSession, AgentStatus } from "../lib/types";
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

// Empty-session sentinel returned by the store selector while the modal is
// closed: a stable reference so zustand skips the re-render (and the row
// rebuild) that constant agent status churn would otherwise trigger off-screen.
const NO_SESSIONS: Record<number, AgentSession> = {};

function elapsed(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/** Right-hand meta of a row. The status GROUP already names the state, so the
 *  row only carries the liveness cue (spinner / pulse) and the time in that
 *  state — no repeated status word. */
function StatusMeta({
  status,
  elapsed,
}: {
  status: AgentStatus;
  elapsed: string | null;
}) {
  if (status === "working") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
        <HugeiconsIcon
          icon={Loading03Icon}
          size={12}
          className="animate-spin text-primary"
        />
        {elapsed}
      </span>
    );
  }
  if (status === "waiting") {
    return (
      <span className="flex items-center gap-1.5 text-[11px] font-medium tabular-nums text-primary">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" />
        {elapsed}
      </span>
    );
  }
  return (
    <span className="text-[11px] tabular-nums text-muted-foreground/60">
      {elapsed}
    </span>
  );
}

function subtitle(row: AgentRow): string {
  // "where does this agent live": host, tmux session, cwd basename — but
  // never repeat what the title already says, so a local tab titled by its
  // cwd doesn't render "trade-insight / trade-insight".
  const parts: string[] = [];
  if (row.host) parts.push(row.host);
  if (row.session && row.session !== row.title) parts.push(row.session);
  if (row.cwd) {
    const base = row.cwd.split(/[\\/]/).filter(Boolean).pop();
    if (base && base !== row.session && base !== row.title) parts.push(base);
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
    <CommandItem
      value={row.key}
      onSelect={onRun}
      title={row.tabId !== null ? `Jump to ${row.title}` : undefined}
      className="group gap-2 text-[12.5px]"
    >
      <AgentIcon agent={row.agent} size={15} className="shrink-0" />
      <span className="shrink-0 truncate text-foreground">{row.title}</span>
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground/70">
        {displayAgent(row.agent)}
        {sub ? ` · ${sub}` : ""}
      </span>
      <StatusMeta
        status={row.status}
        elapsed={
          row.startedAt > 0
            ? elapsed(row.attentionSince ?? row.startedAt, now)
            : null
        }
      />
    </CommandItem>
  );
}

// Group order mirrors the row sort: the bucket the user most likely came for
// sits on top.
const GROUPS: Array<{ status: AgentStatus; heading: string }> = [
  { status: "waiting", heading: "Needs input" },
  { status: "working", heading: "Working" },
  { status: "idle", heading: "Idle" },
];

export function AgentMissionControl({
  open,
  onOpenChange,
  tabs,
  onActivate,
  onActivateLocal,
}: Props) {
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => Date.now());
  // Only track the store while open: closed, the selectors return stable
  // constants so agent status churn does not re-render or rebuild rows.
  const sessions = useAgentStore((s) => (open ? s.sessions : NO_SESSIONS));
  const localAgent = useAgentStore((s) => (open ? s.localAgent : null));

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
    // Close first, then jump on the next tick: activating synchronously fights
    // the dialog's close-time focus restore and the jump target loses focus.
    onOpenChange(false);
    const jump =
      row.kind === "local"
        ? onActivateLocal
        : row.tabId !== null && row.leafId !== null
          ? () => onActivate(row.tabId as number, row.leafId as number)
          : null;
    if (jump) window.setTimeout(jump, 0);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Agent mission control"
      description="Jump to any running agent."
      className="w-[min(560px,calc(100vw-32px))]"
    >
      <Command shouldFilter={false} loop>
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-xs font-medium text-muted-foreground">
            {rows.length === 1 ? "1 agent" : `${rows.length} agents`}
          </span>
          {waitingCount > 0 ? (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              {waitingCount} need{waitingCount === 1 ? "s" : ""} input
            </span>
          ) : null}
        </div>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Filter by name, host, or path..."
          autoFocus
        />
        <ScrollArea className="max-h-[360px]">
          <CommandList className="max-h-none overflow-visible">
            <CommandEmpty className="px-3 py-8 text-center text-xs text-muted-foreground">
              {rows.length === 0
                ? "No running agents. Start a coding agent to track it here."
                : "No agents match your filter."}
            </CommandEmpty>
            {GROUPS.map(({ status, heading }) => {
              const group = filtered.filter((r) => r.status === status);
              if (group.length === 0) return null;
              return (
                <CommandGroup key={status} heading={heading}>
                  {group.map((row) => (
                    <AgentRowItem
                      key={row.key}
                      row={row}
                      now={now}
                      onRun={() => run(row)}
                    />
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </ScrollArea>
        <div className="flex items-center justify-between border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground/70">
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> jump to agent
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>{MOD}+Shift+A</Kbd> next waiting
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}

const isMac =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
const MOD = isMac ? "Cmd" : "Ctrl";

// Mirrors the tmux switcher's Kbd so the two pickers read as one family.
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}
