import { IS_WINDOWS } from "@/lib/platform";
import type { WorkspaceEnv } from "@/modules/workspace";
import { create } from "zustand";

type SshEnv = Extract<WorkspaceEnv, { kind: "ssh" }>;

// Forwards ride the shared ControlMaster, which Windows does not have.
export function portsAvailable(
  env: WorkspaceEnv | null | undefined,
): env is SshEnv {
  return env?.kind === "ssh" && !IS_WINDOWS;
}

export const usePortsListStore = create<{ open: boolean }>(() => ({
  open: false,
}));

export function setPortsListOpen(open: boolean): void {
  if (usePortsListStore.getState().open !== open)
    usePortsListStore.setState({ open });
}

export function openPortsList(): void {
  setPortsListOpen(true);
}
