import { describe, expect, it } from "vitest";
import {
  coerceStatusbarLayout,
  DEFAULT_STATUSBAR_LAYOUT,
  moveWidget,
  moveWidgetByDelta,
  setWidgetVisible,
  STATUSBAR_WIDGETS,
  type StatusbarLayout,
} from "./layout";

// coerceStatusbarLayout is the forward-compat heart of the customizable status
// bar: it must let a widget shipped in a later release appear for users who
// saved a layout before it existed, without ever reordering or unhiding what
// they deliberately set, and without crashing on garbage from a hand-edited
// store.
describe("coerceStatusbarLayout", () => {
  it("returns the default layout for non-array / empty / garbage input", () => {
    expect(coerceStatusbarLayout(undefined)).toEqual(DEFAULT_STATUSBAR_LAYOUT);
    expect(coerceStatusbarLayout(null)).toEqual(DEFAULT_STATUSBAR_LAYOUT);
    expect(coerceStatusbarLayout("nope")).toEqual(DEFAULT_STATUSBAR_LAYOUT);
    expect(coerceStatusbarLayout([])).toEqual(DEFAULT_STATUSBAR_LAYOUT);
    expect(coerceStatusbarLayout([1, "x", {}, { id: 9 }])).toEqual(
      DEFAULT_STATUSBAR_LAYOUT,
    );
  });

  it("appends catalog widgets the saved layout never saw, at the end", () => {
    const saved = [{ id: "cwd", visible: true }];
    const out = coerceStatusbarLayout(saved);
    expect(out[0]).toEqual({ id: "cwd", visible: true });
    expect(out.map((w) => w.id).sort()).toEqual([...STATUSBAR_WIDGETS].sort());
    // Appended widgets keep their catalog default visibility.
    expect(out.find((w) => w.id === "git-changes")?.visible).toBe(false);
    expect(out.find((w) => w.id === "private")?.visible).toBe(true);
  });

  it("preserves user order and an intentional all-hidden choice", () => {
    // Every catalog widget, reversed, all hidden - a legitimate user choice.
    // Reversed (not default order) so the test proves order is preserved, and
    // derived from the catalog so it survives new widgets being added.
    const saved: StatusbarLayout = [...STATUSBAR_WIDGETS]
      .reverse()
      .map((id) => ({ id, visible: false }));
    const out = coerceStatusbarLayout(saved);
    expect(out).toEqual(saved);
    expect(out.every((w) => !w.visible)).toBe(true);
  });

  it("drops unknown and duplicate ids, keeping the first occurrence", () => {
    const saved = [
      { id: "cwd", visible: false },
      { id: "ghost-widget", visible: true },
      { id: "cwd", visible: true },
    ];
    const out = coerceStatusbarLayout(saved);
    expect(out.filter((w) => w.id === "cwd")).toEqual([
      { id: "cwd", visible: false },
    ]);
    expect(out.some((w) => (w.id as string) === "ghost-widget")).toBe(false);
  });

  it("defaults missing visibility to shown", () => {
    const out = coerceStatusbarLayout([{ id: "git-staged" }]);
    expect(out.find((w) => w.id === "git-staged")?.visible).toBe(true);
  });
});

describe("moveWidget", () => {
  const base = DEFAULT_STATUSBAR_LAYOUT;

  it("moves a widget to sit immediately before the target", () => {
    const out = moveWidget(base, "private", "cwd");
    const ids = out.map((w) => w.id);
    expect(ids.indexOf("private")).toBe(ids.indexOf("cwd") - 1);
    expect(out).toHaveLength(base.length);
  });

  it("is a no-op for same id or unknown ids", () => {
    expect(moveWidget(base, "cwd", "cwd")).toBe(base);
  });

  it("does not lose or duplicate items", () => {
    const out = moveWidget(base, "git-staged", "workspace-env");
    expect(out.map((w) => w.id).sort()).toEqual(base.map((w) => w.id).sort());
  });
});

describe("moveWidgetByDelta", () => {
  it("clamps at the ends", () => {
    const out = DEFAULT_STATUSBAR_LAYOUT;
    expect(moveWidgetByDelta(out, out[0].id, -1)).toBe(out);
    expect(moveWidgetByDelta(out, out[out.length - 1].id, 1)).toBe(out);
  });

  it("swaps neighbours", () => {
    const out = moveWidgetByDelta(DEFAULT_STATUSBAR_LAYOUT, "cwd", -1);
    expect(out[0].id).toBe("cwd");
  });
});

describe("setWidgetVisible", () => {
  it("toggles a single widget and returns the same ref when unchanged", () => {
    const next = setWidgetVisible(DEFAULT_STATUSBAR_LAYOUT, "cwd", false);
    expect(next.find((w) => w.id === "cwd")?.visible).toBe(false);
    expect(setWidgetVisible(next, "cwd", false)).toBe(next);
  });
});
