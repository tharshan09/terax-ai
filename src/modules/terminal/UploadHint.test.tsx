// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_UPLOAD_QUEUES,
  enqueueUpload,
} from "@/modules/terminal/lib/terminalUpload";
import { useTerminalUploadStore } from "@/modules/terminal/lib/uploadStore";

vi.mock("@/modules/settings/preferences", () => ({
  usePreferencesStore: () => undefined,
}));

import { UploadHint } from "@/modules/terminal/PaneTreeView";

afterEach(() => {
  cleanup();
  useTerminalUploadStore.setState({ queues: EMPTY_UPLOAD_QUEUES });
});

describe("UploadHint", () => {
  it("shows the open upload count of its own pane only, without taking pointer events", () => {
    useTerminalUploadStore.setState({
      queues: enqueueUpload(EMPTY_UPLOAD_QUEUES, 7, {
        id: 1,
        files: ["a.png", "b.pdf"],
      }),
    });
    const { container } = render(
      <>
        <div data-pane-leaf="7">
          <UploadHint leafId={7} />
        </div>
        <div data-pane-leaf="8">
          <UploadHint leafId={8} />
        </div>
      </>,
    );
    const seven = container.querySelectorAll(
      '[data-pane-leaf="7"] [data-testid="terminal-upload-hint"]',
    );
    expect(seven).toHaveLength(1);
    expect(seven[0].textContent).toBe("Uploading 2 files...");
    expect(seven[0].className).toContain("pointer-events-none");
    expect(seven[0].className).toContain("right-2");
    expect(seven[0].className).toContain("bottom-2");
    expect(
      container.querySelectorAll(
        '[data-pane-leaf="8"] [data-testid="terminal-upload-hint"]',
      ),
    ).toHaveLength(0);
  });

  it("disappears once nothing is open", () => {
    const { container } = render(<UploadHint leafId={7} />);
    expect(container.innerHTML).toBe("");
  });
});
