import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { WorkspaceEnv } from "@/modules/workspace";
import {
  Delete02Icon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import {
  autoSessionName,
  isValidSessionName,
  killTmuxSession,
  relativeTime,
  renameTmuxSession,
  sanitizeSessionName,
  type TmuxSession,
} from "./lib/tmux";
import { useTmuxSessions } from "./lib/useTmuxSessions";

/** Which tab/leaf the picker acts on, and which host to list. */
export type TmuxPickerTarget = {
  tabId: number;
  leafId: number;
  workspace?: WorkspaceEnv;
  /** SSH host alias, for the title; undefined for a local target. */
  host?: string;
};

type Props = {
  /** Non-null opens the picker; null closes it. */
  target: TmuxPickerTarget | null;
  onOpenChange: (open: boolean) => void;
  /** Re-attach the target tab to the chosen session, in place. */
  onAttachHere: (session: string) => void;
  /** Open the chosen session in its own new tab on the same host. */
  onOpenInNewTab: (session: string) => void;
};

const isMac =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
const MOD = isMac ? "Cmd" : "Ctrl";

export function TmuxSessionSwitcher({
  target,
  onOpenChange,
  onAttachHere,
  onOpenInNewTab,
}: Props) {
  const open = target !== null;
  const workspace = target?.workspace;
  const host = target?.host;

  const sessions = useTmuxSessions((s) => s.sessions);
  const loading = useTmuxSessions((s) => s.loading);
  const error = useTmuxSessions((s) => s.error);
  const refresh = useTmuxSessions((s) => s.refresh);

  const [query, setQuery] = useState("");

  // Refresh on every open so the list reflects the host's current state.
  useEffect(() => {
    if (open) void refresh(workspace);
  }, [open, workspace, refresh]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const attachHere = (name: string) => {
    onAttachHere(name);
    onOpenChange(false);
  };
  const openInNewTab = (name: string) => {
    onOpenInNewTab(name);
    onOpenChange(false);
  };
  const killSession = (name: string) => {
    // Kill, then refresh either way: on success the row disappears, on failure
    // it stays so the user can retry. The modal stays open.
    void killTmuxSession(workspace, name)
      .catch((e) => console.error("[terax] tmux kill failed:", e))
      .finally(() => void refresh(workspace));
  };
  const renameSession = (from: string, to: string) => {
    void renameTmuxSession(workspace, from, to)
      .catch((e) => console.error("[terax] tmux rename failed:", e))
      .finally(() => void refresh(workspace));
  };

  // Attached first, then most-recently-attached (desc, never-attached last).
  const sorted = useMemo(() => {
    return [...sessions].sort((a, b) => {
      if (a.attached !== b.attached) return a.attached ? -1 : 1;
      return (b.lastAttached ?? -1) - (a.lastAttached ?? -1);
    });
  }, [sessions]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? sorted.filter((s) => s.name.toLowerCase().includes(q)) : sorted),
    [sorted, q],
  );

  const newName =
    sanitizeSessionName(query) || autoSessionName(sessions.map((s) => s.name));
  const canCreate = isValidSessionName(newName);

  // Cmd/Ctrl+Enter opens the highlighted session in a NEW tab instead of
  // attaching here. cmdk marks the active item with aria-selected; we stash the
  // session name on a data attribute (cmdk lowercases its own value).
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      const el = document.querySelector<HTMLElement>(
        '[cmdk-item][aria-selected="true"]',
      );
      const name = el?.getAttribute("data-tmux-session");
      if (name && el?.getAttribute("data-disabled") !== "true") {
        openInNewTab(name);
      }
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="tmux sessions"
      description="Attach, switch, or create a tmux session."
      className="w-[min(560px,calc(100vw-32px))]"
    >
      <Command shouldFilter={false} loop>
        <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
          <span className="text-xs font-medium text-muted-foreground">
            {host ? `tmux on ${host}` : "tmux sessions"}
          </span>
          <button
            type="button"
            onClick={() => void refresh(workspace)}
            className="text-[11px] text-muted-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
          >
            Refresh
          </button>
        </div>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          onKeyDown={onInputKeyDown}
          placeholder="Filter or name a session..."
          autoFocus
        />
        <ScrollArea className="max-h-[360px]">
          <CommandList className="max-h-none overflow-visible">
            {error ? (
              <StatusRow label={error} tone="error" />
            ) : loading && sessions.length === 0 ? (
              <StatusRow label="Loading sessions..." />
            ) : (
              <>
                <CommandGroup heading="Sessions">
                  {filtered.length === 0 ? (
                    <StatusRow
                      label={
                        sessions.length === 0
                          ? "No sessions on this host yet"
                          : "No match"
                      }
                    />
                  ) : (
                    filtered.map((s) => (
                      <SessionItem
                        key={s.name}
                        session={s}
                        onAttach={() => attachHere(s.name)}
                        onKill={() => killSession(s.name)}
                        onRename={(to) => renameSession(s.name, to)}
                      />
                    ))
                  )}
                </CommandGroup>
                <CommandGroup heading="Create">
                  <CommandItem
                    value={`__create__:${newName}`}
                    data-tmux-session={canCreate ? newName : undefined}
                    disabled={!canCreate}
                    onSelect={() => canCreate && attachHere(newName)}
                    className="text-[12.5px]"
                  >
                    <HugeiconsIcon
                      icon={PlusSignIcon}
                      size={14}
                      strokeWidth={1.75}
                      className="text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {query.trim() ? (
                        <>
                          Create{" "}
                          <span className="font-medium text-foreground">
                            {newName}
                          </span>
                        </>
                      ) : (
                        "New session (auto)"
                      )}
                    </span>
                    <CommandShortcut className="normal-case tracking-normal">
                      attach
                    </CommandShortcut>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </ScrollArea>
        <div className="flex items-center justify-between border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground/70">
          <span className="flex items-center gap-1.5">
            <Kbd>Enter</Kbd> attach here
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>{MOD}+Enter</Kbd> new tab
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}

function SessionItem({
  session,
  onAttach,
  onKill,
  onRename,
}: {
  session: TmuxSession;
  onAttach: () => void;
  onKill: () => void;
  onRename: (to: string) => void;
}) {
  const disabled = !session.attachable;
  const rel = relativeTime(session.lastAttached);
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(session.name);

  // The armed "Kill?" state disarms itself so it can't linger unnoticed.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

  const onKillClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirming) {
      setConfirming(false);
      onKill();
    } else {
      setConfirming(true);
    }
  };

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDraft(session.name);
    setRenaming(true);
  };
  const commitRename = () => {
    const to = sanitizeSessionName(draft);
    setRenaming(false);
    if (to && to !== session.name && isValidSessionName(to)) onRename(to);
  };

  return (
    <CommandItem
      value={session.name}
      data-tmux-session={disabled ? undefined : session.name}
      disabled={disabled}
      // While renaming, the inline input owns the keys; don't attach on Enter.
      onSelect={renaming ? () => {} : onAttach}
      title={
        disabled
          ? "This name has characters Terax cannot safely attach. Rename it in tmux."
          : `Attach ${session.name} in this tab`
      }
      className="group text-[12.5px]"
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          session.attached ? "bg-primary" : "bg-muted-foreground/30",
        )}
      />
      {renaming ? (
        // biome-ignore lint/a11y/noAutofocus: focusing the rename field is the point
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPointerDown={stop}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setRenaming(false);
            }
          }}
          onBlur={() => setRenaming(false)}
          className="h-6 min-w-0 flex-1 rounded border border-border/70 bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{session.name}</span>
          <CommandShortcut className="normal-case tracking-normal tabular-nums">
            {session.windows} {session.windows === 1 ? "window" : "windows"}
            {session.attached ? " · live" : ""}
            {rel ? ` · ${rel}` : ""}
          </CommandShortcut>
          {!disabled && (
            <span className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                tabIndex={-1}
                onPointerDown={stop}
                onClick={startRename}
                title={`Rename ${session.name}`}
                aria-label={`Rename ${session.name}`}
                className="rounded p-0.5 text-muted-foreground/55 opacity-0 outline-none transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-data-[selected=true]:opacity-100"
              >
                <HugeiconsIcon
                  icon={PencilEdit02Icon}
                  size={13}
                  strokeWidth={1.75}
                />
              </button>
              <button
                type="button"
                tabIndex={-1}
                onPointerDown={stop}
                onClick={onKillClick}
                title={
                  confirming
                    ? `Confirm: kill ${session.name} and all its processes`
                    : `Kill ${session.name}`
                }
                aria-label={`Kill ${session.name}`}
                className={cn(
                  "rounded outline-none transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 group-data-[selected=true]:opacity-100",
                  confirming
                    ? "px-1.5 py-0.5 text-[10px] font-medium text-destructive opacity-100"
                    : "p-0.5 text-muted-foreground/55 opacity-0",
                )}
              >
                {confirming ? (
                  "Kill?"
                ) : (
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    size={13}
                    strokeWidth={1.75}
                  />
                )}
              </button>
            </span>
          )}
        </>
      )}
    </CommandItem>
  );
}

function StatusRow({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={cn(
        "px-3 py-6 text-center text-xs leading-relaxed",
        tone === "error" ? "text-destructive/80" : "text-muted-foreground/60",
      )}
    >
      {label}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}
