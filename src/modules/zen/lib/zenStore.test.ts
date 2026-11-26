import { describe, expect, it } from "vitest";
import { useZenStore } from "./zenStore";

describe("useZenStore", () => {
  it("[AC-1] starts zen_off and follows enter, toggle, toggle, exit, exit", () => {
    // Nothing in this file touched the store yet: this is the fresh store.
    expect(useZenStore.getState().on).toBe(false);
    expect(useZenStore.getInitialState().on).toBe(false);

    const seen: boolean[] = [];
    const { enterZen, toggleZen, exitZen } = useZenStore.getState();
    enterZen();
    seen.push(useZenStore.getState().on);
    toggleZen();
    seen.push(useZenStore.getState().on);
    toggleZen();
    seen.push(useZenStore.getState().on);
    exitZen();
    seen.push(useZenStore.getState().on);
    exitZen();
    seen.push(useZenStore.getState().on);

    expect(seen).toEqual([true, false, true, false, false]);
  });

  it("[AC-1] enterZen twice stays on and exitZen while off notifies nobody", () => {
    useZenStore.setState({ on: false });
    let notified = 0;
    const unsub = useZenStore.subscribe(() => {
      notified += 1;
    });
    useZenStore.getState().exitZen();
    expect(notified).toBe(0);
    useZenStore.getState().enterZen();
    useZenStore.getState().enterZen();
    expect(useZenStore.getState().on).toBe(true);
    expect(notified).toBe(1);
    unsub();
    useZenStore.setState({ on: false });
  });
});
