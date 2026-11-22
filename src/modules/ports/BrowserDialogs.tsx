import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { writeSystemClipboard } from "@/lib/clipboard";
import { Alert02Icon, Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useRef } from "react";
import { toast } from "sonner";
import { browserGuide, browserNoticeText, type GuideStep } from "./lib/ports";
import {
  answerBrowserNotice,
  type BrowserDialog,
  closeBrowserDialog,
  useBrowserViewStore,
} from "./lib/portsStore";

// Rendered inside the ports list, so the list counts focus and clicks in a
// dialog as its own and the first Escape closes only the dialog.
export function BrowserDialogs({ scope }: { scope: string }) {
  const current = useBrowserViewStore((s) =>
    s.dialog?.scope === scope ? s.dialog : null,
  );
  // Keeps the text while the dialog fades out.
  const last = useRef<BrowserDialog | null>(null);
  if (current) last.current = current;
  const shown = current ?? last.current;

  return (
    <>
      <AlertDialog
        open={current?.kind === "notice"}
        onOpenChange={(open) => {
          if (!open) answerBrowserNotice(false);
        }}
      >
        <AlertDialogContent data-testid="view-browser-notice">
          <AlertDialogHeader>
            <AlertDialogTitle>Remote browser access</AlertDialogTitle>
            <AlertDialogDescription>
              {shown?.kind === "notice" ? browserNoticeText(shown.server) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => answerBrowserNotice(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => answerBrowserNotice(true)}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={current?.kind === "guide"}
        onOpenChange={(open) => {
          if (!open) closeBrowserDialog(scope);
        }}
      >
        {shown?.kind === "guide" ? <GuideContent dialog={shown} /> : null}
      </AlertDialog>
    </>
  );
}

function GuideContent({
  dialog,
}: {
  dialog: Extract<BrowserDialog, { kind: "guide" }>;
}) {
  const guide = useMemo(
    () =>
      browserGuide(dialog.server, {
        remotePort: dialog.remotePort,
        localPort: dialog.localPort,
      }),
    [dialog.server, dialog.remotePort, dialog.localPort],
  );

  return (
    <AlertDialogContent
      data-testid="browser-setup-guide"
      className="gap-4 data-[size=default]:max-w-[34rem] data-[size=default]:sm:max-w-[34rem]"
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{guide.title}</AlertDialogTitle>
        <AlertDialogDescription>{guide.intro}</AlertDialogDescription>
      </AlertDialogHeader>
      <ol className="flex max-h-[60vh] list-none flex-col gap-3 overflow-y-auto p-0 text-[13px] leading-snug">
        {guide.steps.map((step, i) => (
          <GuideStepItem key={step.text} index={i + 1} step={step} />
        ))}
      </ol>
      <p className="text-[12px] leading-snug text-muted-foreground">
        {guide.macPortNote}
      </p>
      <p
        data-testid="browser-setup-warning"
        className="flex gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] leading-snug text-amber-700 dark:text-amber-300"
      >
        <HugeiconsIcon
          icon={Alert02Icon}
          size={14}
          strokeWidth={1.75}
          className="mt-px shrink-0"
        />
        <span>{guide.warning}</span>
      </p>
      <AlertDialogFooter>
        <AlertDialogCancel>Close</AlertDialogCancel>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

function GuideStepItem({ index, step }: { index: number; step: GuideStep }) {
  const command = step.command;
  const copy = () => {
    if (command === null) return;
    writeSystemClipboard(command).then(
      () => toast("Copied"),
      () => toast.error("Could not copy the command"),
    );
  };

  return (
    <li data-testid="browser-setup-step" className="flex gap-2.5">
      <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">
        {index}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p>{step.text}</p>
        {command === null ? null : (
          <div className="flex flex-col gap-1">
            {step.example ? (
              <span className="text-[11px] text-muted-foreground">
                {step.example}
              </span>
            ) : null}
            <div className="flex items-start gap-1 rounded-md bg-muted/60 py-1.5 pr-1 pl-2.5">
              <code
                data-testid="browser-setup-command"
                className="min-w-0 flex-1 font-mono text-[11.5px] break-all whitespace-pre-wrap select-text"
              >
                {command}
              </code>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={copy}
                aria-label={`Copy: ${command}`}
                className="shrink-0 rounded-md"
              >
                <HugeiconsIcon icon={Copy01Icon} size={12} strokeWidth={1.75} />
                Copy
              </Button>
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
