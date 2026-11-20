import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  useWorkspaceEnvStore,
  type WorkspaceEnv,
  workspaceScopeKey,
} from "@/modules/workspace";
import {
  AlertCircleIcon,
  Cancel01Icon,
  Plug01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo } from "react";
import { offerView, portsSummary, rowViews } from "./lib/ports";
import {
  portsAvailable,
  setPortsListOpen,
  usePortsListStore,
} from "./lib/portsList";
import {
  acceptOffer,
  dismissOffer,
  refreshForwards,
  usePortsStore,
} from "./lib/portsStore";
import { PortsList } from "./PortsList";

type SshEnv = Extract<WorkspaceEnv, { kind: "ssh" }>;

// The server comes from the workspace store, which keeps the SSH env while a
// preview tab is active; the active terminal tab would lose it.
export function PortsStatus() {
  const env = useWorkspaceEnvStore((s) => s.env);
  if (!portsAvailable(env)) return null;
  return <SshPortsStatus env={env} />;
}

function SshPortsStatus({ env }: { env: SshEnv }) {
  const model = usePortsStore((s) => s);
  const open = usePortsListStore((s) => s.open);
  const scope = workspaceScopeKey(env);
  const offer = useMemo(() => offerView(model, scope), [model, scope]);
  const summary = useMemo(() => portsSummary(model, scope), [model, scope]);
  const rows = useMemo(() => rowViews(model, scope), [model, scope]);

  useEffect(() => {
    if (open) void refreshForwards(env);
  }, [open, env]);

  useEffect(() => () => setPortsListOpen(false), []);

  const status = summary.attention
    ? "attention"
    : summary.count > 0
      ? "count"
      : "empty";
  const title = summary.attention
    ? "A forwarded port is disconnected"
    : "Forwarded ports";

  return (
    <>
      {offer ? (
        <div
          key={offer.port}
          data-testid="port-offer"
          data-status={offer.working ? "working" : "offering"}
          className="flex h-6 shrink-0 items-center rounded-md border border-border/60 bg-card text-[11px] text-foreground animate-in fade-in-0 slide-in-from-top-1 duration-150 ease-out"
        >
          <button
            type="button"
            onClick={() => void acceptOffer(env)}
            disabled={offer.working}
            aria-busy={offer.working || undefined}
            title={`Forward port ${offer.port} to this Mac and preview it`}
            className="flex h-full items-center gap-1.5 rounded-l-md pr-1 pl-1.5 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-default disabled:hover:bg-transparent"
          >
            {offer.working ? (
              <Spinner className="size-3 text-muted-foreground" />
            ) : (
              <HugeiconsIcon icon={Plug01Icon} size={12} strokeWidth={1.75} />
            )}
            <span className="whitespace-nowrap">{offer.label}</span>
            {offer.more ? (
              <span
                data-testid="port-offer-more"
                className="rounded-sm bg-muted px-1 text-[10px] text-muted-foreground tabular-nums"
              >
                {offer.more}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => dismissOffer(env)}
            disabled={offer.working}
            aria-label={`Dismiss port ${offer.port}`}
            title="Dismiss"
            className="flex size-6 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-40"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
          </button>
        </div>
      ) : null}
      <Popover open={open} onOpenChange={setPortsListOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="ports-status"
            data-status={status}
            title={title}
            aria-label={
              summary.count > 0
                ? `Ports, ${summary.count} forwarded${summary.attention ? ", disconnected" : ""}`
                : "Ports"
            }
            className={cn(
              "flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-accent",
              summary.attention
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground hover:text-foreground data-[state=open]:text-foreground",
            )}
          >
            <HugeiconsIcon
              icon={summary.attention ? AlertCircleIcon : Plug01Icon}
              size={13}
              strokeWidth={1.75}
            />
            <span>Ports</span>
            {summary.count > 0 ? (
              <span className="rounded-sm bg-muted/70 px-1 text-[10px] tabular-nums">
                {summary.count}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PortsList env={env} rows={rows} />
      </Popover>
    </>
  );
}
