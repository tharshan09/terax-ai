import { cn } from "@/lib/utils";
import {
  previewHeaderModel,
  rawHeaderSurface,
} from "@/modules/doc/lib/previewHeader";
import { PreviewHeader } from "@/modules/doc/PreviewHeader";
import { OpenInBrowserButton } from "@/modules/preview-server/OpenInBrowserButton";
import type { EditorTab, Tab } from "@/modules/tabs";
import { usePaneFrameClass, ZenToggleButton } from "@/modules/zen";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorPane, type EditorPaneHandle } from "./EditorPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  onDirtyChange: (id: number, dirty: boolean) => void;
  registerHandle: (id: number, handle: EditorPaneHandle | null) => void;
  onCloseTab: (id: number) => void;
  onSetDocView: (id: number, mode: "rendered" | "raw") => void;
};

type EditorTabLayerProps = {
  tab: EditorTab;
  visible: boolean;
  setRef: (h: EditorPaneHandle | null) => void;
  onDirty: (dirty: boolean) => void;
  onClose: () => void;
  onSetDocView: (id: number, mode: "rendered" | "raw") => void;
};

/**
 * One keep-alive layer per editor tab. Memoized so a bare `activeId` switch only
 * re-renders the two tabs whose visibility flips; every other layer bails on the
 * shallow prop compare. The `setRef`/`onDirty`/`onClose` callbacks are resolved
 * per-id (and cached) in the parent, so they keep identity across a switch.
 */
const EditorTabLayer = memo(function EditorTabLayer({
  tab,
  visible,
  setRef,
  onDirty,
  onClose,
  onSetDocView,
}: EditorTabLayerProps) {
  const setView = useCallback(
    (mode: "rendered" | "raw") => onSetDocView(tab.id, mode),
    [onSetDocView, tab.id],
  );
  const frameClass = usePaneFrameClass();
  const surface = rawHeaderSurface(tab.path);
  // Reload rebuilds the editor through its key; it is done once the new
  // editor has read the file. Locked while the buffer has unsaved changes.
  const [editorKey, setEditorKey] = useState(0);
  const [reloading, setReloading] = useState(false);
  const reload = useCallback(() => {
    if (tab.dirty) return;
    setReloading(true);
    setEditorKey((k) => k + 1);
  }, [tab.dirty]);
  const loaded = useCallback(() => setReloading(false), []);
  return (
    <div
      className={cn(
        "absolute inset-0",
        !visible && "invisible pointer-events-none",
      )}
      aria-hidden={!visible}
    >
      <div
        className={cn(
          "relative flex h-full flex-col overflow-hidden bg-background",
          frameClass,
        )}
      >
        {surface && (
          <PreviewHeader
            model={previewHeaderModel({
              surface,
              path: tab.path,
              workspace: tab.workspace,
              dirty: tab.dirty,
            })}
            onSetView={setView}
            onReload={reload}
            reloading={reloading}
            openInBrowser={
              <OpenInBrowserButton path={tab.path} workspace={tab.workspace} />
            }
            zen={<ZenToggleButton />}
          />
        )}
        <div className="min-h-0 flex-1">
          <EditorPane
            key={editorKey}
            ref={setRef}
            path={tab.path}
            workspace={tab.workspace}
            overrideLanguage={tab.overrideLanguage}
            onDirtyChange={onDirty}
            onClose={onClose}
            onLoaded={loaded}
            visible={visible}
          />
        </div>
      </div>
    </div>
  );
});

function EditorStackInner({
  tabs,
  activeId,
  onDirtyChange,
  registerHandle,
  onCloseTab,
  onSetDocView,
}: Props) {
  const editors = useMemo(
    () => tabs.filter((t): t is EditorTab => t.kind === "editor" && !t.cold),
    [tabs],
  );

  // Stable per-tab callbacks. Inline arrows in `ref` and `onDirtyChange`
  // change identity every render, which makes React detach+reattach the ref
  // callback and re-invoke `onDirtyChange`, triggering setState loops in
  // the parent. Memoizing per id keeps each callback's identity stable.
  const registerRef = useRef(registerHandle);
  const dirtyRef = useRef(onDirtyChange);
  const closeRef = useRef(onCloseTab);

  useEffect(() => {
    registerRef.current = registerHandle;
  }, [registerHandle]);
  useEffect(() => {
    dirtyRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    closeRef.current = onCloseTab;
  }, [onCloseTab]);

  const refCallbacks = useRef(
    new Map<number, (h: EditorPaneHandle | null) => void>(),
  );
  const dirtyCallbacks = useRef(new Map<number, (dirty: boolean) => void>());
  const closeCallbacks = useRef(new Map<number, () => void>());

  const getRefCallback = (id: number) => {
    let cb = refCallbacks.current.get(id);
    if (!cb) {
      cb = (h: EditorPaneHandle | null) => registerRef.current(id, h);
      refCallbacks.current.set(id, cb);
    }
    return cb;
  };
  const getDirtyCallback = (id: number) => {
    let cb = dirtyCallbacks.current.get(id);
    if (!cb) {
      cb = (dirty: boolean) => dirtyRef.current(id, dirty);
      dirtyCallbacks.current.set(id, cb);
    }
    return cb;
  };
  const getCloseCallback = (id: number) => {
    let cb = closeCallbacks.current.get(id);
    if (!cb) {
      cb = () => closeRef.current(id);
      closeCallbacks.current.set(id, cb);
    }
    return cb;
  };

  // Drop callback entries for closed tabs to avoid unbounded growth.
  useEffect(() => {
    const live = new Set(editors.map((t) => t.id));
    for (const id of refCallbacks.current.keys()) {
      if (!live.has(id)) refCallbacks.current.delete(id);
    }
    for (const id of dirtyCallbacks.current.keys()) {
      if (!live.has(id)) dirtyCallbacks.current.delete(id);
    }
    for (const id of closeCallbacks.current.keys()) {
      if (!live.has(id)) closeCallbacks.current.delete(id);
    }
  }, [editors]);

  if (editors.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {editors.map((t) => (
        <EditorTabLayer
          key={t.id}
          tab={t}
          visible={t.id === activeId}
          setRef={getRefCallback(t.id)}
          onDirty={getDirtyCallback(t.id)}
          onClose={getCloseCallback(t.id)}
          onSetDocView={onSetDocView}
        />
      ))}
    </div>
  );
}

export const EditorStack = memo(EditorStackInner);
