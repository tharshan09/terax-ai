import { useCallback, useState } from "react";
import { leafIds } from "@/modules/terminal";
import { leafForegroundCheck } from "@/modules/terminal/lib/useTerminalSession";
import {
  type GroupClosePlan,
  nextActiveInSpace,
  type Tab,
  type TabGroup,
} from "@/modules/tabs";
import { planGroupClose } from "@/modules/tabs/lib/tabGroups";

type Params = {
  tabs: Tab[];
  groups: TabGroup[];
  disposeTab: (id: number) => void;
  disposeGroup: (groupId: string) => void;
};

/** Why closing `tab` needs a confirmation, or null when it can close at
 *  once. A failed process check counts as a running process. */
export async function closeConfirmReason(
  tab: Tab,
): Promise<"unsaved" | "process" | null> {
  if (tab.kind === "editor" && tab.dirty) return "unsaved";
  if (tab.kind !== "terminal") return null;
  const checks = await Promise.all(
    leafIds(tab.paneTree).map(leafForegroundCheck),
  );
  return checks.some((c) => c !== "idle") ? "process" : null;
}

/**
 * Guards tab closing: dirty editors and terminals with a live foreground
 * process route through a confirmation dialog instead of closing immediately.
 * Owns the pending-close states the dialogs render from.
 */
export function useTabCloseGuards({
  tabs,
  groups,
  disposeTab,
  disposeGroup,
}: Params) {
  const [pendingCloseTab, setPendingCloseTab] = useState<number | null>(null);
  const [pendingTerminalCloseTab, setPendingTerminalCloseTab] = useState<
    number | null
  >(null);
  const [pendingDeleteTabs, setPendingDeleteTabs] = useState<number[] | null>(
    null,
  );
  const [pendingGroupClose, setPendingGroupClose] =
    useState<GroupClosePlan | null>(null);

  const handleClose = useCallback(
    async (id: number) => {
      // Last tab in its space can't be closed (closeTab refuses). Skip the
      // dialog entirely so confirming it doesn't appear to silently fail.
      if (nextActiveInSpace(tabs, id, groups) === null) return;
      const t = tabs.find((x) => x.id === id);
      const reason = t ? await closeConfirmReason(t) : null;
      if (reason === "unsaved") {
        setPendingCloseTab(id);
        return;
      }
      if (reason === "process") {
        setPendingTerminalCloseTab(id);
        return;
      }
      disposeTab(id);
    },
    [tabs, groups, disposeTab],
  );

  const confirmClose = useCallback(() => {
    if (pendingCloseTab !== null) {
      disposeTab(pendingCloseTab);
      setPendingCloseTab(null);
    }
  }, [pendingCloseTab, disposeTab]);

  const cancelClose = useCallback(() => {
    setPendingCloseTab(null);
  }, []);

  const confirmTerminalClose = useCallback(() => {
    if (pendingTerminalCloseTab !== null) disposeTab(pendingTerminalCloseTab);
    setPendingTerminalCloseTab(null);
  }, [pendingTerminalCloseTab, disposeTab]);

  const cancelTerminalClose = useCallback(() => {
    setPendingTerminalCloseTab(null);
  }, []);

  const confirmDeleteClose = useCallback(() => {
    if (pendingDeleteTabs !== null) {
      for (const id of pendingDeleteTabs) disposeTab(id);
      setPendingDeleteTabs(null);
    }
  }, [pendingDeleteTabs, disposeTab]);

  const cancelDeleteClose = useCallback(() => {
    setPendingDeleteTabs(null);
  }, []);

  const requestCloseGroup = useCallback(
    async (groupId: string) => {
      const members = tabs.filter((t) => t.groupId === groupId);
      const reasons = await Promise.all(members.map(closeConfirmReason));
      const confirmIds = new Set(
        members.filter((_, i) => reasons[i] !== null).map((t) => t.id),
      );
      const plan = planGroupClose(tabs, groupId, confirmIds);
      if (plan === null) return;
      if (plan.m === 0) {
        disposeGroup(groupId);
        return;
      }
      setPendingGroupClose(plan);
    },
    [tabs, disposeGroup],
  );

  const confirmGroupClose = useCallback(() => {
    if (pendingGroupClose !== null) disposeGroup(pendingGroupClose.groupId);
    setPendingGroupClose(null);
  }, [pendingGroupClose, disposeGroup]);

  const cancelGroupClose = useCallback(() => {
    setPendingGroupClose(null);
  }, []);

  const handlePathDeleted = useCallback(
    (path: string) => {
      const dirty: number[] = [];
      for (const t of tabs) {
        if (t.kind !== "editor") continue;
        if (t.path !== path && !t.path.startsWith(`${path}/`)) continue;
        if (t.dirty) {
          dirty.push(t.id);
        } else {
          disposeTab(t.id);
        }
      }
      if (dirty.length > 0) setPendingDeleteTabs(dirty);
    },
    [tabs, disposeTab],
  );

  return {
    pendingCloseTab,
    pendingTerminalCloseTab,
    pendingDeleteTabs,
    handleClose,
    confirmClose,
    cancelClose,
    confirmTerminalClose,
    cancelTerminalClose,
    confirmDeleteClose,
    cancelDeleteClose,
    handlePathDeleted,
    pendingGroupClose,
    requestCloseGroup,
    confirmGroupClose,
    cancelGroupClose,
  };
}
