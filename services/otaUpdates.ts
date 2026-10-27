import {homeUsable, otaCheckDone, startAfter} from '@/services/startupSignals';
import {readOtaInfo, runUpdateCheck, type OtaInfo, type OtaOutcome, type UpdatesModule} from '@/services/otaUpdatesCore';
import {mark} from '@/utils/startupTrace';

// Checks for an over-the-air update once per app run, 10 s after Home is usable (30 s after start if Home
// never gets there, e.g. signed out). Downloads only; the update runs from the next cold start. The rules and
// the decision steps are in services/otaUpdatesCore.ts.
//
// expo-updates is required lazily, inside a try/catch, like expo-notifications: nothing of it runs before the
// check, and a binary without it (or Expo Go) just gets 'unavailable' or 'disabled'.

const AFTER_HOME_MS = 10 * 1000;
const FALLBACK_MS = 30 * 1000;

let loaded: {mod: UpdatesModule | null} | null = null;
let started = false;
let outcome: OtaOutcome | null = null;

function updatesModule(): UpdatesModule | null {
  if (!loaded) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose (see above)
      loaded = {mod: require('expo-updates') as UpdatesModule};
    } catch {
      loaded = {mod: null};
    }
  }
  return loaded.mod;
}

// Called from app/_layout.tsx; returns the cleanup. A cleanup before the check began cancels it and allows a
// later call (strict-mode effects run twice); once the check has begun, later calls do nothing.
export function startOtaUpdateCheck(): () => void {
  if (started) return () => {};
  started = true;
  let began = false;
  const cancel = startAfter(homeUsable, () => {
    began = true;
    runUpdateCheck(updatesModule(), __DEV__)
      .catch((): OtaOutcome => 'failed')// runUpdateCheck never rejects; belt and braces
      .then((result) => {
        outcome = result;
        if (__DEV__) console.log(`OTA update check: ${result}`);
        mark('ota:checkEnd');
        otaCheckDone.fire();
      });
  }, {afterMs: AFTER_HOME_MS, fallbackMs: FALLBACK_MS});
  return () => {
    cancel();
    if (!began) started = false;
  };
}

// For the hidden trace panel: the running bundle and this run's check result (null until it ends)
export function getOtaInfo(): (OtaInfo & {outcome: OtaOutcome | null}) | null {
  const info = readOtaInfo(updatesModule());
  return info ? {...info, outcome} : null;
}
