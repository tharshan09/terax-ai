// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  isOverlayOpen,
  isPlainEscape,
  shouldExitZenOnEscape,
  type ZenEscapeTab,
  zenEscapeArmed,
} from "./zenEscape";

const html: ZenEscapeTab = { kind: "html", path: "/w/page.html" };
const markdown: ZenEscapeTab = { kind: "markdown", path: "/w/notes.md" };
const editor = (path: string): ZenEscapeTab => ({ kind: "editor", path });
const terminal: ZenEscapeTab = { kind: "terminal" };
const webPreview: ZenEscapeTab = { kind: "preview" };

const ARMED: [string, ZenEscapeTab][] = [
  ["html", html],
  ["markdown", markdown],
  ["editor a.png", editor("/w/a.png")],
  ["editor a.jpg", editor("/w/a.jpg")],
  ["editor doc.pdf", editor("/w/doc.pdf")],
];

const NOT_ARMED: [string, ZenEscapeTab | undefined][] = [
  ["editor main.rs", editor("/w/main.rs")],
  ["editor icon.svg", editor("/w/icon.svg")],
  ["terminal", terminal],
  ["web preview", webPreview],
  ["ai-diff", { kind: "ai-diff", path: "/w/a.png" }],
  ["git-diff", { kind: "git-diff", path: "/w/a.png" }],
  ["git-history", { kind: "git-history" }],
  ["git-commit-file", { kind: "git-commit-file", path: "/w/doc.pdf" }],
  ["no active tab", undefined],
];

describe("zenEscapeArmed", () => {
  it.each(ARMED)("[AC-4] is armed in zen over %s", (_name, tab) => {
    expect(zenEscapeArmed(true, tab)).toBe(true);
  });

  it.each(NOT_ARMED)("[AC-4] is not armed in zen over %s", (_name, tab) => {
    expect(zenEscapeArmed(true, tab)).toBe(false);
  });

  it("[AC-4] is not armed with zen off, even over html", () => {
    expect(zenEscapeArmed(false, html)).toBe(false);
  });

  it("[AC-4] reads the extension case-insensitively and needs a path", () => {
    expect(zenEscapeArmed(true, editor("/w/SHOT.PNG"))).toBe(true);
    expect(zenEscapeArmed(true, { kind: "editor" })).toBe(false);
  });
});

describe("shouldExitZenOnEscape", () => {
  it.each(ARMED)(
    "[AC-4] leaves zen over %s without an open overlay",
    (_name, tab) => {
      expect(shouldExitZenOnEscape(true, tab, false)).toBe(true);
    },
  );

  it.each(ARMED)(
    "[AC-4] keeps zen over %s while a dialog or menu is open",
    (_name, tab) => {
      expect(shouldExitZenOnEscape(true, tab, true)).toBe(false);
    },
  );

  it.each(NOT_ARMED)("[AC-4] keeps zen over %s", (_name, tab) => {
    expect(shouldExitZenOnEscape(true, tab, false)).toBe(false);
  });

  it("[AC-4] does nothing with zen off", () => {
    expect(shouldExitZenOnEscape(false, html, false)).toBe(false);
  });
});

describe("isPlainEscape", () => {
  const key = (over: Partial<KeyboardEventInit> = {}) =>
    new KeyboardEvent("keydown", { key: "Escape", ...over });

  it("[AC-4] accepts Esc without modifiers", () => {
    expect(isPlainEscape(key())).toBe(true);
  });

  it.each([
    ["alt", { altKey: true }],
    ["ctrl", { ctrlKey: true }],
    ["meta", { metaKey: true }],
    ["shift", { shiftKey: true }],
    ["an IME composition", { isComposing: true }],
  ])("[AC-4] rejects Esc with %s", (_name, over) => {
    expect(isPlainEscape(key(over))).toBe(false);
  });

  it("[AC-4] rejects other keys", () => {
    expect(isPlainEscape(key({ key: "Enter" }))).toBe(false);
  });
});

describe("isOverlayOpen", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Markup as the real overlays render it while open, written out by hand
  // (Radix primitives, Streamdown, AiMiniWindow, SelectionAskAi, App).
  const OPEN: [string, string][] = [
    ["Radix dialog", '<div role="dialog" data-state="open"></div>'],
    ["Radix alert dialog", '<div role="alertdialog" data-state="open"></div>'],
    ["Radix menu", '<div role="menu" data-state="open"></div>'],
    [
      "Radix popover",
      '<div role="dialog" data-slot="popover-content" data-state="open"></div>',
    ],
    ["Radix select listbox", '<div role="listbox" data-state="open"></div>'],
    ["Radix tooltip", '<div role="tooltip" data-state="delayed-open"></div>'],
    [
      "Radix hover card",
      '<div data-slot="hover-card-content" data-state="open"></div>',
    ],
    [
      "Streamdown link safety dialog",
      '<div data-streamdown="link-safety-modal" role="button" tabindex="0"></div>',
    ],
    [
      "Streamdown table fullscreen",
      '<div data-streamdown="table-fullscreen" role="dialog" aria-modal="true"></div>',
    ],
    ["AI mini window", '<div data-ai-mini-window data-state="open"></div>'],
    [
      "AI selection popup",
      '<div data-selection-ask-ai data-state="open"></div>',
    ],
    [
      "tab switcher HUD",
      '<div class="contents" data-esc-overlay><div aria-hidden="true"></div></div>',
    ],
  ];

  const CLOSED: [string, string][] = [
    ["closed Radix dialog", '<div role="dialog" data-state="closed"></div>'],
    ["closed Radix menu", '<div role="menu" data-state="closed"></div>'],
    ["closed Radix tooltip", '<div role="tooltip" data-state="closed"></div>'],
    [
      "closed hover card",
      '<div data-slot="hover-card-content" data-state="closed"></div>',
    ],
    [
      "closing AI mini window",
      '<div data-ai-mini-window data-state="closed"></div>',
    ],
    [
      "hidden AI selection popup",
      '<div data-selection-ask-ai data-state="closed"></div>',
    ],
    [
      "the permanent source control file list",
      '<div role="listbox" tabindex="0" aria-label="Changed files"></div>',
    ],
    ["a closed Radix select", '<div role="listbox" data-state="closed"></div>'],
  ];

  it("[AC-4] sees nothing in an empty document", () => {
    expect(isOverlayOpen(document)).toBe(false);
  });

  it.each(OPEN)("[AC-4] keeps Esc for an open %s", (_name, html) => {
    document.body.innerHTML = html;
    expect(isOverlayOpen(document)).toBe(true);
  });

  it.each(CLOSED)("[AC-4] does not count %s", (_name, html) => {
    document.body.innerHTML = html;
    expect(isOverlayOpen(document)).toBe(false);
  });

  it("[AC-4] keeps Esc while focus is in the toast list, not otherwise", () => {
    document.body.innerHTML =
      '<ol data-sonner-toaster tabindex="-1"><li tabindex="0">saved</li></ol><button>x</button>';
    document.querySelector<HTMLElement>("button")?.focus();
    expect(isOverlayOpen(document)).toBe(false);
    document.querySelector<HTMLElement>("li")?.focus();
    expect(isOverlayOpen(document)).toBe(true);
  });
});
