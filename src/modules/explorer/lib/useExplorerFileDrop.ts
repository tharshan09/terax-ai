import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type CopyResult,
  type ExplorerScope,
  reportCopyFailures,
} from "@/modules/explorer/lib/clipboardPaste";
import { targetDirFor } from "@/modules/explorer/lib/paths";

type Options = {
  scope: ExplorerScope | null;
  isCurrent: (scope: ExplorerScope) => boolean;
  isDir: (path: string) => boolean | undefined;
  onCopied: (destDir: string) => void;
};

// Tauri reports the drop point in physical pixels on some platforms; scale down
// only when it overflows the logical viewport (mirrors the terminal drop).
function dirAt(
  x: number,
  y: number,
  rootPath: string | null,
  isDir: (p: string) => boolean | undefined,
): string | null {
  let lx = x;
  let ly = y;
  if (x > window.innerWidth || y > window.innerHeight) {
    const dpr = window.devicePixelRatio || 1;
    lx = x / dpr;
    ly = y / dpr;
  }
  const el = document.elementFromPoint(lx, ly) as HTMLElement | null;
  if (!el) return null;
  const row = el.closest<HTMLElement>("[data-fs-path]");
  if (row)
    return targetDirFor(row.getAttribute("data-fs-path"), isDir, rootPath);
  if (el.closest("[data-explorer-drop]")) return rootPath;
  return null;
}

// Accepts files dropped from the OS onto an explorer folder (copy, not move),
// via Tauri's native drag-drop. One webview-level listener; ignores drops that
// land outside the explorer (the terminal handles its own).
export function useExplorerFileDrop(options: Options) {
  const [targetDir, setTargetDir] = useState<string | null>(null);
  const optsRef = useRef(options);
  optsRef.current = options;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void getCurrentWebview()
      .onDragDropEvent((e) => {
        const p = e.payload;
        const { scope, isCurrent, isDir, onCopied } = optsRef.current;
        const rootPath = scope?.rootPath ?? null;
        if (p.type === "enter" || p.type === "over") {
          setTargetDir(dirAt(p.position.x, p.position.y, rootPath, isDir));
          return;
        }
        if (p.type === "leave") {
          setTargetDir(null);
          return;
        }
        if (p.type === "drop") {
          const dir = dirAt(p.position.x, p.position.y, rootPath, isDir);
          setTargetDir(null);
          if (!scope || !dir || p.paths.length === 0 || !isCurrent(scope))
            return;
          void invoke<CopyResult>("fs_copy", {
            sources: p.paths,
            destDir: dir,
            workspace: scope.workspace,
            renameOnConflict: true,
          })
            .then(reportCopyFailures)
            .catch((err) => toast.error(`Copy failed: ${String(err)}`))
            .finally(() => {
              if (!disposed && isCurrent(scope)) onCopied(dir);
            });
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((err) => console.error("[terax] explorer drop listen failed:", err));

    return () => {
      disposed = true;
      setTargetDir(null);
      unlisten?.();
    };
  }, []);

  return { externalTargetDir: targetDir };
}
