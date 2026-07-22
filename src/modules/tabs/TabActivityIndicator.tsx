import { useAgentStore } from "@/modules/agents/store/agentStore";
import { leafIds, type PaneNode } from "@/modules/terminal/lib/panes";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { selectTabAgentStatus } from "./lib/selectTabAgentStatus";

type Props = {
  paneTree: PaneNode;
};

export function TabActivityIndicator({ paneTree }: Props) {
  // Walk the pane tree once per tree change, not once per agent-store change.
  // The old selector called `leafIds(paneTree).map(...)` inline, so it re-walked
  // the tree and allocated two arrays on EVERY store transition (× every mounted
  // tab), even though the Object.is bailout already suppressed the re-render.
  const ids = useMemo(() => leafIds(paneTree), [paneTree]);
  // Zero-allocation primitive selector over the memoized id list: an unrelated
  // store change (a notification, another tab's agent) no longer allocates or
  // traverses; the primitive result still lets Object.is bail the re-render.
  const status = useAgentStore((s) => selectTabAgentStatus(s.sessions, ids));

  if (status === null) return null;

  if (status === "working") {
    return (
      <HugeiconsIcon
        icon={Loading03Icon}
        aria-label="Agent working"
        className="size-3 shrink-0 animate-spin text-primary"
      />
    );
  }

  // Mirrors the editor dirty-dot but colored to draw attention.
  return (
    <span
      aria-label="Agent waiting for input"
      className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
    />
  );
}
