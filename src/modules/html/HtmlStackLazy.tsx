import { lazy, Suspense } from "react";
import type { ComponentProps } from "react";
import type { HtmlStack as HtmlStackType } from "./HtmlStack";

const HtmlStackInner = lazy(() =>
  import("./HtmlStack").then((m) => ({ default: m.HtmlStack })),
);

type Props = ComponentProps<typeof HtmlStackType>;

export function HtmlStack(props: Props) {
  return (
    <Suspense fallback={null}>
      <HtmlStackInner {...props} />
    </Suspense>
  );
}
