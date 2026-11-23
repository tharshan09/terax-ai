// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupClosePlan } from "@/modules/tabs";
import { CloseDialogs } from "./CloseDialogs";

const noop = () => {};

function renderDialogs(plan: GroupClosePlan | null) {
  const onCancelGroupClose = vi.fn();
  const onConfirmGroupClose = vi.fn();
  render(
    <CloseDialogs
      tabs={[]}
      pendingCloseTab={null}
      onCancelClose={noop}
      onConfirmClose={noop}
      pendingTerminalCloseTab={null}
      onCancelTerminalClose={noop}
      onConfirmTerminalClose={noop}
      pendingDeleteTabs={null}
      onCancelDeleteClose={noop}
      onConfirmDeleteClose={noop}
      pendingGroupClose={plan}
      onCancelGroupClose={onCancelGroupClose}
      onConfirmGroupClose={onConfirmGroupClose}
      pendingAppClose={null}
      onCancelAppClose={noop}
      onConfirmAppClose={noop}
    />,
  );
  return { onCancelGroupClose, onConfirmGroupClose };
}

const plan3: GroupClosePlan = {
  groupId: "g1",
  memberIds: [2, 3, 4],
  n: 3,
  m: 2,
};
const plan1: GroupClosePlan = { groupId: "g1", memberIds: [3], n: 1, m: 1 };

describe("group close dialog", () => {
  afterEach(cleanup);

  it("is absent without a pending group close", () => {
    renderDialogs(null);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("names the tab count and the affected count", () => {
    renderDialogs(plan3);
    expect(screen.getByText("Close 3 tabs?")).toBeTruthy();
    expect(
      screen.getByText(
        "2 of them still have a running process or unsaved changes.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close group" })).toBeTruthy();
  });

  it("uses the singular for one tab", () => {
    renderDialogs(plan1);
    expect(screen.getByText("Close 1 tab?")).toBeTruthy();
    expect(
      screen.getByText(
        "1 of them still has a running process or unsaved changes.",
      ),
    ).toBeTruthy();
  });

  it("cancels on Cancel", () => {
    const { onCancelGroupClose, onConfirmGroupClose } = renderDialogs(plan3);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancelGroupClose).toHaveBeenCalled();
    expect(onConfirmGroupClose).not.toHaveBeenCalled();
  });

  it("cancels on Escape", () => {
    const { onCancelGroupClose, onConfirmGroupClose } = renderDialogs(plan3);
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onCancelGroupClose).toHaveBeenCalled();
    expect(onConfirmGroupClose).not.toHaveBeenCalled();
  });

  it("confirms on Close group", () => {
    const { onConfirmGroupClose } = renderDialogs(plan3);
    fireEvent.click(screen.getByRole("button", { name: "Close group" }));
    expect(onConfirmGroupClose).toHaveBeenCalledTimes(1);
  });
});
