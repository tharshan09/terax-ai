import { cn } from "@/lib/utils";
import { useWindowHidden } from "@/lib/windowVisibility";
import { bindMediaPlayback } from "@/modules/editor/lib/mediaPlayback";
import { useCallback } from "react";

type Props = {
  kind: "video" | "audio";
  src: string;
  tabVisible: boolean;
};

export function MediaPreview({ kind, src, tabVisible }: Props) {
  const windowHidden = useWindowHidden();
  const bindMedia = useCallback(
    (media: HTMLMediaElement | null) => {
      if (media) return bindMediaPlayback(media, { tabVisible, windowHidden });
    },
    [tabVisible, windowHidden],
  );
  const Media = kind;
  // WebKit composites media natively, so an ancestor's visibility:hidden does
  // not hide the controls of a background tab; display:none does.
  return (
    <Media
      ref={bindMedia}
      controls
      preload="metadata"
      className={cn(
        kind === "video" ? "max-w-full max-h-full" : "w-full max-w-md",
        !tabVisible && "hidden",
      )}
      src={src}
    />
  );
}
