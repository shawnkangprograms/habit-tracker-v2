import {colors} from '@/constants/theme';
import type {ShareStep} from '@/utils/summaryLabels';

// One hue: colors.accent in alpha steps over colors.surface (the card), for steps 1..4 of utils/summaryLabels.
// Re-checked for palette B (C1b, surface #221f1a): monotone OKLab lightness, adjacent steps 0.083, 0.079 and 0.074
// apart (>= 0.06), faintest step 2.08:1 against the card (tests/palette.test.ts lists it as a known low pair: its meaning
// is in the labels). Blended: #80401a, #a74e1b, #cd5c1b, #f2691b.
// Five steps did not fit between that floor and full accent, hence four.
const STEP_FILL = {
  1: colors.accent + '73', // 45%
  2: colors.accent + 'A3', // 64%
  3: colors.accent + 'D1', // 82%
  4: colors.accent,
} as const;

// Fill for a step: scheduled-but-none-done uses the track; nothing scheduled has no fill (dashed outline)
export function stepFill(step: ShareStep): string | undefined {
  if (step === 'none') return undefined;
  if (step === 0) return colors.track;
  return STEP_FILL[step];
}

// Outlines: solid for "none done", dashed for "nothing scheduled". colors.muted, so both clear 3:1 on the card.
export const OUTLINE = colors.muted;
