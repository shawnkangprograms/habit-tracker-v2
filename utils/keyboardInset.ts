// How much room the keyboard needs at the bottom of a screen. Pure.
//
// Android: Expo apps draw edge-to-edge, so the window no longer resizes for the keyboard and a
// KeyboardAvoidingView without a behavior does nothing; the keyboard simply covers the bottom of the screen.
// React Native's keyboardDidShow reports the keyboard's height ABOVE the navigation bar (IME inset minus the
// system bar inset, ReactRootView.checkForKeyboardEvents). A screen whose SafeAreaView already pads the bottom
// by that navigation bar inset ends exactly where the navigation bar starts, so the keyboard covers exactly
// `height` of it: that is the padding to add.
// iOS: KeyboardAvoidingView's 'padding' behavior already lifts the screen, so nothing is added (no double lift).

export function keyboardPadding(os: string, keyboardHeight: unknown): number {
  if (os !== 'android') return 0;
  return typeof keyboardHeight === 'number' && Number.isFinite(keyboardHeight) && keyboardHeight > 0
    ? Math.round(keyboardHeight)
    : 0;
}

// Room kept around the focused field when it is scrolled into view: above it for its label, below it for its
// error line or counter
export const REVEAL_TOP_MARGIN = 32;
export const REVEAL_BOTTOM_MARGIN = 56;

// Where to scroll so the focused field is visible, or null if it already is (no needless jump).
// All values in the scroll content's coordinates: fieldTop/fieldHeight from measureLayout against the content,
// scrollY the current offset, viewportHeight the scroll view's height, and covered how much of the viewport's
// bottom the keyboard hides (the keyboard padding when it is added to the content; 0 when a spacer below the
// scroll view has already shrunk it). A field too tall for the visible part is aligned by its top.
export function revealScrollY(input: {
  fieldTop: number;
  fieldHeight: number;
  scrollY: number;
  viewportHeight: number;
  covered: number;
}): number | null {
  const {fieldTop, fieldHeight, scrollY, viewportHeight, covered} = input;
  if (![fieldTop, fieldHeight, scrollY, viewportHeight, covered].every(Number.isFinite)) return null;
  const topTarget = Math.max(0, fieldTop - REVEAL_TOP_MARGIN);
  const visible = viewportHeight - Math.max(0, covered);
  if (visible <= 0) return topTarget;
  if (topTarget < scrollY) return topTarget;
  const bottomNeeded = fieldTop + fieldHeight + REVEAL_BOTTOM_MARGIN;
  if (bottomNeeded <= scrollY + visible) return null;
  return Math.min(topTarget, Math.max(0, bottomNeeded - visible));
}
