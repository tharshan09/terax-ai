import { invoke } from "@tauri-apps/api/core";

/** A connectable host parsed from `~/.ssh/config`. */
export type SshHost = {
  host: string;
  hostName?: string | null;
  user?: string | null;
};

/**
 * List SSH hosts from the user's `~/.ssh/config`. Never throws — an absent or
 * unreadable config simply yields an empty list (the `+` menu then shows a
 * "no hosts" hint).
 */
export async function listSshHosts(): Promise<SshHost[]> {
  try {
    return await invoke<SshHost[]>("ssh_list_hosts");
  } catch {
    return [];
  }
}
