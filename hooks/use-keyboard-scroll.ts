import {useCallback, useEffect, useRef, type RefObject} from 'react';
import {Platform, ScrollView, TextInput, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent} from 'react-native';
import {useKeyboardPadding} from '@/hooks/use-keyboard-padding';
import {useReduceMotion} from '@/hooks/use-reduce-motion';
import {revealScrollY} from '@/utils/keyboardInset';

// Keeps the focused field of a form visible above the keyboard on Android, where the window doesn't resize for it
// (edge-to-edge; utils/keyboardInset.ts). Core React Native only. Two layouts:
// - 'content': the screen adds `padding` to its scroll content's bottom, so everything can scroll above the
//   keyboard; the keyboard still covers the bottom of the viewport, which the reveal takes into account.
// - 'spacer': the screen puts a `padding`-high spacer below a pinned footer, which shrinks the scroll view itself.
// The focused field is scrolled into view the frame after the keyboard opens (or changes height), when the scroll
// view's size changes while it is open, and when a field gains focus while it is open (call `reveal` from
// onFocus). It moves only when the field would be hidden. On iOS `padding` is 0 and nothing runs: the screen's
// KeyboardAvoidingView handles the keyboard there.
export function useKeyboardScroll(layout: 'content' | 'spacer') {
  const padding = useKeyboardPadding();
  const reduceMotion = useReduceMotion();
  const scrollRef = useRef<ScrollView>(null);
  const innerRef = useRef<View>(null) as RefObject<View>;// ScrollView's innerViewRef type wants a non-null View
  const scrollY = useRef(0);
  const viewportHeight = useRef(0);

  const reveal = useCallback(() => {
    if (Platform.OS !== 'android' || padding === 0) return;
    const input = TextInput.State.currentlyFocusedInput();
    const inner = innerRef.current;
    if (!input || !inner) return;
    input.measureLayout(inner, (_x, fieldTop, _w, fieldHeight) => {
      const y = revealScrollY({
        fieldTop, fieldHeight, scrollY: scrollY.current, viewportHeight: viewportHeight.current,
        covered: layout === 'content' ? padding : 0,
      });
      if (y !== null) scrollRef.current?.scrollTo({y, animated: !reduceMotion});
    }, () => {});
  }, [layout, padding, reduceMotion]);

  useEffect(() => {
    if (padding === 0) return;
    const frame = requestAnimationFrame(reveal);
    return () => cancelAnimationFrame(frame);
  }, [padding, reveal]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    viewportHeight.current = e.nativeEvent.layout.height;
    reveal();// the spacer just shrank the scroll view (a no-op while the keyboard is closed)
  }, [reveal]);

  return {padding, scrollRef, innerRef, onScroll, onLayout, reveal};
}
