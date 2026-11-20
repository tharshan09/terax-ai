import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { isLoopbackHost } from "@/lib/loopback";
import {
  portsAvailable,
  portsScope,
  rowViews,
  usePortsStore,
} from "@/modules/ports";
import { useWorkspaceEnvStore } from "@/modules/workspace";
import {
  ArrowReloadHorizontalIcon,
  Globe02Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

type PortPreset = {
  port: number;
  label: string;
  hint: string;
};

// Curated dev-server ports. Ordered by frontend frequency, then backend.
const PORT_PRESETS: readonly PortPreset[] = [
  { port: 5173, label: "Vite", hint: "vite, sveltekit" },
  { port: 5174, label: "Vite (alt)", hint: "second vite instance" },
  { port: 3000, label: "Next.js", hint: "next, express, rails" },
  { port: 3001, label: "Next.js (alt)", hint: "second next instance" },
  { port: 4173, label: "Vite preview", hint: "vite preview" },
  { port: 4200, label: "Angular", hint: "angular cli" },
  { port: 4321, label: "Astro", hint: "astro" },
  { port: 5500, label: "Live Server", hint: "vscode live server" },
  { port: 6006, label: "Storybook", hint: "storybook" },
  { port: 8080, label: "Webpack", hint: "webpack, vue cli" },
  { port: 8081, label: "Metro", hint: "react native metro" },
  { port: 8000, label: "Django / FastAPI", hint: "django, fastapi" },
  { port: 8888, label: "Jupyter", hint: "jupyter notebook" },
  { port: 5000, label: "Flask", hint: "flask" },
  { port: 7860, label: "Gradio", hint: "gradio" },
  { port: 11434, label: "Ollama", hint: "ollama api" },
];

export type PreviewAddressBarHandle = {
  focus: () => void;
};

type Props = {
  url: string;
  onSubmit: (url: string) => void;
  onReload: () => void;
};

export const PreviewAddressBar = forwardRef<PreviewAddressBarHandle, Props>(
  function PreviewAddressBar({ url, onSubmit, onReload }, ref) {
    const [draft, setDraft] = useState(url);
    const inputRef = useRef<HTMLInputElement>(null);
    const env = useWorkspaceEnvStore((s) => s.env);
    const remote = portsAvailable(env);

    // Keep the draft in sync when the parent changes the URL from outside
    // this field.
    useEffect(() => {
      setDraft(url);
    }, [url]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          const el = inputRef.current;
          if (!el) return;
          el.focus();
          el.select();
        },
      }),
      [],
    );

    const [notice, setNotice] = useState<string | null>(null);
    const [checkingPort, setCheckingPort] = useState<number | null>(null);

    const submit = () => {
      const next = normalizeUrl(draft);
      if (!next) {
        setNotice("Enter a URL or pick a port preset.");
        return;
      }
      setNotice(null);
      if (next !== url) onSubmit(next);
      else onReload();
    };

    const tryPort = async (port: number) => {
      setNotice(null);
      setCheckingPort(port);
      const url = `http://localhost:${port}`;
      const ok = await probeUrl(url);
      setCheckingPort(null);
      if (!ok) {
        setNotice(`No server listening on :${port}.`);
        return;
      }
      setDraft(url);
      onSubmit(url);
    };

    // The forward's listener always accepts, so a probe would prove nothing.
    const openForwarded = (next: string) => {
      setNotice(null);
      setDraft(next);
      if (next !== url) onSubmit(next);
      else onReload();
    };

    return (
      <div className="shrink-0 border-b border-border/60">
      <div className="flex h-9 items-center gap-1 bg-card/40 px-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onReload}
          title="Reload"
          className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon
            icon={ArrowReloadHorizontalIcon}
            size={14}
            strokeWidth={1.75}
          />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              title={remote ? "Forwarded ports" : "Common dev-server ports"}
              className="h-7 shrink-0 gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon
                icon={Globe02Icon}
                size={13}
                strokeWidth={1.75}
              />
              <span className="hidden sm:inline">Ports</span>
            </Button>
          </DropdownMenuTrigger>
          {remote ? (
            <ForwardedPortsContent
              scope={portsScope(env)}
              onPick={openForwarded}
            />
          ) : (
            <DropdownMenuContent
              data-testid="preview-ports-menu"
              data-status="local"
              align="start"
              className="max-h-80 min-w-56 overflow-y-auto"
            >
              {PORT_PRESETS.map((p) => (
                <DropdownMenuItem
                  key={p.port}
                  onSelect={(e) => {
                    e.preventDefault();
                    void tryPort(p.port);
                  }}
                >
                  <span className="flex-1">{p.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {checkingPort === p.port ? "checking…" : `:${p.port}`}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          )}
        </DropdownMenu>
        <div className="flex min-w-0 flex-1 items-center">
          <Input
            ref={inputRef}
            value={draft}
            placeholder="http://localhost:3000"
            spellCheck={false}
            autoComplete="off"
            className="h-7 w-full bg-muted/60 px-2 text-xs placeholder:text-muted-foreground/70 focus-visible:ring-0"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(url);
                inputRef.current?.blur();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            if (url) void openUrl(url).catch(console.error);
          }}
          title="Open in system browser"
          className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          disabled={!url}
        >
          <HugeiconsIcon
            icon={LinkSquare02Icon}
            size={14}
            strokeWidth={1.75}
          />
        </Button>
      </div>
      {notice ? (
        <div className="flex items-center gap-1.5 bg-amber-500/8 px-3 py-1 text-[11px] text-amber-600 dark:text-amber-400">
          <span className="truncate">{notice}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-auto rounded px-1 text-[10px] opacity-80 hover:bg-accent hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      </div>
    );
  },
);

// UI-10 in an SSH workspace: the server's active forwards instead of presets.
function ForwardedPortsContent({
  scope,
  onPick,
}: {
  scope: string | null;
  onPick: (url: string) => void;
}) {
  const model = usePortsStore((s) => s);
  const rows = useMemo(
    () => rowViews(model, scope).filter((r) => r.status === "active"),
    [model, scope],
  );
  return (
    <DropdownMenuContent
      data-testid="preview-ports-menu"
      data-status={rows.length === 0 ? "remote-empty" : "remote-list"}
      align="start"
      className="max-h-80 min-w-56 overflow-y-auto"
    >
      {rows.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">
          No forwarded ports.
        </p>
      ) : (
        rows.map((row) => (
          <DropdownMenuItem
            key={row.remotePort}
            onSelect={() => onPick(row.url)}
            className="font-mono text-xs tabular-nums"
          >
            {row.label}
          </DropdownMenuItem>
        ))
      )}
    </DropdownMenuContent>
  );
}

async function probeUrl(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      signal: AbortSignal.timeout(900),
    });
    return true;
  } catch {
    return false;
  }
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const host = /^(\[[^\]]*\]|[^:/?#]+)(?=[:/?#]|$)/.exec(trimmed)?.[1] ?? "";
  if (isLoopbackHost(host, "preview") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host))
    return `http://${trimmed}`;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}
