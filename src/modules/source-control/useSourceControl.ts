import {
  native,
  type GitRepoInfo,
  type GitStatusSnapshot,
} from "@/modules/ai/lib/native";
import { useWorkspaceEnvStore, workspaceScopeKey } from "@/modules/workspace";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const AUTO_FETCH_THROTTLE_MS = 5 * 60_000;
const AUTO_FETCH_LRU_LIMIT = 16;
const FOCUS_REFRESH_MIN_INTERVAL_MS = 1500;
// Skip the context-change refetch when the data is this fresh and the new path
// is still inside the loaded repo (cd-within-repo produces identical status).
const SC_STATUS_TTL_MS = 2000;

export type SourceControlRefreshMode = "auto" | "always" | "never";
export type SourceControlRemoteAction = "fetch" | "pull" | "push";
export type SourceControlRemoteActionMode =
  | "contextual"
  | SourceControlRemoteAction;

export type SourceControlRemoteActionResult = {
  ok: boolean;
  action: SourceControlRemoteAction | null;
  error?: string;
  blocked?: "diverged" | "missing-upstream" | "no-repo";
};

export type SourceControlSummary = {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
  changedCount: number;
  upstream: string | null;
  ahead: number;
  behind: number;
  insertions: number;
  deletions: number;
  hasRepo: boolean;
  isLoading: boolean;
  localError: string | null;
  busyAction: SourceControlRemoteAction | null;
  lastRemoteError: string | null;
  applyStatus: (
    updater: (status: GitStatusSnapshot) => GitStatusSnapshot,
  ) => void;
  refresh: (options?: {
    remote?: SourceControlRefreshMode;
  }) => Promise<void>;
  runRemoteAction: (
    mode?: SourceControlRemoteActionMode,
  ) => Promise<SourceControlRemoteActionResult>;
};

export type SourceControlRemoteIndicator = {
  visible: boolean;
  label: string;
  title: string;
  disabled: boolean;
  action: SourceControlRemoteAction | null;
};

type SourceControlSummaryState = {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
  hasRepo: boolean;
  isLoading: boolean;
  localError: string | null;
  busyAction: SourceControlRemoteAction | null;
  lastRemoteError: string | null;
};

const EMPTY_STATE: SourceControlSummaryState = {
  repo: null,
  status: null,
  hasRepo: false,
  isLoading: false,
  localError: null,
  busyAction: null,
  lastRemoteError: null,
};

type InflightRefresh = {
  contextKey: string;
  mode: SourceControlRefreshMode;
  promise: Promise<void>;
};

function normalizeError(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Unknown source control error";
}

function getContextualAction(
  status: GitStatusSnapshot | null,
): SourceControlRemoteAction | null {
  if (!status?.upstream) return null;
  if (status.ahead > 0 && status.behind > 0) return null;
  if (status.behind > 0) return "pull";
  if (status.ahead > 0) return "push";
  return "fetch";
}

export function getSourceControlRemoteIndicator(
  summary: Pick<
    SourceControlSummary,
    "hasRepo" | "upstream" | "ahead" | "behind" | "busyAction"
  >,
): SourceControlRemoteIndicator {
  if (!summary.hasRepo || !summary.upstream) {
    return { visible: false, label: "", title: "", disabled: true, action: null };
  }
  if (summary.ahead > 0 && summary.behind > 0) {
    return {
      visible: true,
      label: `↑${summary.ahead} ↓${summary.behind}`,
      title:
        "Branch has diverged from upstream. Use Source Control or the terminal to resolve it.",
      disabled: true,
      action: null,
    };
  }
  if (summary.behind > 0) {
    return {
      visible: true,
      label: `↓${summary.behind}`,
      title: `Pull ${summary.behind} remote ${
        summary.behind === 1 ? "commit" : "commits"
      } with fast-forward only.`,
      disabled: summary.busyAction !== null,
      action: "pull",
    };
  }
  if (summary.ahead > 0) {
    return {
      visible: true,
      label: `↑${summary.ahead}`,
      title: `Push ${summary.ahead} local ${
        summary.ahead === 1 ? "commit" : "commits"
      }.`,
      disabled: summary.busyAction !== null,
      action: "push",
    };
  }
  return {
    visible: true,
    label: "Sync",
    title: "Fetch remote updates.",
    disabled: summary.busyAction !== null,
    action: "fetch",
  };
}

function containsContext(
  repoRoot: string | null,
  contextPath: string | null,
): boolean {
  if (!repoRoot || !contextPath) return false;
  return contextPath === repoRoot || contextPath.startsWith(`${repoRoot}/`);
}

type ContextRefreshPlan =
  | "refresh"
  /** Fresh data already covers this context. */
  | "reuse"
  /** Nobody is looking and the loaded repo no longer applies. */
  | "clear"
  /** Nobody is looking: leave the loaded snapshot alone. */
  | "keep";

/**
 * What a context change, or a consumer appearing, does. Without a live consumer
 * git never runs; the snapshot is only kept while it still describes the
 * context's repository, so the next consumer never shows another repo's data.
 */
export function planContextRefresh(input: {
  live: boolean;
  contextPath: string | null;
  repoRoot: string | null;
  hasRepo: boolean;
  /** Milliseconds since the last completed refresh. */
  ageMs: number;
}): ContextRefreshPlan {
  const sameRepo = containsContext(input.repoRoot, input.contextPath);
  if (!input.live) {
    if (!input.hasRepo && input.repoRoot === null) return "keep";
    return sameRepo ? "keep" : "clear";
  }
  if (input.ageMs < SC_STATUS_TTL_MS && sameRepo && input.hasRepo) {
    return "reuse";
  }
  return "refresh";
}

function touchAutoFetch(map: Map<string, number>, key: string): void {
  map.delete(key);
  map.set(key, Date.now());
  while (map.size > AUTO_FETCH_LRU_LIMIT) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

export type UseSourceControlOptions = {
  /**
   * Default true. A consumer of the status is on screen; while false, window
   * focus and context changes run no git, and turning true refreshes once.
   */
  live?: boolean;
};

export function useSourceControl(
  contextPath: string | null,
  enabled: boolean = true,
  { live = true }: UseSourceControlOptions = {},
): SourceControlSummary {
  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const workspaceKey = workspaceScopeKey(workspaceEnv);
  const [state, setState] = useState<SourceControlSummaryState>({
    repo: null,
    status: null,
    hasRepo: false,
    isLoading: false,
    localError: null,
    busyAction: null,
    lastRemoteError: null,
  });
  const stateRef = useRef(state);
  const requestIdRef = useRef(0);
  const inflightRef = useRef<InflightRefresh | null>(null);
  const autoFetchByRepoRef = useRef(new Map<string, number>());
  const enabledRef = useRef(enabled);
  const lastRefreshAtRef = useRef(0);
  const contextKey = `${workspaceKey}\u0000${contextPath ?? ""}`;
  const contextKeyRef = useRef(contextKey);
  const errorContextRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    contextKeyRef.current = contextKey;
  }, [contextKey]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    requestIdRef.current++;
    inflightRef.current = null;
    autoFetchByRepoRef.current.clear();
    setState({
      repo: null,
      status: null,
      hasRepo: false,
      isLoading: false,
      localError: null,
      busyAction: null,
      lastRemoteError: null,
    });
  }, [workspaceKey]);

  const applyStatus = useCallback(
    (updater: (status: GitStatusSnapshot) => GitStatusSnapshot) => {
      setState((current) => {
        if (!current.status) return current;
        const next = updater(current.status);
        if (next === current.status) return current;
        return { ...current, status: next };
      });
    },
    [],
  );

  const doRefresh = useCallback(
    async (remoteMode: SourceControlRefreshMode): Promise<void> => {
      // A refresh bound to a context already left never writes its status.
      if (!enabledRef.current || contextKey !== contextKeyRef.current) return;
      const requestId = ++requestIdRef.current;

      if (!contextPath) {
        setState({
          repo: null,
          status: null,
          hasRepo: false,
          isLoading: false,
          localError: null,
          busyAction: null,
          lastRemoteError: null,
        });
        return;
      }

      const activeRoot = stateRef.current.repo?.repoRoot ?? null;
      const reusableRoot =
        activeRoot && containsContext(activeRoot, contextPath)
          ? activeRoot
          : undefined;

      setState((current) => ({ ...current, isLoading: true, localError: null }));

      try {
        let repo: GitRepoInfo | null;
        let status: GitStatusSnapshot | null;

        if (reusableRoot) {
          try {
            repo = stateRef.current.repo ?? null;
            status = await native.gitStatus(reusableRoot);
            if (requestId !== requestIdRef.current) return;
            if (!repo || repo.repoRoot !== reusableRoot) {
              repo = {
                repoRoot: reusableRoot,
                branch: status.branch,
                upstream: status.upstream,
                isDetached: status.isDetached,
              };
            }
          } catch {
            const snapshot = await native.gitPanelSnapshot(contextPath);
            if (requestId !== requestIdRef.current) return;
            if (!snapshot.repo) {
              setState((current) => ({
                ...current,
                repo: null,
                status: null,
                hasRepo: false,
                isLoading: false,
                localError: null,
              }));
              return;
            }
            repo = snapshot.repo;
            status = snapshot.status ?? null;
          }
        } else {
          const snapshot = await native.gitPanelSnapshot(contextPath);
          if (requestId !== requestIdRef.current) return;
          if (!snapshot.repo) {
            setState((current) => ({
              ...current,
              repo: null,
              status: null,
              hasRepo: false,
              isLoading: false,
              localError: null,
            }));
            return;
          }
          repo = snapshot.repo;
          status = snapshot.status ?? null;
        }

        if (!repo) {
          setState((current) => ({
            ...current,
            repo: null,
            status: null,
            hasRepo: false,
            isLoading: false,
            localError: null,
          }));
          return;
        }

        let nextRemoteError = stateRef.current.lastRemoteError;
        const shouldAutoFetch =
          repo.upstream &&
          remoteMode !== "never" &&
          (remoteMode === "always" ||
            Date.now() -
              (autoFetchByRepoRef.current.get(repo.repoRoot) ?? 0) >=
              AUTO_FETCH_THROTTLE_MS);

        if (shouldAutoFetch) {
          try {
            await native.gitFetch(repo.repoRoot);
            touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
            nextRemoteError = null;
            if (requestId !== requestIdRef.current) return;
            status = await native.gitStatus(repo.repoRoot);
            if (requestId !== requestIdRef.current) return;
          } catch (error) {
            nextRemoteError = normalizeError(error);
          }
        }

        setState((current) => ({
          ...current,
          repo,
          status,
          hasRepo: true,
          isLoading: false,
          localError: null,
          lastRemoteError: nextRemoteError,
        }));
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setState((current) => ({
          ...current,
          repo: null,
          hasRepo: false,
          status: null,
          isLoading: false,
          localError: normalizeError(error),
        }));
      } finally {
        lastRefreshAtRef.current = Date.now();
      }
    },
    [contextKey, contextPath],
  );

  const refresh = useCallback(
    async (options?: { remote?: SourceControlRefreshMode }) => {
      const remoteMode = options?.remote ?? "never";
      const inflight = inflightRef.current;
      if (inflight?.contextKey === contextKey) {
        const cur = inflight.mode;
        const upgrade =
          (cur === "never" && remoteMode !== "never") ||
          (cur === "auto" && remoteMode === "always");
        if (!upgrade) return inflight.promise;
      }
      const run = doRefresh(remoteMode).finally(() => {
        if (inflightRef.current?.promise === run) inflightRef.current = null;
      });
      inflightRef.current = { contextKey, mode: remoteMode, promise: run };
      return run;
    },
    [contextKey, doRefresh],
  );

  const runRemoteAction = useCallback(
    async (
      mode: SourceControlRemoteActionMode = "contextual",
    ): Promise<SourceControlRemoteActionResult> => {
      const { repo, status } = stateRef.current;
      if (!repo || !status) {
        return { ok: false, action: null, blocked: "no-repo" };
      }
      if (!status.upstream) {
        return { ok: false, action: null, blocked: "missing-upstream" };
      }

      const action = mode === "contextual" ? getContextualAction(status) : mode;
      if (!action) {
        return { ok: false, action: null, blocked: "diverged" };
      }

      setState((current) => ({ ...current, busyAction: action }));

      try {
        if (action === "fetch") {
          await native.gitFetch(repo.repoRoot);
          touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
        } else if (action === "pull") {
          await native.gitFetch(repo.repoRoot);
          touchAutoFetch(autoFetchByRepoRef.current, repo.repoRoot);
          await native.gitPullFfOnly(repo.repoRoot);
        } else {
          await native.gitPush(repo.repoRoot);
        }
        setState((current) => ({ ...current, lastRemoteError: null }));
        await refresh({ remote: "never" });
        return { ok: true, action };
      } catch (error) {
        const message = normalizeError(error);
        setState((current) => ({ ...current, lastRemoteError: message }));
        await refresh({ remote: "never" }).catch(() => {});
        return { ok: false, action, error: message };
      } finally {
        setState((current) => ({ ...current, busyAction: null }));
      }
    },
    [refresh],
  );

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current++;
      errorContextRef.current = null;
      setState(EMPTY_STATE);
      return;
    }
    // A remote error belongs to its context; a consumer coming or going keeps it.
    if (errorContextRef.current !== contextKey) {
      errorContextRef.current = contextKey;
      setState((current) => ({ ...current, lastRemoteError: null }));
    }
    const run = () => {
      const current = stateRef.current;
      const plan = planContextRefresh({
        live,
        contextPath,
        repoRoot: current.repo?.repoRoot ?? null,
        hasRepo: current.hasRepo,
        ageMs: Date.now() - lastRefreshAtRef.current,
      });
      if (plan === "refresh") {
        void refresh({ remote: "never" });
      } else if (plan === "clear") {
        // Drop a refresh still in flight for the context just left; a running
        // remote action keeps its busy state and error.
        requestIdRef.current++;
        inflightRef.current = null;
        setState((s) => ({
          ...s,
          repo: null,
          status: null,
          hasRepo: false,
          isLoading: false,
          localError: null,
        }));
      }
    };
    // A consumer with nothing to show must not wait for an idle slot, or it
    // would flash "no repository" first.
    const current = stateRef.current;
    if (live && contextPath && !current.hasRepo && !current.isLoading) {
      run();
      return;
    }
    const idle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(run, { timeout: 600 })
        : (window.setTimeout(run, 0) as unknown as number);
    return () => {
      if (typeof window.cancelIdleCallback === "function") {
        try {
          window.cancelIdleCallback(idle as number);
        } catch {
          /* noop */
        }
      } else {
        window.clearTimeout(idle as number);
      }
    };
  }, [refresh, contextKey, contextPath, enabled, live]);

  useEffect(() => {
    if (!enabled || !live) return;
    let timer = 0;
    const onFocus = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = 0;
        const elapsed = Date.now() - lastRefreshAtRef.current;
        if (elapsed < FOCUS_REFRESH_MIN_INTERVAL_MS) return;
        void refresh({ remote: "never" });
      }, 400);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer) window.clearTimeout(timer);
    };
  }, [refresh, enabled, live]);

  return useMemo<SourceControlSummary>(
    () => ({
      repo: state.repo,
      status: state.status,
      changedCount: state.status?.changedFiles.length ?? 0,
      upstream: state.status?.upstream ?? state.repo?.upstream ?? null,
      ahead: state.status?.ahead ?? 0,
      behind: state.status?.behind ?? 0,
      insertions: state.status?.insertions ?? 0,
      deletions: state.status?.deletions ?? 0,
      hasRepo: state.hasRepo,
      isLoading: state.isLoading,
      localError: state.localError,
      busyAction: state.busyAction,
      lastRemoteError: state.lastRemoteError,
      applyStatus,
      refresh,
      runRemoteAction,
    }),
    [state, applyStatus, refresh, runRemoteAction],
  );
}
