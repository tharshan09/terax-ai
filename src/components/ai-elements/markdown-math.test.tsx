// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { Streamdown } from "streamdown";
import { afterEach, describe, expect, it } from "vitest";
import { mathPlugin } from "./markdown-math";

afterEach(cleanup);

// Renders markdown exactly the way MarkdownPreviewPane / MessageResponse do —
// through Streamdown with the shared math plugin — and asserts KaTeX actually
// produces math markup. Guards the "does math render at all" path that the
// type-checker and the bundle test can't see.
function renderMarkdown(md: string) {
  return render(<Streamdown plugins={{ math: mathPlugin }}>{md}</Streamdown>);
}

describe("mathPlugin (KaTeX in Streamdown)", () => {
  it("renders inline $...$ math to KaTeX markup", () => {
    const { container } = renderMarkdown("Energy is $E=mc^2$ today.");
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("renders block $$...$$ math to KaTeX markup", () => {
    const { container } = renderMarkdown("$$\\int_0^1 x^2\\,dx$$");
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("leaves prose without math untouched", () => {
    const { container } = renderMarkdown("Just plain text, no math here.");
    expect(container.querySelector(".katex")).toBeNull();
    expect(container.textContent).toContain("Just plain text");
  });
});
