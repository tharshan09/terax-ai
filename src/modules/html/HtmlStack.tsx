import { cn } from "@/lib/utils";
import type { HtmlTab, Tab } from "@/modules/tabs";
import { HtmlPreviewPane } from "./HtmlPreviewPane";

type Props = {
  tabs: Tab[];
  activeId: number;
  onSetDocView: (id: number, mode: "rendered" | "raw") => void;
};

export function HtmlStack({ tabs, activeId, onSetDocView }: Props) {
  const htmls = tabs.filter(
    (t): t is HtmlTab => t.kind === "html" && !t.cold,
  );
  if (htmls.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {htmls.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn(
              "absolute inset-0",
              !visible && "invisible pointer-events-none",
            )}
            aria-hidden={!visible}
          >
            <HtmlPreviewPane
              path={t.path}
              workspace={t.workspace}
              visible={visible}
              onSetView={(mode) => onSetDocView(t.id, mode)}
            />
          </div>
        );
      })}
    </div>
  );
}
