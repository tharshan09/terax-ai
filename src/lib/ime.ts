/** True while the browser is assembling a multi-keystroke IME character
 * (pinyin to hanzi, jamo to syllable, dead key to accented letter). keyCode 229
 * ("Process") is what Chromium reports for keys pressed inside an active IME
 * session before `isComposing` flips, so we check both. */
export function isImeComposing(e: {
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  return Boolean(e.isComposing) || e.keyCode === 229;
}
