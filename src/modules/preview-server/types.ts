// Wire types of the preview server commands
// (`src-tauri/src/modules/preview_server/mod.rs`).

export type BrowserOpenStatus =
  | "opened"
  | "unsupported"
  | "refused"
  | "too_large"
  | "unreachable"
  | "limit_reached"
  | "open_failed";

// `reason` only for `refused`, `unreachable` and `open_failed`; never an address.
export type BrowserOpen = { status: BrowserOpenStatus; reason: string | null };

export type FrameStatus =
  | "ready"
  | "unsupported"
  | "refused"
  | "too_large"
  | "unreachable"
  | "limit_reached";

// `url` only for `ready`, for the in-app iframe only.
export type FrameSource = {
  status: FrameStatus;
  url: string | null;
  reason: string | null;
};
