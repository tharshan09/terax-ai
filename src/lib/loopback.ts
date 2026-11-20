// "detect": addresses offered for forwarding from SSH terminal output.
// "preview": URLs the preview and open_preview treat as local.
export type LoopbackVariant = "detect" | "preview";

const DETECT_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
]);

export function isLoopbackHost(
  host: string,
  variant: LoopbackVariant,
): boolean {
  const h = host.toLowerCase();
  if (DETECT_HOSTS.has(h)) return true;
  if (variant === "detect") return false;
  return h === "::1" || h.endsWith(".localhost");
}

export function isLoopbackUrl(url: string, variant: LoopbackVariant): boolean {
  try {
    return isLoopbackHost(new URL(url).hostname, variant);
  } catch {
    return false;
  }
}
