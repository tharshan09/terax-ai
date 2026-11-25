import { MarkdownCode } from "@/components/ai-elements/markdown-code";
import { mathPlugin } from "@/components/ai-elements/markdown-math";
import { cn } from "@/lib/utils";
import type { ReadResult } from "@/modules/ai/lib/native";
import { previewHeaderModel } from "@/modules/doc/lib/previewHeader";
import { PreviewHeader } from "@/modules/doc/PreviewHeader";
import { OpenInBrowserButton } from "@/modules/preview-server/OpenInBrowserButton";
import type { WorkspaceEnv } from "@/modules/workspace";
import { usePaneFrameClass, ZenToggleButton } from "@/modules/zen";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
  | { kind: "binary" }
  | { kind: "toolarge"; size: number; limit: number }
  | { kind: "error"; message: string };

type Props = {
  path: string;
  // Env the file lives in, captured when the tab was opened. Resolving the
  // workspace at render time instead let a markdown tab opened on SSH host A
  // read from host B after the ambient workspace switched.
  workspace?: WorkspaceEnv;
  visible: boolean;
  onSetView: (mode: "rendered" | "raw") => void;
};

const components = { code: MarkdownCode };

export function MarkdownPreviewPane({
  path,
  workspace,
  visible,
  onSetView,
}: Props) {
  const frameClass = usePaneFrameClass();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  // Bumped by Reload; the read below depends on it.
  const [reloadSeq, setReloadSeq] = useState(0);
  const [reloading, setReloading] = useState(false);
  // The file the shown content was read for; a reload of the same file keeps
  // the content (and the scroll position) until the new read answers.
  const readFor = useRef<{ path: string; workspace?: WorkspaceEnv } | null>(
    null,
  );

  // A reload is done once the read answers, with content or an error.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadSeq re-runs the read on Reload
  useEffect(() => {
    let cancelled = false;
    const sameFile =
      readFor.current?.path === path && readFor.current.workspace === workspace;
    readFor.current = { path, workspace };
    if (!sameFile) setStatus({ kind: "loading" });
    invoke<ReadResult>("fs_read_file", {
      path,
      workspace,
      // The user explicitly opened this preview, so the read is trusted.
      trusted: true,
    })
      .then((res) => {
        if (cancelled) return;
        if (res.kind === "text") {
          setStatus({ kind: "ready", content: res.content });
        } else if (res.kind === "binary") {
          setStatus({ kind: "binary" });
        } else {
          setStatus({ kind: "toolarge", size: res.size, limit: res.limit });
        }
        setReloading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus({ kind: "error", message: String(e) });
        setReloading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, workspace, reloadSeq]);

  const reload = () => {
    setReloading(true);
    setReloadSeq((n) => n + 1);
  };

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden bg-background",
        frameClass,
        !visible && "pointer-events-none",
      )}
    >
      <PreviewHeader
        model={previewHeaderModel({ surface: "markdown", path, workspace })}
        onSetView={onSetView}
        onReload={reload}
        reloading={reloading}
        openInBrowser={
          <OpenInBrowserButton path={path} workspace={workspace} />
        }
        zen={<ZenToggleButton />}
      />
      <div className="flex-1 overflow-auto">
        <div className="px-8 py-6">
          {status.kind === "loading" && (
            <p className="text-[12px] text-muted-foreground">Loading…</p>
          )}
          {status.kind === "error" && (
            <p className="text-[12px] text-destructive">
              Failed to read file: {status.message}
            </p>
          )}
          {status.kind === "binary" && (
            <p className="text-[12px] text-muted-foreground">
              Binary file — cannot render as markdown.
            </p>
          )}
          {status.kind === "toolarge" && (
            <p className="text-[12px] text-muted-foreground">
              File is {status.size} bytes; limit {status.limit}.
            </p>
          )}
          {status.kind === "ready" && (
            <Streamdown
              className="select-text [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
              components={components}
              plugins={{ math: mathPlugin }}
              mode="static"
              parseIncompleteMarkdown={false}
            >
              {status.content}
            </Streamdown>
          )}
        </div>
      </div>
    </div>
  );
}
