import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, type PluginOption, type UserConfig } from "vite";
import Inspect from "vite-plugin-inspect";

const host = process.env.TAURI_DEV_HOST;

// Bundle/treemap analysis is opt-in: `ANALYZE=true pnpm build` emits stats.html.
const analyze = process.env.ANALYZE === "true";

// Module-graph inspector is opt-in via `pnpm dev:inspect`; keeps plain
// `pnpm dev` from paying its transform-tracking overhead on every run.
const inspectGraph = process.env.INSPECT === "true";

// Resolved from the last `node_modules/` segment so pnpm's nested layout yields
// the real package; substring tests like `/react/` also match `@ai-sdk/react`.
function packageOf(id: string): string | null {
  const m = id.match(/.*node_modules\/((?:@[^/]+\/)?[^/]+)/);
  return m ? m[1] : null;
}

const EAGER_REACT_PACKAGES = new Set([
  "react",
  "react-dom",
  "scheduler",
  "@hugeicons/react",
  // Used by `cn()` on nearly every eager component; unpinned, a feature chunk
  // absorbs them (observed: streamdown) and drags itself into the eager graph.
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
]);

function eagerChunk(id: string): string | null {
  // Every lazy importer pulls Vite's preload helper; left unpinned it lands in
  // a heavy feature chunk (observed: streamdown) and drags that chunk eager.
  if (id.includes("vite/preload-helper") || id.includes("/vite/dist/"))
    return "react";

  const pkg = packageOf(id);
  if (!pkg) return null;
  if (EAGER_REACT_PACKAGES.has(pkg)) return "react";
  if (pkg === "radix-ui" || pkg.startsWith("@radix-ui/")) return "radix";
  if (pkg === "xterm" || pkg.startsWith("@xterm/")) return "xterm";
  return null;
}

const AI_PROVIDER_CHUNKS: Record<string, string> = {
  "@ai-sdk/anthropic": "ai-anthropic",
  "@ai-sdk/google": "ai-google",
  "@ai-sdk/openai-compatible": "ai-openai-compat",
  "@ai-sdk/openai": "ai-openai",
  "@ai-sdk/cerebras": "ai-cerebras",
  "@ai-sdk/groq": "ai-groq",
  "@ai-sdk/xai": "ai-xai",
};

function lazyChunk(id: string): string | null {
  const pkg = packageOf(id);
  if (!pkg) return null;

  const provider = AI_PROVIDER_CHUNKS[pkg];
  if (provider) return provider;
  if (pkg.startsWith("@ai-sdk/")) return "ai-sdk-shared";

  // Lang packs and legacy modes are imported on demand by languageResolver;
  // separate chunks keep them out of the codemirror core chunk.
  {
    const m = id.match(/@codemirror\/lang-([\w-]+)/);
    if (m) return `cm-lang-${m[1]}`;
  }
  {
    const m = id.match(/@codemirror\/legacy-modes\/mode\/([\w-]+)/);
    if (m) return `cm-legacy-${m[1]}`;
  }
  if (
    pkg.startsWith("@codemirror/") ||
    pkg.startsWith("@uiw/codemirror") ||
    pkg.startsWith("@replit/codemirror")
  )
    return "codemirror";
  if (pkg === "streamdown" || pkg.startsWith("@streamdown/"))
    return "streamdown";

  return null;
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }): Promise<UserConfig> => ({
  plugins: [
    babel({
      presets: [reactCompilerPreset({ target: "19" })],
    }),
    react(),
    tailwindcss(),
    // Module-graph inspector at /__inspect (who-imports-what, per-plugin
    // transforms). Opt-in via `pnpm dev:inspect`, never in a production build.
    ...(mode === "development" && inspectGraph
      ? [Inspect() as PluginOption]
      : []),
    ...(analyze
      ? [
          (await import("rollup-plugin-visualizer")).visualizer({
            filename: "stats.html",
            template: "treemap",
            gzipSize: true,
            brotliSize: true,
            open: true,
          }) as PluginOption,
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome120" : "es2022",
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
        settings: path.resolve(__dirname, "settings.html"),
      },
      // Oxc drops `debugger` by default. These calls return undefined, so
      // marking them pure lets DCE strip them from production builds.
      treeshake: {
        manualPureFunctions: [
          "console.debug",
          "console.info",
          "console.trace",
        ],
      },
      output: {
        // Eager outranks lazy so shared runtime lands in eager chunks; with one
        // group `ai-sdk-shared` captured React and both windows preloaded the AI SDK.
        codeSplitting: {
          groups: [
            { name: eagerChunk, priority: 100 },
            { name: lazyChunk, priority: 0 },
          ],
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
