import { cn } from "@/lib/utils";
import type { ReadResult } from "@/modules/ai/lib/native";
import { DocViewToggle } from "@/components/ui/DocViewToggle";
import type { WorkspaceEnv } from "@/modules/workspace";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; content: string }
  | { kind: "binary" }
  | { kind: "toolarge"; size: number; limit: number }
  | { kind: "error"; message: string };

type Props = {
  path: string;
  workspace?: WorkspaceEnv;
  visible: boolean;
  onSetView: (mode: "rendered" | "raw") => void;
};

// Local files render through the asset protocol so the page's own relative
// CSS / JS / images resolve and the document gets full fidelity. Remote files
// (SSH / WSL) have no local asset URL, so we read the source and render it via
// a sandboxed srcdoc instead. Relative resources can't resolve there.
function rendersViaAsset(ws: WorkspaceEnv | undefined): boolean {
  return !ws || ws.kind === "local";
}

// Local: cross-origin to the app (asset.localhost), so same-origin is safe and
// lets the doc use its own fetch / storage. Remote: opaque srcdoc origin, never
// same-origin, so the embedded HTML can never reach the host app.
const LOCAL_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups allow-modals";
const REMOTE_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";

// The asset protocol sends no cache validators, so the webview can serve a
// byte-identical asset URL from cache after the file is edited and saved. A
// per-mount token makes each render a distinct URL and forces a fresh read.
// The remote (srcdoc) path re-reads via fs_read_file instead, so it needs none.
let assetMountSeq = 0;

export function HtmlPreviewPane({ path, workspace, visible, onSetView }: Props) {
  const viaAsset = rendersViaAsset(workspace);
  const [assetToken] = useState(() => (assetMountSeq += 1));
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [assetSrc, setAssetSrc] = useState<string | null>(null);

  // Local: authorize the file (and its directory, for relative CSS/JS/images)
  // on the asset-protocol scope before pointing the iframe at it. The scope is
  // empty by default, so the page can reach only its own folder, never an
  // arbitrary path like ~/.ssh/id_rsa.
  useEffect(() => {
    if (!viaAsset) return;
    let cancelled = false;
    setAssetSrc(null);
    setStatus({ kind: "loading" });
    invoke("asset_allow", { path, directory: true })
      .then(() => {
        if (!cancelled) setAssetSrc(`${convertFileSrc(path)}?v=${assetToken}`);
      })
      .catch((e) => {
        if (!cancelled) setStatus({ kind: "error", message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [path, viaAsset, assetToken]);

  useEffect(() => {
    if (viaAsset) return;
    let cancelled = false;
    setStatus({ kind: "loading" });
    // The user explicitly opened this preview, so the read is trusted.
    invoke<ReadResult>("fs_read_file", { path, workspace, trusted: true })
      .then((res) => {
        if (cancelled) return;
        if (res.kind === "text") {
          setStatus({ kind: "ready", content: res.content });
        } else if (res.kind === "binary") {
          setStatus({ kind: "binary" });
        } else {
          setStatus({ kind: "toolarge", size: res.size, limit: res.limit });
        }
      })
      .catch((e) => {
        if (!cancelled) setStatus({ kind: "error", message: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [path, workspace, viaAsset]);

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden rounded-md border border-border/60 bg-background",
        !visible && "pointer-events-none",
      )}
    >
      <DocViewToggle mode="rendered" onChange={onSetView} />
      {viaAsset && assetSrc ? (
        <iframe
          title={path}
          src={assetSrc}
          sandbox={LOCAL_SANDBOX}
          className="h-full w-full border-none bg-white"
        />
      ) : !viaAsset && status.kind === "ready" ? (
        <iframe
          title={path}
          srcDoc={status.content}
          sandbox={REMOTE_SANDBOX}
          className="h-full w-full border-none bg-white"
        />
      ) : (
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
                Binary file, cannot render as HTML.
              </p>
            )}
            {status.kind === "toolarge" && (
              <p className="text-[12px] text-muted-foreground">
                File is {status.size} bytes; limit {status.limit}.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
