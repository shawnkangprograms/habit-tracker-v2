import {useEffect, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

// The system "reduce motion" setting, kept current while the app is open.
// Starts false until the first read returns, so nothing is skipped by mistake on old devices without the setting.
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => { if (active) setReduceMotion(enabled); })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
