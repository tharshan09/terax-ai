import { describe, expect, it } from "vitest";
import { resolveAgentNotificationDelivery } from "./delivery";

describe("resolveAgentNotificationDelivery", () => {
  it("stays silent while the user is looking at the agent", () => {
    expect(
      resolveAgentNotificationDelivery({
        focused: true,
        visible: true,
        allowToast: true,
      }),
    ).toBe("none");
  });

  it("uses a native alert while Terax is unfocused", () => {
    expect(
      resolveAgentNotificationDelivery({
        focused: false,
        visible: false,
        allowToast: true,
      }),
    ).toBe("native");
  });

  it("uses an in-app toast for a hidden agent", () => {
    expect(
      resolveAgentNotificationDelivery({
        focused: true,
        visible: false,
        allowToast: true,
      }),
    ).toBe("toast");
  });

  it("keeps quiet updates in the notification bell", () => {
    expect(
      resolveAgentNotificationDelivery({
        focused: true,
        visible: false,
        allowToast: false,
      }),
    ).toBe("bell");
  });

  it("promotes a hidden agent to a native alert when asked to notify while focused", () => {
    expect(
      resolveAgentNotificationDelivery({
        focused: true,
        visible: false,
        allowToast: true,
        notifyWhenFocused: true,
      }),
    ).toBe("native");
    expect(
      resolveAgentNotificationDelivery({
        focused: true,
        visible: false,
        allowToast: false,
        notifyWhenFocused: true,
      }),
    ).toBe("native");
  });

  it("never alerts for the agent on screen, even when notifying while focused", () => {
    expect(
      resolveAgentNotificationDelivery({
        focused: true,
        visible: true,
        allowToast: true,
        notifyWhenFocused: true,
      }),
    ).toBe("none");
  });
});
