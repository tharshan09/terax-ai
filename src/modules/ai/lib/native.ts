import { invoke } from "@tauri-apps/api/core";
import { currentWorkspaceEnv } from "@/modules/workspace";

export type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

export type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  gitignored: boolean;
};

export type CommandOutput = {
  stdout: string;
  stderr: string;
  exit_code: number | null;
  timed_out: boolean;
  truncated: boolean;
};

export type GrepHit = {
  path: string;
  rel: string;
  line: number;
  text: string;
};

export type GrepResponse = {
  hits: GrepHit[];
  truncated: boolean;
  files_scanned: number;
};

export type GlobHit = { path: string; rel: string };
export type GlobResponse = { hits: GlobHit[]; truncated: boolean };

export type GitRepoInfo = {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  isDetached: boolean;
};

export type GitChangedFile = {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  worktreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  statusLabel: string;
};

export type GitStatusSnapshot = {
  repoRoot: string;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  isDetached: boolean;
  insertions: number;
  deletions: number;
  truncated: boolean;
  changedFiles: GitChangedFile[];
};

export type GitDiffResult = {
  diffText: string;
  truncated: boolean;
};

export type GitDiffContentResult = {
  originalContent: string;
  modifiedContent: string;
  isBinary: boolean;
  fallbackPatch: string;
  truncated: boolean;
};

export type GitCommitResult = {
  commitSha: string;
  summary: string;
};

export type GitPushResult = {
  remote: string | null;
  branch: string | null;
  pushed: boolean;
};

export type GitLogEntry = {
  sha: string;
  shortSha: string;
  author: string;
  authorEmail: string;
  timestampSecs: number;
  parents: string[];
  subject: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
};

export type GitCommitFileChange = {
  path: string;
  originalPath: string | null;
  status: string;
  statusLabel: string;
  added: number;
  removed: number;
  isBinary: boolean;
};

export type GitPanelSnapshot = {
  repo: GitRepoInfo | null;
  status: GitStatusSnapshot | null;
};

export type GitDiscardEntry = {
  path: string;
  untracked: boolean;
};

export type GitBranchEntry = {
  name: string;
  kind: "local" | "worktree";
  worktreePath: string | null;
  isHead: boolean;
  isDetached: boolean;
};

export type GitBranchListResult = {
  branches: GitBranchEntry[];
};

export type GitAddWorktreeResult = {
  worktreePath: string;
  branchName: string;
};

export type GitWorktreeNameSuggestion = {
  branchName: string;
  displayName: string;
};

/**
 * Reject an operation that still runs against the LOCAL filesystem/process when
 * an SSH workspace is active. These ops have no remote routing yet, so calling
 * them remotely would silently act on the local machine. Returns a rejected
 * promise (never throws synchronously) so plain `.catch()` callers are safe.
 * Remove a wrapper once its op is routed over SSH.
 */
function guardSsh<T>(op: string, run: () => Promise<T>): Promise<T> {
  const env = currentWorkspaceEnv();
  if (env.kind === "ssh") {
    return Promise.reject(
      new Error(
        `${op} is not available on the remote SSH workspace (${env.host}) yet`,
      ),
    );
  }
  return run();
}

export const native = {
  workspaceCurrentDir: () => invoke<string>("workspace_current_dir"),
  workspaceAuthorize: (path: string) =>
    invoke<string>("workspace_authorize", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  readFile: (path: string) =>
    invoke<ReadResult>("fs_read_file", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  writeFile: (path: string, content: string) =>
    invoke<void>("fs_write_file", {
      path,
      content,
      workspace: currentWorkspaceEnv(),
    }),
  canonicalize: (path: string) =>
    invoke<string>("fs_canonicalize", {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  createFile: (path: string) =>
    invoke<void>("fs_create_file", { path, workspace: currentWorkspaceEnv() }),
  createDir: (path: string) =>
    invoke<void>("fs_create_dir", { path, workspace: currentWorkspaceEnv() }),
  // AI tooling never sees dot-prefixed entries regardless of the user's
  // explorer preference — keeps .git / .env / .ssh out of agent context.
  readDir: (path: string) =>
    invoke<DirEntry[]>("fs_read_dir", {
      path,
      showHidden: false,
      workspace: currentWorkspaceEnv(),
    }),
  grep: (params: {
    pattern: string;
    root: string;
    glob?: string[];
    caseInsensitive?: boolean;
    maxResults?: number;
  }) =>
    guardSsh("grep", () =>
      invoke<GrepResponse>("fs_grep", {
        pattern: params.pattern,
        root: params.root,
        glob: params.glob ?? null,
        caseInsensitive: params.caseInsensitive ?? null,
        maxResults: params.maxResults ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  glob: (params: { pattern: string; root: string; maxResults?: number }) =>
    guardSsh("glob", () =>
      invoke<GlobResponse>("fs_glob", {
        pattern: params.pattern,
        root: params.root,
        maxResults: params.maxResults ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  runCommand: (
    command: string,
    cwd?: string | null,
    timeoutSecs?: number,
  ) =>
    guardSsh("runCommand", () =>
      invoke<CommandOutput>("shell_run_command", {
        command,
        cwd: cwd ?? null,
        timeoutSecs: timeoutSecs ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),

  shellSessionOpen: (cwd?: string | null) =>
    guardSsh("shellSessionOpen", () =>
      invoke<number>("shell_session_open", {
        cwd: cwd ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  shellSessionRun: (
    id: number,
    command: string,
    cwd?: string | null,
    timeoutSecs?: number,
  ) =>
    guardSsh("shellSessionRun", () =>
      invoke<{
        stdout: string;
        stderr: string;
        exit_code: number | null;
        timed_out: boolean;
        truncated: boolean;
        cwd_after: string;
      }>("shell_session_run", {
        id,
        command,
        cwd: cwd ?? null,
        timeoutSecs: timeoutSecs ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  shellSessionClose: (id: number) =>
    invoke<void>("shell_session_close", { id }),
  shellBgSpawn: (command: string, cwd?: string | null) =>
    guardSsh("shellBgSpawn", () =>
      invoke<number>("shell_bg_spawn", {
        command,
        cwd: cwd ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  shellBgLogs: (handle: number, sinceOffset?: number) =>
    invoke<{
      bytes: string;
      next_offset: number;
      dropped: number;
      exited: boolean;
      exit_code: number | null;
    }>("shell_bg_logs", { handle, sinceOffset: sinceOffset ?? null }),
  shellBgKill: (handle: number) => invoke<void>("shell_bg_kill", { handle }),
  shellBgList: () =>
    invoke<
      {
        handle: number;
        command: string;
        cwd: string | null;
        started_at_ms: number;
        exited: boolean;
        exit_code: number | null;
      }[]
    >("shell_bg_list"),
  // Git is not routed over SSH yet — every git op below runs the LOCAL `git`
  // binary, so a same-named local repo could be shown/committed/pushed while an
  // SSH workspace is active. Guard them all until git is SSH-aware.
  gitResolveRepo: (cwd: string) =>
    guardSsh("gitResolveRepo", () =>
      invoke<GitRepoInfo | null>("git_resolve_repo", {
        cwd,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitPanelSnapshot: (cwd: string) =>
    guardSsh("gitPanelSnapshot", () =>
      invoke<GitPanelSnapshot>("git_panel_snapshot", {
        cwd,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitStatus: (repoRoot: string) =>
    guardSsh("gitStatus", () =>
      invoke<GitStatusSnapshot>("git_status", {
        repoRoot,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitDiff: (repoRoot: string, path: string | null, staged: boolean) =>
    guardSsh("gitDiff", () =>
      invoke<GitDiffResult>("git_diff", {
        repoRoot,
        path,
        staged,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitDiffContent: (
    repoRoot: string,
    path: string,
    staged: boolean,
    originalPath?: string | null,
  ) =>
    guardSsh("gitDiffContent", () =>
      invoke<GitDiffContentResult>("git_diff_content", {
        repoRoot,
        path,
        staged,
        originalPath: originalPath ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitStage: (repoRoot: string, paths: string[]) =>
    guardSsh("gitStage", () =>
      invoke<void>("git_stage", {
        repoRoot,
        paths,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitUnstage: (repoRoot: string, paths: string[]) =>
    guardSsh("gitUnstage", () =>
      invoke<void>("git_unstage", {
        repoRoot,
        paths,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitDiscard: (repoRoot: string, entries: GitDiscardEntry[]) =>
    guardSsh("gitDiscard", () =>
      invoke<void>("git_discard", {
        repoRoot,
        entries,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitCommit: (repoRoot: string, message: string) =>
    guardSsh("gitCommit", () =>
      invoke<GitCommitResult>("git_commit", {
        repoRoot,
        message,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitFetch: (repoRoot: string) =>
    guardSsh("gitFetch", () =>
      invoke<void>("git_fetch", {
        repoRoot,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitPullFfOnly: (repoRoot: string) =>
    guardSsh("gitPullFfOnly", () =>
      invoke<void>("git_pull_ff_only", {
        repoRoot,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitPush: (repoRoot: string) =>
    guardSsh("gitPush", () =>
      invoke<GitPushResult>("git_push", {
        repoRoot,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitLog: (repoRoot: string, options?: { limit?: number; beforeSha?: string }) =>
    guardSsh("gitLog", () =>
      invoke<GitLogEntry[]>("git_log", {
        repoRoot,
        limit: options?.limit ?? null,
        beforeSha: options?.beforeSha ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitShowCommit: (repoRoot: string, sha: string) =>
    guardSsh("gitShowCommit", () =>
      invoke<GitDiffResult>("git_show_commit", {
        repoRoot,
        sha,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitCommitFiles: (repoRoot: string, sha: string) =>
    guardSsh("gitCommitFiles", () =>
      invoke<GitCommitFileChange[]>("git_commit_files", {
        repoRoot,
        sha,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitCommitFileDiff: (
    repoRoot: string,
    sha: string,
    path: string,
    originalPath?: string | null,
  ) =>
    guardSsh("gitCommitFileDiff", () =>
      invoke<GitDiffContentResult>("git_commit_file_diff", {
        repoRoot,
        sha,
        path,
        originalPath: originalPath ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitRemoteUrl: (repoRoot: string, name?: string) =>
    guardSsh("gitRemoteUrl", () =>
      invoke<string | null>("git_remote_url", {
        repoRoot,
        name: name ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitListBranches: (repoRoot: string) =>
    guardSsh("gitListBranches", () =>
      invoke<GitBranchListResult>("git_list_branches", {
        repoRoot,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitCheckoutBranch: (repoRoot: string, branch: string) =>
    guardSsh("gitCheckoutBranch", () =>
      invoke<void>("git_checkout_branch", {
        repoRoot,
        branch,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitSuggestWorktreeName: (repoRoot: string, userInput?: string | null) =>
    guardSsh("gitSuggestWorktreeName", () =>
      invoke<GitWorktreeNameSuggestion>("git_suggest_worktree_name", {
        repoRoot,
        userInput: userInput ?? null,
        workspace: currentWorkspaceEnv(),
      }),
    ),
  gitWorktreeAdd: (repoRoot: string, branchName: string) =>
    guardSsh("gitWorktreeAdd", () =>
      invoke<GitAddWorktreeResult>("git_add_worktree", {
        repoRoot,
        branchName,
        workspace: currentWorkspaceEnv(),
      }),
    ),
};
