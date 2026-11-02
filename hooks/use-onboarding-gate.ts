import {useCallback, useState} from 'react';
import {router, useFocusEffect} from 'expo-router';
import {onboardingStore} from '@/services/onboardingStore';
import {shouldAutoShowOnboarding, shouldCheckOnboarding, type GateInput} from '@/utils/onboarding/gate';

// Home: opens onboarding on its own for a new user (rules in utils/onboarding/gate.ts). Reads the local record
// only once Home's list has loaded with zero active habits and the first restore has finished, so it never runs
// during cold start and users with habits never read it. Runs while Home is focused: the onboarding screen
// covers Home, so Home blurs and a pending read is ignored. `checking` is true until this user's record has
// been read and says "stay on Home", so Home can hold "Checking..." instead of flashing the empty card.
export function useOnboardingGate(input: GateInput & {userId: string | undefined}): {checking: boolean} {
  const {userId} = input;
  const eligible = userId !== undefined && shouldCheckOnboarding(input);
  const [settledFor, setSettledFor] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    if (!eligible || userId === undefined) return;
    let active = true;
    onboardingStore.read(userId).then((record) => {
      if (!active) return;
      if (shouldAutoShowOnboarding(record)) router.push('/onboarding');
      else setSettledFor(userId);
    });
    return () => {
      active = false;
    };
  }, [eligible, userId]));

  return {checking: eligible && settledFor !== userId};
}
