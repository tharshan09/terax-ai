// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { paneLayerOf } from "./useTerminalPaneDnd";

function layer(tabId: number, ...leafIds: number[]): HTMLElement {
  const el = document.createElement("div");
  el.dataset.tabLayer = String(tabId);
  for (const id of leafIds) {
    const leaf = document.createElement("div");
    leaf.dataset.paneLeaf = String(id);
    el.append(leaf);
  }
  document.body.append(el);
  return el;
}

describe("paneLayerOf", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("names the tab a pane belongs to", () => {
    const a = layer(1, 10, 11);
    expect(paneLayerOf(a.children[0])).toBe("1");
    expect(paneLayerOf(a)).toBe("1");
  });

  it("separates panes of different tabs", () => {
    // The tab and space shortcuts keep working during a drag, so another
    // tab's panes can become reachable mid-gesture. Highlighting one and then
    // doing nothing on release is the failure this guards.
    const a = layer(1, 10);
    const b = layer(2, 20);
    expect(paneLayerOf(a.children[0])).not.toBe(paneLayerOf(b.children[0]));
  });

  it("is null outside any layer", () => {
    const loose = document.createElement("div");
    document.body.append(loose);
    expect(paneLayerOf(loose)).toBeNull();
    expect(paneLayerOf(null)).toBeNull();
  });
});
