export function isWindowHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}
