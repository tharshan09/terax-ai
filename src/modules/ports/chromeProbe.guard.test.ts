// GUARD: Responses that are read come from the Rust guarded client, and the remote Chrome commands take only host and server port of an existing forward, never a URL, and stay out of the AI module.
// DISPOSITION: specs/2026-11-20-ssh-remote-workflow/wave-3/slop-dispositions.md
// RULE: --
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SRC = join(ROOT, "src");
const CHROME_RS = readFileSync(
  join(ROOT, "src-tauri/src/modules/ports/chrome.rs"),
  "utf8",
);
const LIB_RS = readFileSync(join(ROOT, "src-tauri/src/lib.rs"), "utf8");
// Test helpers below this line may open sockets of their own.
const CHROME_PRODUCTION = CHROME_RS.split("#[cfg(test)]")[0];

const PROBE_COMMANDS = ["ssh_port_chrome", "ssh_port_browser_target"];
const COMMANDS = [...PROBE_COMMANDS, "chrome_installed"];

function files(dir: string, keep: (name: string) => boolean): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...files(path, keep));
    else if (keep(entry.name)) out.push(path);
  }
  return out;
}

const isSource = (name: string) =>
  /\.[cm]?[jt]sx?$/.test(name) && !/\.test\.tsx?$/.test(name);

function parameters(command: string): string {
  const signature = new RegExp(
    `#\\[tauri::command\\]\\s*pub async fn ${command}\\(([^)]*)\\)`,
  ).exec(CHROME_PRODUCTION);
  if (!signature) throw new Error(`${command} is not a command in chrome.rs`);
  return signature[1].replace(/\s+/g, " ").replace(/,\s*$/, "").trim();
}

// Keys of the object literal passed with each invoke of a probe command.
function invokeKeys(source: string): { command: string; keys: string[] }[] {
  const call =
    /invoke(?:<[^>]*>)?\(\s*["'`](ssh_port_chrome|ssh_port_browser_target)["'`]\s*(?:,\s*\{([^}]*)\})?/g;
  return [...source.matchAll(call)].map(([, command, body]) => ({
    command,
    keys: (body ?? "")
      .split(",")
      .map((part) => part.split(":")[0].trim())
      .filter(Boolean),
  }));
}

describe("remote Chrome probe", () => {
  it("takes only host and server port", () => {
    for (const command of PROBE_COMMANDS)
      expect(parameters(command), command).toBe(
        "host: String, remote_port: u32",
      );
    expect(parameters("chrome_installed")).toBe("");
    expect(CHROME_PRODUCTION.match(/#\[tauri::command\]/g)).toHaveLength(3);
  });

  it("asks the Mac port of a forward as localhost through the guarded client only", () => {
    expect(CHROME_PRODUCTION).toMatch(/registry\(\)\.active_local_port\(/);
    expect(CHROME_PRODUCTION).toMatch(
      /guarded_client\(&address, Profile::Ping, true\)/,
    );
    expect(CHROME_PRODUCTION).toMatch(
      /let address = format!\("\{\}\{path\}", mac_origin\(port\)\);/,
    );
    for (const own of [
      "TcpStream",
      "TcpListener",
      "reqwest::Client",
      "Client::builder",
      "redirect(",
      'webSocketDebuggerUrl")',
    ])
      expect(CHROME_PRODUCTION, own).not.toContain(own);
  });

  it("registers exactly the three commands", () => {
    for (const command of COMMANDS)
      expect(LIB_RS).toContain(`ports::chrome::${command},`);
  });

  it("is called from the frontend with host and remotePort only", () => {
    const calls = files(SRC, isSource).flatMap((file) =>
      invokeKeys(readFileSync(file, "utf8")).map((call) => ({
        file: relative(SRC, file).split(sep).join("/"),
        ...call,
      })),
    );
    for (const call of calls)
      expect(
        call.keys.every((key) => key === "host" || key === "remotePort"),
        `${call.file} passes ${call.keys.join(", ")} to ${call.command}`,
      ).toBe(true);
  });

  it("is out of reach of the AI module", () => {
    const ai = join(SRC, "modules/ai");
    const offenders = files(ai, (name) => /\.[cm]?[jt]sx?$/.test(name))
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return COMMANDS.some((command) => text.includes(command));
      })
      .map((file) => relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
