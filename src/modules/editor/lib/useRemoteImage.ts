import { extOf, remoteImageMime } from "@/modules/editor/lib/binaryPreview";
import { type WorkspaceEnv, workspaceScopeKey } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";

export type RemoteImage =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "failed"; message: string };

const LOADING: RemoteImage = { status: "loading" };

/**
 * Object URL for an image read over SSH, revoked when the path or host changes
 * and on unmount. `path === null` reads nothing.
 */
export function useRemoteImage(
  path: string | null,
  workspace: WorkspaceEnv,
): RemoteImage {
  const key =
    path === null ? null : `${workspaceScopeKey(workspace)}\n${path}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    image: RemoteImage;
  } | null>(null);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  useEffect(() => {
    if (path === null || key === null) return;
    const mime = remoteImageMime(extOf(path));
    if (!mime) {
      setLoaded({
        key,
        image: { status: "failed", message: "Not supported over SSH" },
      });
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    invoke<ArrayBuffer>("fs_read_remote_image", {
      path,
      workspace: workspaceRef.current,
    })
      .then((bytes) => {
        if (cancelled) return;
        url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: mime }),
        );
        setLoaded({ key, image: { status: "ready", url } });
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({ key, image: { status: "failed", message: String(e) } });
        }
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, path]);

  // An entry for the previous path must not render: its URL is being revoked.
  if (key === null || loaded?.key !== key) return LOADING;
  return loaded.image;
}
