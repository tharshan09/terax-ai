import { describe, expect, it } from "vitest";
import {
  createPasteBacklog,
  type PasteSlot,
} from "@/modules/terminal/lib/pasteBacklog";

function fakeSlot(bound: number | null) {
  const pasted: string[] = [];
  const parsing: (() => void)[] = [];
  const slot: PasteSlot & { bound: number | null } = {
    bound,
    boundLeafId: () => slot.bound,
    afterPendingWrites: (run) => {
      parsing.push(run);
    },
    paste: (text) => {
      pasted.push(text);
    },
  };
  const settle = () => {
    for (const run of parsing.splice(0)) run();
  };
  return { slot, pasted, settle };
}

describe("createPasteBacklog", () => {
  it("delivers text for a pane without a slot once it binds one again", () => {
    const backlog = createPasteBacklog(() => true);
    backlog.add(7, "/home/u/.terax/uploads/a.png ", null);
    backlog.add(7, "/home/u/.terax/uploads/b.png ", null);

    const { slot, pasted, settle } = fakeSlot(7);
    backlog.flush(7, slot);
    expect(pasted).toEqual([]);
    settle();
    expect(pasted).toEqual([
      "/home/u/.terax/uploads/a.png /home/u/.terax/uploads/b.png ",
    ]);

    backlog.flush(7, slot);
    settle();
    expect(pasted).toHaveLength(1);
  });

  it("pastes at once into a bound slot after its pending writes", () => {
    const backlog = createPasteBacklog(() => true);
    const { slot, pasted, settle } = fakeSlot(7);
    backlog.add(7, "x ", slot);
    expect(pasted).toEqual([]);
    settle();
    expect(pasted).toEqual(["x "]);
  });

  it("drops the text of a disposed pane", () => {
    const backlog = createPasteBacklog(() => true);
    backlog.add(7, "x ", null);
    backlog.drop(7);
    const { slot, pasted, settle } = fakeSlot(7);
    backlog.flush(7, slot);
    settle();
    expect(pasted).toEqual([]);
  });

  it("keeps the text of a live pane whose slot moved on, ahead of later text", () => {
    const backlog = createPasteBacklog(() => true);
    const first = fakeSlot(7);
    backlog.add(7, "a ", first.slot);
    first.slot.bound = 8;
    backlog.add(7, "b ", null);
    first.settle();
    expect(first.pasted).toEqual([]);

    const second = fakeSlot(7);
    backlog.flush(7, second.slot);
    second.settle();
    expect(second.pasted).toEqual(["a b "]);
  });

  it("drops the text of a pane closed while its slot moved on", () => {
    let open = true;
    const backlog = createPasteBacklog(() => open);
    const first = fakeSlot(7);
    backlog.add(7, "a ", first.slot);
    first.slot.bound = null;
    open = false;
    first.settle();

    const second = fakeSlot(7);
    backlog.flush(7, second.slot);
    second.settle();
    expect(first.pasted).toEqual([]);
    expect(second.pasted).toEqual([]);
  });
});
