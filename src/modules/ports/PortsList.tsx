import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PopoverContent } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { writeSystemClipboard } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import type { WorkspaceEnv } from "@/modules/workspace";
import {
  Copy01Icon,
  Globe02Icon,
  LinkSquare02Icon,
  RefreshIcon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { type FormEvent, type RefObject, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { parsePortInput, type PortRowView, type RowAction } from "./lib/ports";
import {
  forwardPortInput,
  openForwardInPreview,
  retryForward,
  stopForward,
} from "./lib/portsStore";

type SshEnv = Extract<WorkspaceEnv, { kind: "ssh" }>;

const EMPTY_TEXT =
  "No forwarded ports. Enter a port below or click a localhost link in the terminal.";

// The command palette hands focus back to its old target after it closed,
// which would steal the field and dismiss the list right after it opened.
const OPEN_FOCUS_GUARD_MS = 1000;

type Props = {
  env: SshEnv;
  rows: readonly PortRowView[];
};

export function PortsList({ env, rows }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openedAt = useRef(0);

  return (
    <PopoverContent
      data-testid="ports-list"
      data-status={rows.length === 0 ? "empty" : "listing"}
      aria-label={`Forwarded ports on ${env.label ?? env.host}`}
      side="top"
      align="end"
      sideOffset={8}
      className="w-80 gap-0 overflow-hidden p-0"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        openedAt.current = performance.now();
        inputRef.current?.focus();
      }}
      onFocusOutside={(e) => {
        if (performance.now() - openedAt.current > OPEN_FOCUS_GUARD_MS) return;
        e.preventDefault();
        inputRef.current?.focus();
      }}
    >
      <div className="flex items-baseline gap-2 px-3 pt-2.5 pb-2">
        <span className="text-[10.5px] font-semibold tracking-wider text-muted-foreground">
          PORTS
        </span>
        <span
          data-testid="ports-list-host"
          title={env.host}
          className="min-w-0 truncate text-[12px] font-medium"
        >
          {env.label ?? env.host}
        </span>
      </div>
      <Separator />
      {rows.length === 0 ? (
        <p className="px-3 py-4 text-[12px] leading-snug text-muted-foreground">
          {EMPTY_TEXT}
        </p>
      ) : (
        <ul className="flex max-h-64 list-none flex-col overflow-y-auto p-1">
          {rows.map((row) => (
            <PortRow key={row.remotePort} env={env} row={row} />
          ))}
        </ul>
      )}
      <Separator />
      <PortInput env={env} inputRef={inputRef} />
    </PopoverContent>
  );
}

function PortRow({ env, row }: { env: SshEnv; row: PortRowView }) {
  const [stopping, setStopping] = useState(false);
  const busy = row.working || stopping;
  const disconnected = row.status === "disconnected";

  const stop = async () => {
    setStopping(true);
    try {
      await stopForward(env, row.remotePort);
    } finally {
      setStopping(false);
    }
  };

  const run: Record<RowAction, () => void> = {
    open: () => openForwardInPreview(env, row.remotePort),
    openInBrowser: () => {
      openUrl(row.url).catch((err: unknown) =>
        toast.error(`Could not open ${row.url}: ${String(err)}`),
      );
    },
    copy: () => {
      writeSystemClipboard(row.url).then(
        () => toast("Copied"),
        () => toast.error("Could not copy the address"),
      );
    },
    retry: () => void retryForward(env, row.remotePort),
    stop: () => void stop(),
  };

  return (
    <li
      data-testid="ports-row"
      data-status={row.status}
      data-highlighted={row.highlighted ? "true" : undefined}
      aria-label={disconnected ? `${row.remotePort} disconnected` : row.label}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-[12px] transition-colors duration-300",
        row.highlighted
          ? "bg-accent ring-1 ring-ring/40"
          : "hover:bg-accent/40",
      )}
    >
      {disconnected ? (
        <span className="flex min-w-0 flex-1 items-baseline gap-3">
          <span className="font-mono tabular-nums">{row.remotePort}</span>
          <span className="truncate text-amber-600 dark:text-amber-400">
            Disconnected
          </span>
        </span>
      ) : (
        <span
          data-testid="ports-row-label"
          className="min-w-0 flex-1 truncate font-mono tabular-nums"
        >
          {row.remotePort}
          <span className="text-muted-foreground">{" -> "}</span>
          <span className="text-muted-foreground">localhost:</span>
          <span
            data-moved={row.moved ? "true" : undefined}
            title={
              row.moved
                ? `Port ${row.remotePort} was taken on this Mac`
                : undefined
            }
            className={cn(
              row.moved
                ? "font-semibold text-amber-600 dark:text-amber-400"
                : "text-muted-foreground",
            )}
          >
            {row.localPort}
          </span>
        </span>
      )}
      <fieldset
        data-testid="ports-row-actions"
        aria-label={`Actions for port ${row.remotePort}`}
        className="m-0 flex min-w-0 shrink-0 items-center gap-0.5 border-0 p-0"
      >
        {row.actions.map((action) => (
          <RowButton
            key={action}
            action={action}
            disabled={busy}
            working={
              (action === "retry" && row.working) ||
              (action === "stop" && stopping)
            }
            onClick={run[action]}
          />
        ))}
      </fieldset>
    </li>
  );
}

const ACTION_LOOK: Record<
  RowAction,
  { label: string; icon: typeof Copy01Icon; danger?: boolean }
> = {
  open: { label: "Open", icon: Globe02Icon },
  openInBrowser: { label: "Open in browser", icon: LinkSquare02Icon },
  copy: { label: "Copy", icon: Copy01Icon },
  retry: { label: "Retry", icon: RefreshIcon },
  stop: { label: "Stop", icon: StopCircleIcon, danger: true },
};

function RowButton({
  action,
  disabled,
  working,
  onClick,
}: {
  action: RowAction;
  disabled: boolean;
  working: boolean;
  onClick: () => void;
}) {
  const look = ACTION_LOOK[action];
  return (
    <button
      type="button"
      aria-label={look.label}
      title={look.label}
      disabled={disabled}
      aria-busy={working || undefined}
      onClick={onClick}
      className={cn(
        "flex size-6 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40",
        look.danger && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {working ? (
        <Spinner className="size-3" />
      ) : (
        <HugeiconsIcon icon={look.icon} size={13} strokeWidth={1.75} />
      )}
    </button>
  );
}

function PortInput({
  env,
  inputRef,
}: {
  env: SshEnv;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (working) return;
    const input = parsePortInput(value);
    if (input.kind === "empty") return;
    if (input.kind === "invalid") {
      setError(input.message);
      return;
    }
    setError(null);
    setWorking(true);
    try {
      const result = await forwardPortInput(env, value);
      if (result.error) setError(result.error);
      else if (result.forwarded) setValue("");
    } finally {
      setWorking(false);
      inputRef.current?.focus();
    }
  };

  const status = working ? "working" : error ? "invalid" : "idle";

  return (
    <form
      data-testid="ports-input"
      data-status={status}
      onSubmit={(e) => void submit(e)}
      className="flex flex-col gap-1 p-2"
    >
      <div className="flex items-center gap-2">
        <label
          htmlFor={`${id}-port`}
          className="pl-1 text-[12px] text-muted-foreground"
        >
          Port
        </label>
        <Input
          ref={inputRef}
          id={`${id}-port`}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          readOnly={working}
          aria-busy={working || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="3000"
          className="h-7 flex-1 rounded-md px-2 font-mono text-[12px] md:text-[12px]"
        />
        <Button
          type="submit"
          size="xs"
          disabled={working}
          className="rounded-md"
        >
          {working ? <Spinner className="size-3" /> : null}
          Forward
        </Button>
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          role="alert"
          className="px-1 text-[11px] text-destructive"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
