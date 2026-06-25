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

  // The math plugin is supplied via Streamdown's `plugins` API specifically so
  // it APPENDS to the default remark/rehype chain (incl. rehype-sanitize /
  // rehype-harden) rather than replacing it. This guards that invariant: if a
  // future change dropped sanitization, raw HTML / javascript: would survive.
  it("still sanitizes HTML and javascript: links when math is active", () => {
    const dirty =
      "Math $x^2$ and <script>globalThis.__pwned = 1</script> then " +
      "[evil](javascript:globalThis.__pwned=1) and ![x](javascript:alert(1)).";
    const { container } = renderMarkdown(dirty);

    // Math still renders…
    expect(container.querySelector(".katex")).not.toBeNull();
    // …but the script element is stripped and never ran…
    expect(container.querySelector("script")).toBeNull();
    expect(
      (globalThis as { __pwned?: unknown }).__pwned,
    ).toBeUndefined();
    // …and no javascript: URL survives on a link or image.
    const urls = [
      ...[...container.querySelectorAll("a")].map((a) => a.getAttribute("href")),
      ...[...container.querySelectorAll("img")].map((i) => i.getAttribute("src")),
    ];
    expect(
      urls.some((u) => (u ?? "").toLowerCase().includes("javascript:")),
    ).toBe(false);
  });
});
