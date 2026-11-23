// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InlineRename } from "./InlineRename";

const noop = () => {};

describe("InlineRename", () => {
  afterEach(cleanup);

  it("keeps renaming a space as before: its label and no length limit", () => {
    render(<InlineRename initial="Work" onCommit={noop} onCancel={noop} />);
    const input = screen.getByRole("textbox", { name: "Rename space" });
    expect(input.hasAttribute("maxlength")).toBe(false);
  });

  it("takes a custom label and length limit", () => {
    render(
      <InlineRename
        initial=""
        label="Rename group"
        maxLength={32}
        onCommit={noop}
        onCancel={noop}
      />,
    );
    const input = screen.getByRole("textbox", {
      name: "Rename group",
    }) as HTMLInputElement;
    expect(input.maxLength).toBe(32);
  });
});
