// Approximate terminal cell width.
// Counts CJK + common emoji as 2 cells, others as 1.
//
// Covers (codePoint ranges):
//   Hangul Jamo, Misc Technical (⏳⏭), Misc Symbols, Dingbats (✅❌),
//   CJK + punctuation, Hangul Syllables, CJK Compat (Forms),
//   Halfwidth/Fullwidth, Misc Sym & Pict / Emoticons / Transport (📣👀📤📅🔔),
//   Supplemental Sym & Pict, Symbols & Pict Extended-A.
//
// Limitations: ZWJ-joined emoji sequences (e.g. 👨‍👩‍👧) over-count;
// halfwidth katakana (FF61-FF9F) are treated as wide. Good enough for CLI box drawing.

export function visibleWidth(s) {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    const wide =
      (cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2300 && cp <= 0x23FF) ||
      (cp >= 0x2600 && cp <= 0x26FF) ||
      (cp >= 0x2700 && cp <= 0x27BF) ||
      (cp >= 0x3000 && cp <= 0x9FFF) ||
      (cp >= 0xAC00 && cp <= 0xD7AF) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE30 && cp <= 0xFE4F) ||
      (cp >= 0xFF00 && cp <= 0xFFEF) ||
      (cp >= 0x1F300 && cp <= 0x1F6FF) ||
      (cp >= 0x1F900 && cp <= 0x1F9FF) ||
      (cp >= 0x1FA00 && cp <= 0x1FAFF);
    n += wide ? 2 : 1;
  }
  return n;
}

export function stripAnsi(s) {
  return s.replace(/\x1B\[[0-9;]*m/g, '');
}
