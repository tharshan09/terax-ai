import { useRemoteImage } from "@/modules/editor/lib/useRemoteImage";
import type { WorkspaceEnv } from "@/modules/workspace";
import { convertFileSrc } from "@tauri-apps/api/core";

type Props = {
  path: string;
  remote: WorkspaceEnv | null;
  /** Past the read cap: a remote image is refused without a round-trip. */
  tooLarge?: boolean;
};

const CHECKERBOARD = {
  backgroundImage:
    "conic-gradient(#e5e7eb 0.25turn, #f3f4f6 0.25turn 0.5turn, #e5e7eb 0.5turn 0.75turn, #f3f4f6 0.75turn)",
  backgroundSize: "20px 20px",
};

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="flex max-w-md flex-col items-center gap-1 text-center">
      <div className="text-sm text-foreground">Image preview unavailable</div>
      <div className="break-words text-xs text-muted-foreground">{reason}</div>
    </div>
  );
}

export function ImagePreview({ path, remote, tooLarge = false }: Props) {
  const image = useRemoteImage(path, tooLarge ? null : remote);

  let src: string;
  if (remote === null) {
    src = convertFileSrc(path);
  } else if (tooLarge) {
    return <Unavailable reason="File too large to preview over SSH" />;
  } else if (image.status === "loading") {
    return <div className="text-xs text-muted-foreground">Loading…</div>;
  } else if (image.status === "failed") {
    return <Unavailable reason={image.message} />;
  } else {
    src = image.url;
  }

  return (
    <img
      src={src}
      loading="lazy"
      decoding="async"
      className="max-w-full max-h-full object-contain rounded-md border border-border shadow-sm"
      style={CHECKERBOARD}
      alt={path.split(/[\\/]/).pop()}
    />
  );
}
