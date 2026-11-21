import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  type BrowserView,
  type BrowserViewStatus,
  browserGuide,
  browserNoticeText,
  type ChromeProbe,
  chromeOf,
  chromeProbeEnded,
  chromeProbeStarted,
  EMPTY_PORTS,
  forwardStopped,
  forwardSucceeded,
  forwardsListed,
  guidePorts,
  needsChromeProbe,
  type PortForward,
  type PortsModel,
  rowViews,
  viewOutcome,
} from "@/modules/ports/lib/ports";

const DEVBOX = "ssh:devbox";
const OTHER = "ssh:other";

function active(remotePort: number, localPort = remotePort): PortForward {
  return { remotePort, localPort, status: "active" };
}

function disconnected(remotePort: number, localPort = remotePort): PortForward {
  return { remotePort, localPort, status: "disconnected" };
}

function probed(
  m: PortsModel,
  scope: string,
  forward: PortForward,
  probe: Exclude<ChromeProbe, "probing">,
  run = 1,
): PortsModel {
  return chromeProbeEnded(
    chromeProbeStarted(m, scope, forward, run),
    scope,
    forward.remotePort,
    run,
    probe,
  );
}

describe("chrome mark per forward (AC-1, AC-2)", () => {
  it("asks a new forward once and keeps the answer across a refresh of the same forwards", () => {
    const f = active(9222, 9223);
    let m = forwardSucceeded(EMPTY_PORTS, DEVBOX, f);
    expect(needsChromeProbe(m, DEVBOX, f)).toBe(true);
    m = chromeProbeStarted(m, DEVBOX, f, 1);
    expect(chromeOf(m, DEVBOX, f)).toBe("probing");
    expect(needsChromeProbe(m, DEVBOX, f)).toBe(false);
    m = chromeProbeEnded(m, DEVBOX, 9222, 1, "chrome");
    m = forwardsListed(m, DEVBOX, [f]);
    expect(chromeOf(m, DEVBOX, f)).toBe("chrome");
    expect(needsChromeProbe(m, DEVBOX, f)).toBe(false);
  });

  it("asks again only after a failed ask, never a disconnected forward", () => {
    const f = active(9222, 9223);
    const m = probed(
      forwardsListed(EMPTY_PORTS, DEVBOX, [f]),
      DEVBOX,
      f,
      "failed",
    );
    expect(needsChromeProbe(m, DEVBOX, f)).toBe(true);
    expect(needsChromeProbe(EMPTY_PORTS, DEVBOX, disconnected(9333))).toBe(
      false,
    );
    const none = probed(EMPTY_PORTS, DEVBOX, f, "none");
    expect(needsChromeProbe(none, DEVBOX, f)).toBe(false);
  });

  it("lets the mark go with the forward, a new Mac port or a new forward", () => {
    const f = active(9222, 9223);
    const m = probed(
      forwardsListed(EMPTY_PORTS, DEVBOX, [f]),
      DEVBOX,
      f,
      "chrome",
    );
    expect(forwardStopped(m, DEVBOX, 9222).chrome).toEqual({});
    const moved = forwardsListed(m, DEVBOX, [active(9222, 9224)]);
    expect(moved.chrome).toEqual({});
    expect(chromeOf(m, DEVBOX, active(9222, 9224))).toBeNull();
    expect(forwardSucceeded(m, DEVBOX, f).chrome).toEqual({});
    expect(forwardsListed(m, DEVBOX, []).chrome).toEqual({});
  });

  it("keeps the mark of a forward that turned disconnected and of other servers", () => {
    const f = active(9333);
    let m = probed(
      forwardsListed(EMPTY_PORTS, DEVBOX, [f]),
      DEVBOX,
      f,
      "chrome",
    );
    m = probed(forwardsListed(m, OTHER, [f]), OTHER, f, "chrome");
    m = forwardsListed(m, DEVBOX, [disconnected(9333)]);
    expect(chromeOf(m, DEVBOX, disconnected(9333))).toBe("chrome");
    m = forwardsListed(m, DEVBOX, []);
    expect(chromeOf(m, OTHER, f)).toBe("chrome");
  });

  it("drops an answer for a forward asked again meanwhile", () => {
    const f = active(9222, 9223);
    let m = chromeProbeStarted(EMPTY_PORTS, DEVBOX, f, 1);
    m = chromeProbeStarted(m, DEVBOX, f, 2);
    m = chromeProbeEnded(m, DEVBOX, 9222, 1, "chrome");
    expect(chromeOf(m, DEVBOX, f)).toBe("probing");
    m = chromeProbeEnded(
      forwardStopped(m, DEVBOX, 9222),
      DEVBOX,
      9222,
      2,
      "chrome",
    );
    expect(m.chrome).toEqual({});
  });

  it("shows the mark and View browser only on Chrome rows, disabled when disconnected", () => {
    const list = [active(3000), active(9222, 9223), disconnected(9333)];
    let m = forwardsListed(EMPTY_PORTS, DEVBOX, list);
    m = probed(m, DEVBOX, list[0], "none");
    m = probed(m, DEVBOX, list[1], "chrome");
    m = probed(m, DEVBOX, list[2], "chrome");
    const rows = rowViews(m, DEVBOX, true);
    expect(
      rows.map((r) => [r.remotePort, r.chromeMark, r.actions, r.unavailable]),
    ).toEqual([
      [3000, false, ["open", "openInBrowser", "copy", "stop"], []],
      [
        9222,
        true,
        ["open", "openInBrowser", "copy", "viewBrowser", "stop"],
        [],
      ],
      [9333, false, ["retry", "stop", "viewBrowser"], ["viewBrowser"]],
    ]);
    expect(rows[1].label).toBe("9222 -> localhost:9223");
  });

  it("offers nothing of it where the platform has no browser view", () => {
    const f = active(9222, 9223);
    const m = probed(
      forwardsListed(EMPTY_PORTS, DEVBOX, [f]),
      DEVBOX,
      f,
      "chrome",
    );
    const [row] = rowViews(m, DEVBOX);
    expect(row).toMatchObject({
      chrome: null,
      chromeMark: false,
      actions: ["open", "openInBrowser", "copy", "stop"],
      unavailable: [],
    });
  });
});

describe("view outcome (AC-6, AC-7)", () => {
  const view = (
    status: BrowserViewStatus,
    reason: string | null = null,
  ): BrowserView => ({ status, remotePort: 9222, localPort: 9223, reason });

  it("shows the guide only for what the server answered", () => {
    expect(viewOutcome(view("origin_refused"))).toEqual({ kind: "guide" });
    expect(viewOutcome(view("unreachable"))).toEqual({ kind: "guide" });
  });

  it("names a failed open on this Mac with its reason, without the guide", () => {
    expect(
      viewOutcome(view("open_failed", "Unable to find application")),
    ).toEqual({
      kind: "toast",
      text: "Could not open Google Chrome: Unable to find application",
      error: true,
    });
    expect(viewOutcome(view("open_failed"))).toEqual({
      kind: "toast",
      text: "Could not open Google Chrome.",
      error: true,
    });
  });

  it("asks for Chrome, reports a missing page and ends quietly otherwise", () => {
    expect(viewOutcome(view("chrome_missing"))).toEqual({
      kind: "toast",
      text: "Google Chrome is required on this Mac to view the remote browser.",
      error: true,
    });
    expect(viewOutcome(view("no_page"))).toEqual({
      kind: "toast",
      text: "No page is open in the remote browser.",
      error: false,
    });
    expect(viewOutcome(view("opened"))).toEqual({ kind: "done" });
    expect(viewOutcome(view("forward_gone"))).toEqual({ kind: "refresh" });
  });

  it("never opens anything in a chosen app from the frontend", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const files = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const path = join(dir, e.name);
        if (e.isDirectory()) return files(path);
        return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)
          ? [path]
          : [];
      });
    const withApp = files(root).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/openUrl\(([^()]*)\)/g)]
        .filter(([, args]) => args.includes(","))
        .map(([call]) => ({
          file: relative(root, file).split(sep).join("/"),
          call: call.replace(/\s+/g, " "),
        })),
    );
    expect(withApp).toEqual([]);
    const viewerPath = files(root).filter((file) =>
      readFileSync(file, "utf8").includes("devtools/inspector.html"),
    );
    expect(viewerPath).toEqual([]);
  });
});

describe("guide (AC-8, AC-9)", () => {
  it("fills the steps with the server port and the Mac origin", () => {
    const guide = browserGuide("devbox", { remotePort: 9222, localPort: 9223 });
    expect(guide.title).toBe("Set up browser view");
    expect(guide.steps.map((s) => s.command)).toEqual([
      'google-chrome --headless=new --remote-debugging-port=9222 --user-data-dir="$HOME/.cache/terax-remote-chrome" --remote-allow-origins=http://localhost:9223',
      "claude mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222",
      "ss -ltn 'sport = :9222'",
      null,
    ]);
    expect(guide.steps.map((s) => s.example)).toEqual([
      "Example:",
      "Example for Claude Code:",
      null,
      null,
    ]);
    expect(guide.steps[3].text).toBe(
      "In Terax, forward port 9222. If it is already forwarded, stop it and forward it again.",
    );
    expect(guide.warning).toBe(
      "Keep the debugging port reachable on the server only. Never start Chrome with --remote-debugging-address=0.0.0.0 or open the port in a firewall.",
    );
    expect(guide.macPortNote).toContain("restart Chrome on the server");
    const text = JSON.stringify(guide);
    expect(text).not.toMatch(/https?:\/\/(?!localhost:9223|127\.0\.0\.1:9222)/);
    expect(text).not.toMatch(new RegExp("[\\u2013\\u2014]"));
  });

  it("takes a Chrome row, then a forward of 9222, else 9222 on both sides", () => {
    const list = [active(3000), active(9300, 9301), active(9222, 9223)];
    let m = forwardsListed(EMPTY_PORTS, DEVBOX, list);
    expect(guidePorts(m, DEVBOX)).toEqual({
      remotePort: 9222,
      localPort: 9223,
    });
    m = probed(m, DEVBOX, list[1], "chrome");
    expect(guidePorts(m, DEVBOX)).toEqual({
      remotePort: 9300,
      localPort: 9301,
    });
    expect(
      guidePorts(forwardsListed(EMPTY_PORTS, DEVBOX, [active(3000)]), DEVBOX),
    ).toEqual({ remotePort: 9222, localPort: 9222 });
    expect(guidePorts(EMPTY_PORTS, DEVBOX)).toEqual({
      remotePort: 9222,
      localPort: 9222,
    });
  });

  it("names the server in the notice", () => {
    expect(browserNoticeText("devbox")).toBe(
      "Anyone who can reach this port can control the browser on devbox, including the accounts signed in there. Terax keeps it reachable from this Mac only.",
    );
  });
});
