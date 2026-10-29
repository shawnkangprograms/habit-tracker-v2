import {colors} from '@/constants/theme';
import type {ShareStep} from '@/utils/summaryLabels';

// One hue: colors.accent in alpha steps over colors.surface (the card), for steps 1..4 of utils/summaryLabels.
// Checked with the dataviz ordinal validator (dark, surface #1e1b17): monotone lightness, every adjacent
// step >= 0.06 apart, faintest step 2.10:1 against the card. Blended: #7d3e19, #a64d1a, #cc5b1a, #f2691b.
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
