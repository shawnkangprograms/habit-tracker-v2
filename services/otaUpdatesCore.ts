// The over-the-air update check (EAS Update), without React Native imports so it runs under Node's test
// runner. services/otaUpdates.ts gives it the real expo-updates module and starts it after Home is usable.
//
// The check only downloads: a new update applies on the next cold start. It never reloads the running app
// (the user could be mid-tap), and it never throws. app.json sets checkAutomatically: ON_ERROR_RECOVERY and
// fallbackToCacheTimeout: 0, so launch itself never waits for the network; this check is the normal path.

// The parts of expo-updates used here
export type UpdatesModule = {
  isEnabled: boolean;
  updateId: string | null;
  channel: string | null;
  isEmbeddedLaunch: boolean;
  checkForUpdateAsync: () => Promise<{isAvailable: boolean; isRollBackToEmbedded?: boolean}>;
  fetchUpdateAsync: () => Promise<{isNew: boolean; isRollBackToEmbedded?: boolean}>;
};

export type OtaOutcome =
  | 'unavailable'// no expo-updates module in this binary (or it failed to load)
  | 'disabled'// updates are off here: Expo Go, a development build, or updates.enabled false
  | 'none'// checked: nothing new
  | 'downloaded'// a new update was downloaded; it runs from the next cold start
  | 'rollback'// the server asked to go back to the embedded bundle; applies from the next cold start
  | 'failed';// offline, a timeout or a server error: try again next launch

export type OtaInfo = {updateId: string | null; channel: string | null; embedded: boolean | null};

// Whether to check at all. Development builds load JS from the dev server, so a check there means nothing.
export function shouldCheckForUpdate(mod: UpdatesModule | null, isDev: boolean): 'unavailable' | 'disabled' | 'check' {
  if (!mod) return 'unavailable';
  if (!mod.isEnabled || isDev) return 'disabled';
  return 'check';
}

// What a check result asks for: download (a new update, or a roll-back directive, which fetchUpdateAsync
// also applies) or nothing
export function afterCheck(result: {isAvailable: boolean; isRollBackToEmbedded?: boolean}): 'fetch' | 'none' {
  return result.isAvailable || result.isRollBackToEmbedded === true ? 'fetch' : 'none';
}

export function afterFetch(result: {isNew: boolean; isRollBackToEmbedded?: boolean}): OtaOutcome {
  if (result.isRollBackToEmbedded === true) return 'rollback';
  return result.isNew ? 'downloaded' : 'none';
}

// One check: never throws, never reloads
export async function runUpdateCheck(mod: UpdatesModule | null, isDev: boolean): Promise<OtaOutcome> {
  if (!mod) return 'unavailable';
  const gate = shouldCheckForUpdate(mod, isDev);
  if (gate !== 'check') return gate;
  try {
    const checked = await mod.checkForUpdateAsync();
    if (afterCheck(checked) === 'none') return 'none';
    return afterFetch(await mod.fetchUpdateAsync());
  } catch {
    return 'failed';
  }
}

// The running bundle, for the hidden trace panel. Never throws.
export function readOtaInfo(mod: UpdatesModule | null): OtaInfo | null {
  if (!mod) return null;
  try {
    return {updateId: mod.updateId ?? null, channel: mod.channel ?? null, embedded: mod.isEmbeddedLaunch};
  } catch {
    return null;
  }
}
