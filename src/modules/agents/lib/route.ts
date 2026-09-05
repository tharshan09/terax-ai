import { usePreferencesStore } from "@/modules/settings/preferences";
import { showAgentToast } from "../components/AgentToast";
import { useAgentStore } from "../store/agentStore";
import { resolveAgentNotificationDelivery } from "./delivery";
import { createAgentNotificationGate } from "./notificationGate";
import { osNotify } from "./notify";
import { playAgentNotificationSound } from "./sound";
import type { AgentSource, NotificationKind } from "./types";

const shouldDeliver = createAgentNotificationGate();

type RouteArgs = {
  source: AgentSource;
  agent: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  focused: boolean;
  /** True when the user is currently looking at this agent. */
  visible: boolean;
  /** Allow an in-app toast when focused but not looking at the agent. */
  allowToast: boolean;
  tabId?: number;
  leafId?: number;
  onActivate: () => void;
};

export function routeAgentNotification({
  source,
  agent,
  kind,
  title,
  body,
  focused,
  visible,
  allowToast,
  tabId = 0,
  leafId = 0,
  onActivate,
}: RouteArgs): void {
  const preferences = usePreferencesStore.getState();
  if (!preferences.agentNotifications) return;
  // "finished" fires on every turn end; unless the user opted into finish
  // alerts it only lands in the bell. Attention always alerts.
  const alerts = kind !== "finished" || preferences.agentNotifyOnFinish;
  let delivery = resolveAgentNotificationDelivery({
    focused,
    visible,
    allowToast: allowToast && alerts,
    notifyWhenFocused: preferences.agentNotifyWhenFocused,
  });
  if (!alerts && delivery !== "none") delivery = "bell";
  if (delivery === "none") return;

  // The bell keeps every event; the cooldown only coalesces alerts.
  useAgentStore.getState().pushNotification({ source, agent, kind, tabId, leafId });
  if (!shouldDeliver({ source, agent, kind, tabId, leafId })) return;

  if (delivery === "native") {
    void osNotify(title, body ?? agent).then((result) => {
      if (
        result === "requested" &&
        usePreferencesStore.getState().agentNotificationSound
      ) {
        playAgentNotificationSound();
      }
    });
    // Frontmost Terax: an attention banner alone offers no way to jump to the
    // agent, so pair it with the toast. Finished turns stay banner-only.
    if (focused && allowToast && kind === "attention") {
      showAgentToast({ agent, title, body, onActivate });
    }
    return;
  }
  if (delivery === "toast") {
    if (preferences.agentNotificationSound) playAgentNotificationSound();
    showAgentToast({ agent, title, body, onActivate });
  }
}
