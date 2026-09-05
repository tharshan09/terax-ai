export type AgentNotificationDelivery = "none" | "native" | "toast" | "bell";

/**
 * Where an agent alert goes. `visible` means the user is looking at that agent
 * right now (its tab is the active one), so nothing fires. Unfocused Terax
 * always gets a native notification. Focused-but-hidden is the interesting
 * case: with many sessions across spaces the in-app toast alone is easy to
 * miss, so `notifyWhenFocused` promotes it to a native alert as well.
 */
export function resolveAgentNotificationDelivery({
  focused,
  visible,
  allowToast,
  notifyWhenFocused = false,
}: {
  focused: boolean;
  visible: boolean;
  allowToast: boolean;
  notifyWhenFocused?: boolean;
}): AgentNotificationDelivery {
  if (focused && visible) return "none";
  if (!focused) return "native";
  if (notifyWhenFocused) return "native";
  return allowToast ? "toast" : "bell";
}
