import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAgentStore } from "@/modules/agents/store/agentStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useClaudeStatsStore } from "@/modules/statusbar/lib/claudeStatsStore";

/**
 * Dev-only e2e bridge. The Rust side (test_bridge.rs, armed by the
 * TERAX_TEST_BRIDGE env var in a debug build) polls a directory for JS
 * snippets and forwards them here via the `terax-test:eval` event; the snippet
 * runs in the real webview and its JSON-serialized outcome is written back
 * through the `test_bridge_result` command. Loaded via a DEV-guarded dynamic
 * import in main.tsx, so none of this reaches a production bundle.
 *
 * Snippets run as an async function body: `return document.title;` works, and
 * so does awaiting. A few zustand stores are exposed on `window.__terax` for
 * assertions the DOM cannot answer (e.g. agent session origins).
 */
export function initTestBridge(): void {
  (window as unknown as Record<string, unknown>).__terax = {
    agentStore: useAgentStore,
    claudeStatsStore: useClaudeStatsStore,
    preferencesStore: usePreferencesStore,
  };

  void listen<{ id: string; js: string }>("terax-test:eval", async (e) => {
    const { id, js } = e.payload;
    let payload: string;
    try {
      // biome-ignore lint/security/noGlobalEval: executing the snippet IS the bridge's purpose (dev-only)
      const fn = new Function(
        `"use strict"; return (async () => { ${js} })();`,
      );
      const result = await fn();
      payload = JSON.stringify({
        ok: true,
        result: result === undefined ? null : result,
      });
    } catch (err) {
      payload = JSON.stringify({ ok: false, error: String(err) });
    }
    await invoke("test_bridge_result", { id, payload }).catch((err) =>
      console.error("[terax] test bridge result failed:", err),
    );
  });
}
