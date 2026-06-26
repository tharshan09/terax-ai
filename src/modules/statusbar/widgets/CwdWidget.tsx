import { CwdBreadcrumb } from "../CwdBreadcrumb";
import type { StatusbarWidgetCtx } from "./context";

export function CwdWidget({ ctx }: { ctx: StatusbarWidgetCtx }) {
  return (
    <CwdBreadcrumb
      cwd={ctx.cwd}
      filePath={ctx.filePath}
      home={ctx.home}
      onCd={ctx.onCd}
    />
  );
}
