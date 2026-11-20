import { Spinner } from "@/components/ui/spinner";
import {
  pendingUploadCount,
  uploadHint,
} from "@/modules/terminal/lib/terminalUpload";
import { useTerminalUploadStore } from "@/modules/terminal/lib/uploadStore";

export function UploadHint({ leafId }: { leafId: number }) {
  const pending = useTerminalUploadStore((s) =>
    pendingUploadCount(s.queues, leafId),
  );
  const text = uploadHint(pending);
  if (text === null) return null;
  return (
    <div
      data-testid="terminal-upload-hint"
      role="status"
      className="pointer-events-none absolute right-2 bottom-2 z-20 flex select-none items-center gap-1.5 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm"
    >
      <Spinner role="presentation" aria-hidden className="size-3" />
      {text}
    </div>
  );
}
