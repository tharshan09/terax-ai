import { cn } from "@/lib/utils";
import { bindMediaPlayback } from "@/modules/editor/lib/mediaPlayback";
import { useCallback, useState } from "react";

type Props = {
  kind: "video" | "audio";
  src: string;
  tabVisible: boolean;
};

export function MediaPreview({ kind, src, tabVisible }: Props) {
  const [presented, setPresented] = useState(false);
  const bindMedia = useCallback(
    (media: HTMLMediaElement | null) => {
      if (media) {
        return bindMediaPlayback(media, {
          tabVisible,
          onPresentedChange: setPresented,
        });
      }
    },
    [tabVisible],
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
        !tabVisible && !presented && "hidden",
      )}
      src={src}
    />
  );
}
