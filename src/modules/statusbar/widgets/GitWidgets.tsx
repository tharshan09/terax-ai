import { getSourceControlRemoteIndicator } from "@/modules/source-control";
import {
  GitBranchIcon,
  PencilEdit02Icon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { StatusbarWidgetCtx } from "./context";

const ITEM = "flex shrink-0 items-center gap-1 text-muted-foreground";

export function GitBranchWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const sc = ctx.sourceControl;
  if (!sc.hasRepo) return null;
  const branch = sc.status?.branch ?? sc.repo?.branch ?? "";
  if (!branch) return null;
  const detached = sc.status?.isDetached ?? sc.repo?.isDetached ?? false;
  return (
    <span
      className={ITEM}
      title={detached ? `Detached HEAD at ${branch}` : `On branch ${branch}`}
    >
      <HugeiconsIcon icon={GitBranchIcon} size={12} strokeWidth={1.75} />
      <span className="max-w-32 truncate">{branch}</span>
    </span>
  );
}

export function GitSyncWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const sc = ctx.sourceControl;
  const indicator = getSourceControlRemoteIndicator(sc);
  if (!indicator.visible) return null;
  return (
    <button
      type="button"
      disabled={indicator.disabled || indicator.action === null}
      title={indicator.title}
      onClick={() => {
        if (indicator.action) void sc.runRemoteAction("contextual");
      }}
      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-sm px-1 text-muted-foreground tabular-nums hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-70 disabled:hover:bg-transparent"
    >
      {indicator.label}
    </button>
  );
}

export function GitChangesWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const sc = ctx.sourceControl;
  if (!sc.hasRepo || sc.changedCount === 0) return null;
  return (
    <span
      className={ITEM}
      title={`${sc.changedCount} changed ${
        sc.changedCount === 1 ? "file" : "files"
      }`}
    >
      <HugeiconsIcon icon={PencilEdit02Icon} size={12} strokeWidth={1.75} />
      <span className="tabular-nums">{sc.changedCount}</span>
    </span>
  );
}

export function GitStagedWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const sc = ctx.sourceControl;
  if (!sc.hasRepo) return null;
  const staged =
    sc.status?.changedFiles.reduce((n, f) => n + (f.staged ? 1 : 0), 0) ?? 0;
  if (staged === 0) return null;
  return (
    <span
      className={ITEM}
      title={`${staged} staged ${staged === 1 ? "file" : "files"}`}
    >
      <HugeiconsIcon icon={Tick01Icon} size={12} strokeWidth={2} />
      <span className="tabular-nums">{staged}</span>
    </span>
  );
}

export function LineChangesWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  const sc = ctx.sourceControl;
  if (!sc.hasRepo) return null;
  const { insertions, deletions } = sc;
  if (insertions === 0 && deletions === 0) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1 tabular-nums"
      title={`${insertions} insertions, ${deletions} deletions vs HEAD (tracked files)`}
    >
      {insertions > 0 ? (
        <span className="text-emerald-600 dark:text-emerald-400">
          +{insertions}
        </span>
      ) : null}
      {deletions > 0 ? (
        <span className="text-rose-600 dark:text-rose-400">-{deletions}</span>
      ) : null}
    </span>
  );
}
