export type CopyResult = {
  created: string[];
  // `maybePlaced`: cut off while publishing, so the item may be in place.
  failed: { source: string; message: string; maybePlaced?: boolean }[];
  aborted?: string | null;
};

// A lost connection explains every failure after it, so it beats the first one.
export function copyFailureReason(
  result: CopyResult,
  label: (source: string) => string = (source) => source,
): string | null {
  const first = result.failed[0];
  return (
    result.aborted ??
    (first ? `${label(first.source)}: ${first.message}` : null)
  );
}
