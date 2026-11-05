import {useEffect, useState} from 'react';
import {Keyboard, Platform} from 'react-native';
import {keyboardPadding} from '@/utils/keyboardInset';

// The bottom padding a screen needs so the keyboard doesn't cover it (utils/keyboardInset.ts): the keyboard's
// height on Android while it is open, 0 when it is closed and always 0 on iOS (KeyboardAvoidingView handles it).
// Core React Native only: keyboardDidShow / keyboardDidHide, the only keyboard events Android sends. A height
// change while open (e.g. the emoji panel) arrives as another keyboardDidShow.
export function useKeyboardPadding(): number {
  const [padding, setPadding] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setPadding(keyboardPadding(Platform.OS, e.endCoordinates.height)));
    const hide = Keyboard.addListener('keyboardDidHide', () => setPadding(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return padding;
}
