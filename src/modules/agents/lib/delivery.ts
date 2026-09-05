export type AgentNotificationDelivery = "none" | "native" | "toast" | "bell";

/** Focused-but-hidden is the interesting case: with many sessions across
 *  spaces the toast alone is easy to miss, so `notifyWhenFocused` promotes it. */
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
