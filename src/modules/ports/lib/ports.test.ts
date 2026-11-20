import { describe, expect, it } from "vitest";
import {
  addOffer,
  addOffers,
  canOffer,
  EMPTY_PORTS,
  forwardFailed,
  forwardFailedText,
  forwardsListed,
  forwardStopped,
  forwardSucceeded,
  movedPortText,
  offerablePort,
  offerView,
  PORT_INPUT_ERROR,
  parsePortInput,
  portPhase,
  portsSummary,
  rowViews,
  startForwarding,
} from "@/modules/ports/lib/ports";

const DEVBOX = "ssh:devbox";
const OTHER = "ssh:other";

function offer(scope: string, port: number, leafId = 7) {
  return { scope, host: scope.slice(4), leafId, port };
}

describe("parsePortInput", () => {
  it("rejects anything but a whole number from 1 to 65535", () => {
    for (const raw of ["abc", "0", "65536", "30.5", "-1"])
      expect(parsePortInput(raw)).toEqual({
        kind: "invalid",
        message: "Enter a port between 1 and 65535.",
      });
    expect(PORT_INPUT_ERROR).toBe("Enter a port between 1 and 65535.");
  });

  it("trims and treats blank input as nothing", () => {
    expect(parsePortInput(" 3000 ")).toEqual({ kind: "port", port: 3000 });
    expect(parsePortInput("")).toEqual({ kind: "empty" });
    expect(parsePortInput("   ")).toEqual({ kind: "empty" });
  });
});

describe("offers", () => {
  it("shows the newest offer of the active server with the count of the others", () => {
    let m = addOffer(EMPTY_PORTS, offer(DEVBOX, 3000));
    m = addOffer(m, offer(DEVBOX, 5173));
    m = addOffer(m, offer(OTHER, 4000));
    expect(offerView(m, DEVBOX)).toEqual({
      port: 5173,
      label: "Forward port 5173?",
      more: "+1",
      working: false,
    });
    m = forwardFailed(m, DEVBOX, 5173);
    expect(offerView(m, DEVBOX)).toEqual({
      port: 3000,
      label: "Forward port 3000?",
      more: null,
      working: false,
    });
    expect(offerView(m, null)).toBeNull();
  });

  it("offers no port below 1024, none twice and none already forwarded", () => {
    let m = forwardSucceeded(EMPTY_PORTS, DEVBOX, {
      remotePort: 3000,
      localPort: 3000,
      status: "active",
    });
    expect(canOffer(m, DEVBOX, 80)).toBe(false);
    expect(canOffer(m, DEVBOX, 3000)).toBe(false);
    expect(canOffer(m, OTHER, 3000)).toBe(true);
    m = addOffer(m, offer(DEVBOX, 5173));
    expect(addOffer(m, offer(DEVBOX, 5173, 8))).toBe(m);
  });

  it("offers an ephemeral port only when it was written with a scheme", () => {
    expect(offerablePort({ port: 32767, scheme: false })).toBe(true);
    expect(offerablePort({ port: 32768, scheme: false })).toBe(false);
    expect(offerablePort({ port: 45123, scheme: true })).toBe(true);
    expect(offerablePort({ port: 1023, scheme: true })).toBe(false);
  });

  it("keeps the newest five offers per server and the one being accepted", () => {
    const origin = { scope: DEVBOX, host: "devbox", leafId: 7 };
    const found = (...ports: number[]) =>
      ports.map((port) => ({ port, scheme: false }));
    let m = addOffers(EMPTY_PORTS, origin, found(3000));
    m = startForwarding(m, DEVBOX, 3000);
    m = addOffers(m, { ...origin, scope: OTHER, host: "other" }, found(9000));
    m = addOffers(m, origin, found(4001, 4002, 4003, 4004, 4005, 4006, 4007));
    expect(m.offers.map((o) => [o.scope, o.port])).toEqual([
      [DEVBOX, 3000],
      [OTHER, 9000],
      [DEVBOX, 4003],
      [DEVBOX, 4004],
      [DEVBOX, 4005],
      [DEVBOX, 4006],
      [DEVBOX, 4007],
    ]);
    m = forwardFailed(m, DEVBOX, 3000);
    m = addOffers(m, origin, found(4008, 4005));
    expect(m.offers.map((o) => o.port)).toEqual([
      9000, 4004, 4005, 4006, 4007, 4008,
    ]);
    expect(offerView(m, DEVBOX)?.more).toBe("+4");
    expect(offerView(m, OTHER)?.more).toBeNull();
  });
});

describe("state machine", () => {
  it("moves an offered port through forwarding to active", () => {
    let m = addOffer(EMPTY_PORTS, offer(DEVBOX, 5173));
    expect(portPhase(m, DEVBOX, 5173)).toBe("offered");
    m = startForwarding(m, DEVBOX, 5173);
    expect(portPhase(m, DEVBOX, 5173)).toBe("forwarding");
    expect(offerView(m, DEVBOX)?.working).toBe(true);
    m = forwardSucceeded(m, DEVBOX, {
      remotePort: 5173,
      localPort: 5174,
      status: "active",
    });
    expect(portPhase(m, DEVBOX, 5173)).toBe("active");
    expect(offerView(m, DEVBOX)).toBeNull();
    expect(rowViews(m, DEVBOX)[0].label).toBe("5173 -> localhost:5174");
  });

  it("keeps a disconnected row when a retry fails", () => {
    let m = forwardsListed(EMPTY_PORTS, DEVBOX, [
      { remotePort: 8080, localPort: 8080, status: "disconnected" },
    ]);
    m = forwardFailed(startForwarding(m, DEVBOX, 8080), DEVBOX, 8080);
    expect(portPhase(m, DEVBOX, 8080)).toBe("disconnected");
  });

  it("returns a stopped port to unknown", () => {
    let m = forwardsListed(EMPTY_PORTS, DEVBOX, [
      { remotePort: 3000, localPort: 3000, status: "active" },
    ]);
    m = forwardStopped(m, DEVBOX, 3000);
    expect(portPhase(m, DEVBOX, 3000)).toBe("unknown");
    expect(m.forwards).toEqual({});
  });
});

describe("rows and summary", () => {
  it("offers Open, Open in browser, Copy, Stop when active and only Retry, Stop when disconnected", () => {
    const m = forwardsListed(EMPTY_PORTS, DEVBOX, [
      { remotePort: 8080, localPort: 8080, status: "disconnected" },
      { remotePort: 3000, localPort: 3000, status: "active" },
    ]);
    const rows = rowViews(m, DEVBOX);
    expect(rows.map((r) => [r.remotePort, r.actions])).toEqual([
      [3000, ["open", "openInBrowser", "copy", "stop"]],
      [8080, ["retry", "stop"]],
    ]);
    expect(portsSummary(m, DEVBOX)).toEqual({ count: 2, attention: true });
  });

  it("marks a differing Mac port and uses localhost for the Mac address", () => {
    const m = forwardsListed(EMPTY_PORTS, DEVBOX, [
      { remotePort: 9222, localPort: 9223, status: "active" },
    ]);
    expect(rowViews(m, DEVBOX)[0]).toMatchObject({
      label: "9222 -> localhost:9223",
      address: "localhost:9223",
      url: "http://localhost:9223",
      moved: true,
    });
  });

  it("shows only the active server", () => {
    const m = forwardsListed(EMPTY_PORTS, OTHER, [
      { remotePort: 3000, localPort: 3000, status: "active" },
    ]);
    expect(rowViews(m, DEVBOX)).toEqual([]);
    expect(portsSummary(m, DEVBOX)).toEqual({ count: 0, attention: false });
    expect(portsSummary(m, null)).toEqual({ count: 0, attention: false });
  });
});

describe("texts", () => {
  it("words failures and a moved Mac port", () => {
    expect(forwardFailedText(5173, "not connected to devbox")).toBe(
      "Could not forward port 5173: not connected to devbox",
    );
    expect(
      movedPortText({ remotePort: 5173, localPort: 5174, status: "active" }),
    ).toBe("Port 5173 is available at localhost:5174");
    expect(
      movedPortText({ remotePort: 5173, localPort: 5173, status: "active" }),
    ).toBeNull();
  });
});
