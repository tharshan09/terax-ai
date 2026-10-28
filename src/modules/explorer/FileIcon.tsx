import { cn } from "@/lib/utils";
import { type ImgHTMLAttributes, useState, useSyncExternalStore } from "react";
import {
  peekFileIconUrl,
  peekFolderIconUrl,
  subscribeFileIcons,
} from "./lib/iconResolver";

type IconImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt">;

const serverSnapshot = () => "";

// Until the lazy icon set lands, an empty slot with the same box keeps the
// layout still; a slot that was blank at mount fades the icon in.
function IconSlot({
  url,
  className,
  width,
  height,
  style,
  onError,
  ...rest
}: IconImgProps & { url: string }) {
  const [arrivedLate] = useState(url === "");
  if (!url) {
    return (
      <span
        aria-hidden
        className={cn("block", className)}
        style={{ ...style, width, height }}
      />
    );
  }
  return (
    <img
      {...rest}
      src={url}
      alt=""
      width={width}
      height={height}
      style={style}
      className={cn(className, arrivedLate && "terax-icon-in")}
      onError={onError}
    />
  );
}

export function FileIcon({
  name,
  onError,
  ...props
}: IconImgProps & { name: string }) {
  const url = useSyncExternalStore(
    subscribeFileIcons,
    () => peekFileIconUrl(name),
    serverSnapshot,
  );
  return (
    <IconSlot
      {...props}
      url={url}
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.dataset.fallback) {
          img.dataset.fallback = "1";
          img.src = peekFileIconUrl("dummy.txt");
        }
        onError?.(e);
      }}
    />
  );
}

export function FolderIcon({
  name,
  expanded = false,
  ...props
}: IconImgProps & { name: string; expanded?: boolean }) {
  const url = useSyncExternalStore(
    subscribeFileIcons,
    () => peekFolderIconUrl(name, expanded),
    serverSnapshot,
  );
  return <IconSlot {...props} url={url} />;
}
