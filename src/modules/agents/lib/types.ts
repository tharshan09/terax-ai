export type AgentStatus = "idle" | "working" | "waiting";

export type AgentSource = "terminal" | "local";

/** Which subsystem owns a terminal agent session. `osc` is the local OSC
 *  133/777 detector (AgentNotificationsBridge); `ssh` is the SSH stats poller.
 *  A leaf is driven by exactly one, so each backs off the other's sessions. */
export type AgentOrigin = "osc" | "ssh";

export type AgentSignalKind =
  | "started"
  | "working"
  | "attention"
  | "finished"
  | "exited";

export type AgentSignal = {
  id: number;
  kind: AgentSignalKind;
  agent: string | null;
};

export type AgentSession = {
  leafId: number;
  tabId: number;
  agent: string;
  origin: AgentOrigin;
  status: AgentStatus;
  startedAt: number;
  lastActivityAt: number;
  attentionSince: number | null;
};

export type AgentNotification = {
  id: string;
  source: AgentSource;
  leafId: number;
  tabId: number;
  agent: string;
  kind: NotificationKind;
  at: number;
  read: boolean;
};

export type NotificationKind = "attention" | "finished" | "error";

export type LocalAgentState = {
  agent: string;
  status: AgentStatus;
} | null;
