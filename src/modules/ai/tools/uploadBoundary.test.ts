import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// BR-9: uploads are user-triggered only, so the agent gets no tool that copies
// to a host, prepares the upload folder or reads a clipboard image.
const AI = fileURLToPath(new URL("..", import.meta.url));
const TOOLS = fileURLToPath(new URL(".", import.meta.url));

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
      out.push(path);
  }
  return out;
}

const UPLOAD_SURFACE =
  /fs_copy|ssh_prepare_upload_dir|fs_clipboard_image|terminal\/lib\/(uploadStore|terminalUpload)/;

describe("agent upload boundary", () => {
  it("offers the same tool names as before the upload feature", () => {
    const names = sources(TOOLS)
      .flatMap((file) => [
        ...readFileSync(file, "utf8").matchAll(/^\s+([a-z_]+): tool\(/gm),
      ])
      .map((m) => m[1])
      .sort();
    expect(names).toEqual([
      "bash_background",
      "bash_kill",
      "bash_list",
      "bash_logs",
      "bash_run",
      "create_directory",
      "edit",
      "get_terminal_output",
      "glob",
      "grep",
      "list_directory",
      "multi_edit",
      "open_preview",
      "read_agent_output",
      "read_file",
      "run_subagent",
      "send_to_agent",
      "spawn_coding_agent",
      "suggest_command",
      "todo_write",
      "write_file",
    ]);
  });

  it("never reaches the upload commands from the AI module", () => {
    const offenders = sources(AI).filter((file) =>
      UPLOAD_SURFACE.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
