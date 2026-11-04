// The Q11 slider's touch-to-value mapping (components/onboarding/confidence-slider.tsx). Pure, and a worklet, so
// the same function runs on the UI thread during a drag and under Node in the tests.

import {CONFIDENCE_MAX, CONFIDENCE_MIN} from '@/utils/onboarding/types';

export const SLIDER_THUMB = 30;// px; the touch area is half a thumb wider than the track on each side

// touchX: from the touch area's left edge. trackWidth: the track's width (0 before layout: no value).
// Anywhere in the touch area counts, the padding included: it clamps to the nearest end.
export function sliderValueAt(touchX: number, trackWidth: number): number | null {
  'worklet';
  if (!(trackWidth > 0)) return null;
  const ratio = Math.min(1, Math.max(0, (touchX - SLIDER_THUMB / 2) / trackWidth));
  return CONFIDENCE_MIN + Math.round(ratio * (CONFIDENCE_MAX - CONFIDENCE_MIN));
}
