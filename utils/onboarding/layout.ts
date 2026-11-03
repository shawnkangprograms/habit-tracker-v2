// Layout numbers and a conservative text-width estimate for the onboarding screens, so tests can check under
// Node that text fits (the radar labels, the routine card names). Pure.
//
// CHAR_EM is an upper bound on the average advance per character of the strings we lay out: measured from the
// installed font files, the widest is 0.605 em per character (Inter SemiBold "Mind"; the catalog names in Space
// Grotesk Bold reach 0.565), so 0.65 overestimates every one of them. Larger system font sizes scale the text
// and are not covered by these checks.

export const CHAR_EM = 0.65;

// The scroll content's side padding on every onboarding screen (spacing.lg in constants/theme.ts)
export const SCREEN_PADDING = 16;

// Upper bound on a single-line text's width in px
export function textWidth(text: string, fontSize: number, letterSpacing = 0): number {
  const chars = Array.from(text).length;
  return chars * (fontSize * CHAR_EM + letterSpacing);
}

// Lines the text takes when greedily word-wrapped to maxWidth (a word wider than a line takes as many as it needs)
export function wrappedLines(text: string, maxWidth: number, fontSize: number): number {
  const space = textWidth(' ', fontSize);
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = textWidth(word, fontSize);
    if (used > 0 && used + space + w <= maxWidth) {
      used += space + w;
      continue;
    }
    if (used > 0) lines += 1;
    lines += Math.max(0, Math.ceil(w / maxWidth) - 1);
    used = w % maxWidth || maxWidth;
  }
  return lines;
}

// The Recommended Routine card (components/onboarding/routine-card.tsx uses these values)
export const ROUTINE_CARD = {padding: 12, gap: 11, badge: 38, slot: 52, border: 1, nameSize: 14} as const;
export const ROUTINE_NAME_LINES = 2;

// Width left for the habit name on a screen this wide: badge, slot and the two gaps between them, inside the
// card's padding and border, inside the screen padding
export function routineNameWidth(screenWidth: number): number {
  const c = ROUTINE_CARD;
  return screenWidth - 2 * SCREEN_PADDING - 2 * (c.padding + c.border) - c.badge - c.slot - 2 * c.gap;
}
