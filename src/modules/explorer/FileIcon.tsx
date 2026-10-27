import type { ImgHTMLAttributes } from "react";
import { fileIconUrl, folderIconUrl } from "./lib/iconResolver";

type IconImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt">;

export function FileIcon({ name, ...props }: IconImgProps & { name: string }) {
  return <img {...props} src={fileIconUrl(name)} alt="" />;
}

export function FolderIcon({
  name,
  expanded = false,
  ...props
}: IconImgProps & { name: string; expanded?: boolean }) {
  return <img {...props} src={folderIconUrl(name, expanded)} alt="" />;
}
