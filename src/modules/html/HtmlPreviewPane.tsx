import { cn } from "@/lib/utils";
import type { ReadResult } from "@/modules/ai/lib/native";
import { previewHeaderModel } from "@/modules/doc/lib/previewHeader";
import { PreviewHeader } from "@/modules/doc/PreviewHeader";
import { OpenInBrowserButton } from "@/modules/preview-server/OpenInBrowserButton";
import type { FrameSource } from "@/modules/preview-server/types";
import type { WorkspaceEnv } from "@/modules/workspace";
import { usePaneFrameClass, ZenToggleButton } from "@/modules/zen";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import {
  type FrameRoute,
  frameRoute,
  HTML_PREVIEW_VIA_SERVER,
  htmlPreviewSource,
} from "./lib/htmlPreviewSource";

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

// The way this pane loads: `pending` while it waits for the server's answer.
type Route = { kind: "pending" } | FrameRoute;

// Every path omits allow-same-origin: with allow-scripts a same-origin frame
// can reach into the origin it was loaded from (and, for a local file, script
// the asset:// scheme the app itself serves from). Dropping it forces an
// opaque origin, so a workspace HTML file can render and run its own scripts
// but can't touch the host app's storage or assets. A frame loaded from the
// preview server uses the same constant as the built-in way of its place.
const LOCAL_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";
const REMOTE_SANDBOX = "allow-scripts allow-forms allow-popups allow-modals";

// The asset protocol sends no cache validators, so the webview can serve a
// byte-identical asset URL from cache after the file is edited and saved. A
// token per load (mount and every reload) makes each a distinct URL and
// forces a fresh read. The srcDoc path re-reads via fs_read_file instead.
let assetLoadSeq = 0;

export function HtmlPreviewPane({
  path,
  workspace,
  visible,
  onSetView,
}: Props) {
  const source = htmlPreviewSource(workspace, HTML_PREVIEW_VIA_SERVER);
  const frameClass = usePaneFrameClass();
  const [route, setRoute] = useState<Route>(() =>
    source === "server" ? { kind: "pending" } : { kind: source },
  );
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [assetSrc, setAssetSrc] = useState<string | null>(null);
  // Bumped by Reload; every load path depends on it.
  const [reloadSeq, setReloadSeq] = useState(0);
  // Bumped by Reload while the preview is on the built-in way although the
  // server path is on: asks the server again for the frame address.
  const [askSeq, setAskSeq] = useState(0);
  const [reloading, setReloading] = useState(false);
  const loadVia = route.kind;

  // Server path: ask for the frame address once per file, and again on a
  // Reload from the built-in way. The address lives only in `route`; it is
  // never logged. Any answer but `ready` and a failed call load this preview
  // the built-in way (`frameRoute`).
  // biome-ignore lint/correctness/useExhaustiveDependencies: askSeq asks again on Reload
  useEffect(() => {
    if (source !== "server") {
      setRoute({ kind: source });
      return;
    }
    let cancelled = false;
    setRoute({ kind: "pending" });
    invoke<FrameSource>("preview_frame_source", { path, workspace })
      .then((answer) => {
        if (cancelled) return;
        if (answer.status !== "ready") {
          console.info(
            `html preview: frame source answered ${answer.status}, loading the built-in way`,
          );
        }
        setRoute(frameRoute(answer, workspace));
      })
      .catch((e: unknown) => {
        console.warn(
          "html preview: frame source call failed, loading the built-in way:",
          String(e),
        );
        if (!cancelled)
          setRoute(frameRoute({ status: "call_failed" }, workspace));
      });
    return () => {
      cancelled = true;
    };
  }, [path, workspace, source, askSeq]);

  // Asset path: authorize the file (and its directory, for relative
  // CSS/JS/images) on the asset-protocol scope before pointing the iframe at
  // it. The scope is empty by default, so the page can reach only its own
  // folder, never an arbitrary path like ~/.ssh/id_rsa.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadSeq re-runs the load on Reload
  useEffect(() => {
    if (loadVia !== "asset") return;
    let cancelled = false;
    assetLoadSeq += 1;
    const token = assetLoadSeq;
    setAssetSrc(null);
    setStatus({ kind: "loading" });
    invoke("asset_allow", { path, directory: true })
      .then(() => {
        if (!cancelled) setAssetSrc(`${convertFileSrc(path)}?v=${token}`);
      })
      .catch((e) => {
        if (cancelled) return;
        setStatus({ kind: "error", message: String(e) });
        setReloading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, loadVia, reloadSeq]);

  // srcDoc path: read the source; a reload is done once the read answers.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadSeq re-runs the read on Reload
  useEffect(() => {
    if (loadVia !== "srcdoc") return;
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
  }, [path, workspace, loadVia, reloadSeq]);

  // Server and asset frames: a reload is done at the new frame's `load`.
  const frameLoaded = () => setReloading(false);
  // On the built-in way with the server path on, Reload asks the server
  // again; the answer then loads the frame (server) or reads anew (built-in
  // way). Otherwise Reload re-runs the current way. While the first answer is
  // pending, the request in flight already leads to a load.
  const reload = () => {
    setReloading(true);
    if (source === "server" && (loadVia === "asset" || loadVia === "srcdoc"))
      setAskSeq((n) => n + 1);
    else setReloadSeq((n) => n + 1);
  };

  return (
    <div
      data-no-tab-swipe={visible ? "" : undefined}
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden bg-background",
        frameClass,
        !visible && "pointer-events-none",
      )}
    >
      <PreviewHeader
        model={previewHeaderModel({ surface: "html", path, workspace })}
        onSetView={onSetView}
        onReload={reload}
        reloading={reloading}
        openInBrowser={
          <OpenInBrowserButton path={path} workspace={workspace} />
        }
        zen={<ZenToggleButton />}
      />
      {route.kind === "server" ? (
        <iframe
          // A new key per reload: a new frame element, same address.
          key={reloadSeq}
          title={path}
          src={route.url}
          sandbox={workspace?.kind === "ssh" ? REMOTE_SANDBOX : LOCAL_SANDBOX}
          onLoad={frameLoaded}
          className="min-h-0 w-full flex-1 border-none bg-white"
        />
      ) : route.kind === "asset" && assetSrc ? (
        <iframe
          title={path}
          src={assetSrc}
          sandbox={LOCAL_SANDBOX}
          onLoad={frameLoaded}
          className="min-h-0 w-full flex-1 border-none bg-white"
        />
      ) : route.kind === "srcdoc" && status.kind === "ready" ? (
        <iframe
          title={path}
          srcDoc={status.content}
          sandbox={REMOTE_SANDBOX}
          className="min-h-0 w-full flex-1 border-none bg-white"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
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
