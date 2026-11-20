export type PasteSlot = {
  boundLeafId(): number | null;
  // Runs once every earlier write (replayed snapshot, ring bytes) has parsed,
  // so the paste sees the app's current bracketed-paste mode.
  afterPendingWrites(run: () => void): void;
  paste(text: string): void;
};

export type PasteBacklog = {
  add(leafId: number, text: string, slot: PasteSlot | null): void;
  flush(leafId: number, slot: PasteSlot): void;
  drop(leafId: number): void;
};

// Text for a pane without a slot waits until the pane binds one again; a
// closed pane's text is dropped.
export function createPasteBacklog(
  alive: (leafId: number) => boolean,
): PasteBacklog {
  const pending = new Map<number, string>();

  const flush = (leafId: number, slot: PasteSlot): void => {
    const text = pending.get(leafId);
    if (text === undefined) return;
    pending.delete(leafId);
    slot.afterPendingWrites(() => {
      if (slot.boundLeafId() === leafId) slot.paste(text);
      else if (alive(leafId))
        pending.set(leafId, text + (pending.get(leafId) ?? ""));
    });
  };

  return {
    add(leafId, text, slot) {
      pending.set(leafId, (pending.get(leafId) ?? "") + text);
      if (slot) flush(leafId, slot);
    },
    flush,
    drop(leafId) {
      pending.delete(leafId);
    },
  };
}
