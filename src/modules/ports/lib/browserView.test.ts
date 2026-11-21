import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { macOrigin, macViewerUrl } from "@/modules/ports/lib/portDetect";
import {
  type BrowserTarget,
  browserGuide,
  browserNoticeText,
  CHROME_APP,
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
  viewerPlan,
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

describe("viewer plan (AC-4, AC-7)", () => {
  const ready = (over: Partial<BrowserTarget> = {}): BrowserTarget => ({
    status: "ready",
    pageId: "A1B2",
    origin: "http://localhost:9223",
    ...over,
  });

  it("opens the viewer of the page on the forward's Mac port", () => {
    expect(viewerPlan(ready(), 9223)).toEqual({
      kind: "open",
      url: "http://localhost:9223/devtools/inspector.html?ws=localhost:9223/devtools/page/A1B2",
    });
  });

  it("falls back to the guide for a refused or unreachable view or another origin", () => {
    for (const target of [
      ready({ status: "origin_refused", pageId: null }),
      ready({ status: "unreachable", pageId: null }),
      ready({ origin: "http://127.0.0.1:9223" }),
      ready({ origin: "http://localhost:9224" }),
      ready({ origin: "http://localhost:9223/" }),
      ready({ origin: "HTTP://localhost:9223" }),
      ready({ pageId: null }),
    ])
      expect(viewerPlan(target, 9223), JSON.stringify(target)).toEqual({
        kind: "guide",
      });
    expect(
      viewerPlan(ready({ status: "no_page", pageId: null }), 9223),
    ).toEqual({ kind: "noPage" });
  });

  it("never builds a URL with another host, whatever Rust reports", () => {
    const pageIds = [
      "A1B2",
      "1@evil.example",
      "@evil.example",
      "a/b",
      "../../x",
      "A1B2#@evil.example",
      "A1B2?x=1",
      "A1 B2",
      "",
    ];
    const origins = [
      "http://localhost:9223",
      "http://localhost:1@evil.example",
      "http://localhost:9223@evil.example",
      "http://evil.example",
    ];
    for (const pageId of pageIds)
      for (const origin of origins) {
        const plan = viewerPlan({ status: "ready", pageId, origin }, 9223);
        if (plan.kind !== "open") continue;
        expect(plan.url).toBe(macViewerUrl(9223, pageId));
        const url = new URL(plan.url);
        expect(url.host).toBe("localhost:9223");
        expect(url.username + url.password).toBe("");
        expect(plan.url).not.toContain("@");
        expect(url.searchParams.get("ws")).toBe(
          `localhost:9223/devtools/page/${pageId}`,
        );
      }
    expect(macOrigin(9223)).toBe("http://localhost:9223");
  });

  it("hands Chrome only the plan's URL, from one place", () => {
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
    expect(withApp).toEqual([
      {
        file: "modules/ports/lib/portsStore.ts",
        call: "openUrl(plan.url, CHROME_APP)",
      },
    ]);
    expect(CHROME_APP).toBe("Google Chrome");
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
