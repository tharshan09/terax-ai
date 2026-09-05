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
import { isManagedSession, newSessionNameError } from "./lib/managedTmux";
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
  /** A session was renamed on the host (only fires on success), so the caller
   *  can keep a tab bound to the old name in sync. */
  onRenamed?: (from: string, to: string) => void;
};

const isMac =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
const MOD = isMac ? "Cmd" : "Ctrl";

export function TmuxSessionSwitcher({
  target,
  onOpenChange,
  onAttachHere,
  onOpenInNewTab,
  onRenamed,
}: Props) {
  const open = target !== null;
  const workspace = target?.workspace;
  const host = target?.host;

  const sessions = useTmuxSessions((s) => s.sessions);
  const loading = useTmuxSessions((s) => s.loading);
  const error = useTmuxSessions((s) => s.error);
  const refresh = useTmuxSessions((s) => s.refresh);

  const [query, setQuery] = useState("");
  /** Non-null while the picker asks what to call a session it is about to
   *  create, and remembers which action asked. */
  const [naming, setNaming] = useState<{
    name: string;
    mode: "here" | "newTab";
  } | null>(null);

  // Refresh on every open so the list reflects the host's current state.
  useEffect(() => {
    if (open) void refresh(workspace);
  }, [open, workspace, refresh]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setNaming(null);
    }
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
    // The terax-rs- prefix is reserved: renaming a user session INTO it would
    // hand the session to the managed-session cleanup (boot reaper, tab-close
    // kill).
    if (isManagedSession(to)) return;
    void renameTmuxSession(workspace, from, to)
      .then(() => onRenamed?.(from, to))
      .catch((e) => console.error("[terax] tmux rename failed:", e))
      .finally(() => void refresh(workspace));
  };

  // Attached first, then most-recently-attached (desc, never-attached last).
  // Managed restart-safe sessions are plumbing behind their own tab, not
  // something to attach twice; they never clutter the picker.
  const sorted = useMemo(() => {
    return sessions
      .filter((s) => !isManagedSession(s.name))
      .sort((a, b) => {
        if (a.attached !== b.attached) return a.attached ? -1 : 1;
        return (b.lastAttached ?? -1) - (a.lastAttached ?? -1);
      });
  }, [sessions]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? sorted.filter((s) => s.name.toLowerCase().includes(q)) : sorted),
    [sorted, q],
  );

  // What the filter yields as a name, if anything: "///" sanitizes away, so
  // it is a filter and not a name. Both the row's wording and whether
  // creating asks for a name key on this, so the two cannot disagree.
  const typedName = sanitizeSessionName(query);
  const newName = typedName || autoSessionName(sessions.map((s) => s.name));
  // The reserved prefix also blocks CREATE, so a user session can never be
  // mistaken for (and reaped as) a managed one.
  const canCreate = isValidSessionName(newName) && !isManagedSession(newName);

  // A typed name is already a decision, so Enter creates it straight away.
  // Without one we would silently invent s1, s2, ... and leave the user to
  // rename it afterwards; ask for the name instead, prefilled with that same
  // default so Enter still gets them a session in one keystroke.
  const startCreate = (mode: "here" | "newTab") => {
    if (!canCreate) return;
    if (typedName) {
      if (mode === "here") attachHere(newName);
      else openInNewTab(newName);
      return;
    }
    setNaming({ name: newName, mode });
  };

  const commitNewName = (name: string) => {
    if (naming?.mode === "newTab") openInNewTab(name);
    else attachHere(name);
  };

  // Cmd/Ctrl+Enter opens the highlighted session in a NEW tab instead of
  // attaching here. cmdk marks the active item with aria-selected; we stash the
  // session name on a data attribute (cmdk lowercases its own value).
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      const el = document.querySelector<HTMLElement>(
        '[cmdk-item][aria-selected="true"]',
      );
      if (el?.getAttribute("data-disabled") === "true") return;
      if (el?.getAttribute("data-tmux-create") === "true") {
        startCreate("newTab");
        return;
      }
      const name = el?.getAttribute("data-tmux-session");
      if (name) openInNewTab(name);
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      onEscapeKeyDown={(e) => {
        // Radix dismisses on a document capture listener, so a field inside
        // the dialog never sees Escape first. While one has focus it owns the
        // key: leaving the naming step or an inline rename must not also tear
        // down the picker. The filter input is not a field in that sense, so
        // Escape there still closes, as before.
        const el = document.activeElement;
        if (
          el instanceof HTMLInputElement &&
          el.dataset.slot !== "command-input"
        ) {
          e.preventDefault();
        }
      }}
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
        {naming ? (
          <NewSessionName
            initial={naming.name}
            host={host}
            mode={naming.mode}
            existing={sessions.map((x) => x.name)}
            onCancel={() => setNaming(null)}
            onConfirm={commitNewName}
          />
        ) : (
          <>
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
                        data-tmux-create="true"
                        disabled={!canCreate}
                        onSelect={() => startCreate("here")}
                        className="text-[12.5px]"
                      >
                        <HugeiconsIcon
                          icon={PlusSignIcon}
                          size={14}
                          strokeWidth={1.75}
                          className="text-muted-foreground"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {typedName ? (
                            <>
                              Create{" "}
                              <span className="font-medium text-foreground">
                                {newName}
                              </span>
                            </>
                          ) : (
                            "New session..."
                          )}
                        </span>
                        <CommandShortcut className="normal-case tracking-normal">
                          {typedName ? "attach" : "name it"}
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
          </>
        )}
      </Command>
    </CommandDialog>
  );
}

/** Asks what to call a session about to be created, prefilled with the name the
 *  picker would have invented. The field starts selected, so Enter takes the
 *  default and typing replaces it: naming costs nothing, but is finally
 *  possible before the session exists rather than only as a rename after. */
function NewSessionName({
  initial,
  host,
  mode,
  existing,
  onCancel,
  onConfirm,
}: {
  initial: string;
  host?: string;
  mode: "here" | "newTab";
  existing: string[];
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const name = sanitizeSessionName(draft);
  const error = newSessionNameError(draft);
  // `tmux new-session -A` attaches when the name is taken. That is a fine
  // outcome, but not what a panel headed "Create" implies, so say so rather
  // than dropping the user into someone else's running work unannounced.
  const taken = !error && existing.includes(name);

  const commit = () => {
    if (!error) onConfirm(name);
  };

  return (
    <div className="px-3 pb-3">
      <label
        htmlFor="terax-new-tmux-session"
        className="mb-1.5 block text-[11px] font-medium text-muted-foreground"
      >
        Name the new session{host ? ` on ${host}` : ""}
      </label>
      <input
        id="terax-new-tmux-session"
        // biome-ignore lint/a11y/noAutofocus: naming the session is the step
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          // cmdk owns these keys for the list; here the field does.
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        className="h-8 w-full rounded border border-border/70 bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      />
      <p
        className={cn(
          "mt-1.5 text-[11px]",
          error ? "text-destructive/80" : "text-muted-foreground/70",
        )}
      >
        {error ??
          (taken
            ? `${name} already exists. This attaches to it${
                mode === "newTab" ? " in a new tab" : ""
              }.`
            : mode === "newTab"
              ? `Opens ${name} in a new tab.`
              : `Opens ${name} in this tab.`)}
      </p>
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-2 py-1 text-[12px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground"
        >
          Back
        </button>
        <button
          type="button"
          onClick={commit}
          disabled={error !== null}
          className="rounded bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-40"
        >
          {taken ? "Attach" : "Create"}
        </button>
      </div>
    </div>
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
        <input
          // biome-ignore lint/a11y/noAutofocus: focusing the rename field is the point
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
