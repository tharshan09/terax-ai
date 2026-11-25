import { basename } from "@/lib/utils";
import type { WorkspaceEnv } from "@/modules/workspace";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import type { BrowserOpen } from "../types";
import { browserCallFailedText, browserOpenText } from "./browserOpenText";

/**
 * "Open in Browser" for one file: calls `preview_open_in_browser` and shows a
 * toast for every answer other than `opened`, and for a failed call. Resolves
 * once the toast (if any) is shown; never rejects and returns nothing.
 */
export async function openInBrowser(
  path: string,
  workspace: WorkspaceEnv | undefined,
): Promise<void> {
  const name = basename(path);
  let text: string | null;
  try {
    const answer = await invoke<BrowserOpen>("preview_open_in_browser", {
      path,
      workspace,
    });
    text = browserOpenText(
      answer,
      name,
      workspace?.kind === "ssh" ? workspace.host : null,
    );
  } catch (e) {
    text = browserCallFailedText(String(e));
  }
  if (text) toast.error(text);
}
