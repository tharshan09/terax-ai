import { cn } from "@/lib/utils";
import type { PreviewTab, Tab } from "@/modules/tabs";
import { memo, useEffect, useMemo, useRef } from "react";
import { PreviewPane, type PreviewPaneHandle } from "./PreviewPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  onUrlChange: (id: number, url: string) => void;
  registerHandle: (id: number, handle: PreviewPaneHandle | null) => void;
};

type PreviewTabLayerProps = {
  tab: PreviewTab;
  visible: boolean;
  setRef: (h: PreviewPaneHandle | null) => void;
  onUrlChange: (url: string) => void;
};

/**
 * One keep-alive layer per preview tab. Memoized so a bare `activeId` switch
 * only re-renders the two tabs whose visibility flips; every other layer bails
 * on the shallow prop compare. Callbacks are resolved per-id (and cached) in the
 * parent, so they keep identity across a switch.
 */
const PreviewTabLayer = memo(function PreviewTabLayer({
  tab,
  visible,
  setRef,
  onUrlChange,
}: PreviewTabLayerProps) {
  return (
    <div
      className={cn(
        "absolute inset-0",
        !visible && "invisible pointer-events-none",
      )}
      aria-hidden={!visible}
    >
      <PreviewPane
        ref={setRef}
        url={tab.url}
        visible={visible}
        onUrlChange={onUrlChange}
      />
    </div>
  );
});

function PreviewStackInner({
  tabs,
  activeId,
  onUrlChange,
  registerHandle,
}: Props) {
  const previews = useMemo(
    () => tabs.filter((t): t is PreviewTab => t.kind === "preview" && !t.cold),
    [tabs],
  );

  const registerRef = useRef(registerHandle);
  const urlChangeRef = useRef(onUrlChange);
  useEffect(() => {
    registerRef.current = registerHandle;
  }, [registerHandle]);
  useEffect(() => {
    urlChangeRef.current = onUrlChange;
  }, [onUrlChange]);

  const refCallbacks = useRef(
    new Map<number, (h: PreviewPaneHandle | null) => void>(),
  );
  const urlCallbacks = useRef(new Map<number, (url: string) => void>());

  const getRefCallback = (id: number) => {
    let cb = refCallbacks.current.get(id);
    if (!cb) {
      cb = (h: PreviewPaneHandle | null) => registerRef.current(id, h);
      refCallbacks.current.set(id, cb);
    }
    return cb;
  };
  const getUrlCallback = (id: number) => {
    let cb = urlCallbacks.current.get(id);
    if (!cb) {
      cb = (url: string) => urlChangeRef.current(id, url);
      urlCallbacks.current.set(id, cb);
    }
    return cb;
  };

  useEffect(() => {
    const live = new Set(previews.map((t) => t.id));
    for (const id of refCallbacks.current.keys()) {
      if (!live.has(id)) refCallbacks.current.delete(id);
    }
    for (const id of urlCallbacks.current.keys()) {
      if (!live.has(id)) urlCallbacks.current.delete(id);
    }
  }, [previews]);

  if (previews.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {previews.map((t) => (
        <PreviewTabLayer
          key={t.id}
          tab={t}
          visible={t.id === activeId}
          setRef={getRefCallback(t.id)}
          onUrlChange={getUrlCallback(t.id)}
        />
      ))}
    </div>
  );
}

export const PreviewStack = memo(PreviewStackInner);
