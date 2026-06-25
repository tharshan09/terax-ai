import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import type { MathPlugin } from "streamdown";
import "katex/dist/katex.min.css";

// KaTeX math for Streamdown ($inline$ and $$block$$), supplied via the
// `plugins` API so it is APPENDED to Streamdown's default remark/rehype chain
// (GFM, rehype-sanitize, rehype-harden) rather than replacing it — passing the
// raw `remarkPlugins`/`rehypePlugins` props would drop those security defaults.
//
// Heavy: pulls in katex + its CSS. Only imported by the markdown preview pane
// and the chat message renderer, both already behind lazy() boundaries, so it
// stays out of the eager startup bundle (asserted by eager-budget.test.ts).
export const mathPlugin: MathPlugin = {
  name: "katex",
  type: "math",
  remarkPlugin: remarkMath,
  rehypePlugin: rehypeKatex,
};
