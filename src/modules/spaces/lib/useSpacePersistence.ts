import { useCallback, useEffect, useRef } from "react";
import { subscribeWindowHidden } from "@/lib/windowVisibility";
import type { Tab, TabGroup } from "@/modules/tabs";
import { isSerializableTab, serializeSpace } from "./serialize";
import { saveState } from "./store";
import { useSpaces } from "./useSpaces";

const DEBOUNCE_MS = 3000;

type Snapshot = {
  tabs: Tab[];
  /** Every space's groups. */
  groups: TabGroup[];
  activeId: number;
  activeSpaceId: string;
};

type Params = Snapshot & {
  /** Gate writes until boot hydration finished, so restore never round-trips. */
  enabled: boolean;
};

type LastWrite = { json: string; activeTabIndex: number };

export function useSpacePersistence({
  tabs,
  groups,
  activeId,
  activeSpaceId,
  enabled,
}: Params) {
  const last = useRef<Map<string, LastWrite>>(new Map());
  const seeded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef<Snapshot>({ tabs, groups, activeId, activeSpaceId });
  latest.current = { tabs, groups, activeId, activeSpaceId };

  // Seed each space's last-known active index from disk so the first flush
  // preserves it for spaces the user never opens (empty json forces one write
  // with the correct index rather than clobbering it to 0).
  if (enabled && !seeded.current) {
    seeded.current = true;
    for (const [id, idx] of Object.entries(
      useSpaces.getState().initialActiveIndex,
    )) {
      last.current.set(id, { json: "", activeTabIndex: idx });
    }
  }

  const flush = useCallback((snap: Snapshot) => {
    const bySpace = new Map<string, Tab[]>();
    for (const t of snap.tabs) {
      const arr = bySpace.get(t.spaceId);
      if (arr) arr.push(t);
      else bySpace.set(t.spaceId, [t]);
    }

    for (const [spaceId, spaceTabs] of bySpace) {
      const serialized = serializeSpace(spaceTabs, snap.groups);
      const prev = last.current.get(spaceId);
      let activeTabIndex = prev?.activeTabIndex ?? 0;
      if (spaceId === snap.activeSpaceId) {
        const idx = spaceTabs
          .filter(isSerializableTab)
          .findIndex((t) => t.id === snap.activeId);
        if (idx >= 0) activeTabIndex = idx;
      }
      const json = JSON.stringify(serialized);
      if (
        prev &&
        prev.json === json &&
        prev.activeTabIndex === activeTabIndex
      ) {
        continue;
      }
      last.current.set(spaceId, { json, activeTabIndex });
      void saveState(spaceId, { ...serialized, activeTabIndex });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const snap: Snapshot = { tabs, groups, activeId, activeSpaceId };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      flush(snap);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tabs, groups, activeId, activeSpaceId, enabled, flush]);

  useEffect(() => {
    if (!enabled) return;
    const onLeave = () => flush(latest.current);
    const unsubscribeHidden = subscribeWindowHidden((hidden) => {
      if (hidden) flush(latest.current);
    });
    window.addEventListener("blur", onLeave);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      unsubscribeHidden();
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("beforeunload", onLeave);
      flush(latest.current);
    };
  }, [enabled, flush]);
}
