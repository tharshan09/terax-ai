import type { FrameSource } from "@/modules/preview-server/types";
import type { WorkspaceEnv } from "@/modules/workspace";

/**
 * The in-app HTML preview loads through the preview server (local and SSH).
 * Off = every HTML preview loads the built-in way.
 * UNTIL: M-C passed on the Mac (specs/2026-11-25-html-preview-browser, N-23)
 */
export const HTML_PREVIEW_VIA_SERVER = true;

/**
 * How the in-app HTML preview loads a file:
 * - `server`: ask `preview_frame_source` for a frame address,
 * - `asset`: the asset protocol (local files, built-in way),
 * - `srcdoc`: read the source and render it as `srcDoc` (SSH and WSL,
 *   built-in way; relative resources can't resolve there).
 */
export type HtmlPreviewSource = "server" | "asset" | "srcdoc";

/** The built-in way: local through the asset protocol, remote as `srcDoc`. */
export function builtInSource(
  workspace: WorkspaceEnv | undefined,
): "asset" | "srcdoc" {
  return !workspace || workspace.kind === "local" ? "asset" : "srcdoc";
}

/**
 * Where the preview starts. With the server on, local and SSH files ask the
 * server; WSL stays on `srcDoc`.
 */
export function htmlPreviewSource(
  workspace: WorkspaceEnv | undefined,
  viaServer: boolean,
): HtmlPreviewSource {
  if (viaServer && workspace?.kind !== "wsl") return "server";
  return builtInSource(workspace);
}

/** The answer of `preview_frame_source`, or `call_failed` when the call rejected. */
export type FrameAnswer = FrameSource | { status: "call_failed" };

export type FrameRoute =
  | { kind: "server"; url: string }
  | { kind: "asset" }
  | { kind: "srcdoc" };

/**
 * The one place that turns the server's answer into the way the preview
 * loads. Only `ready` with an address loads through the server; every other
 * answer, and a failed call, loads this one preview the built-in way. This
 * rule is for the in-app preview only.
 */
export function frameRoute(
  answer: FrameAnswer,
  workspace: WorkspaceEnv | undefined,
): FrameRoute {
  switch (answer.status) {
    case "ready":
      return answer.url
        ? { kind: "server", url: answer.url }
        : { kind: builtInSource(workspace) };
    case "unsupported":
    case "refused":
    case "too_large":
    case "unreachable":
    case "limit_reached":
    case "call_failed":
      return { kind: builtInSource(workspace) };
  }
}
