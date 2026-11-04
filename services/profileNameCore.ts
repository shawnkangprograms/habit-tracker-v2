// The name kept on this phone for the greeting (utils/profileName.ts). Storage is injected (AsyncStorage in
// services/profileName.ts, a Map in tests). The startup read happens in services/authMarker.ts, in the same
// native call as the sign-in marker, and is handed in with load(); nothing here reads storage on its own.
// Never throws: a failed save keeps the name in memory for this app run.

import {nameForUid, parseProfileName, PROFILE_NAME_KEY, serialiseProfileName, type ProfileName} from '@/utils/profileName';

export type NameStorage = {
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export function createProfileNameStore(storage: NameStorage) {
  let current: ProfileName | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };

  return {
    // the raw value read with the marker at startup
    load(raw: string | null): void {
      current = parseProfileName(raw);
      notify();
    },
    // the name for this account, or null (another account's name is never returned)
    get(uid: string | null | undefined): ProfileName | null {
      return nameForUid(current, uid);
    },
    // sign-up, the Settings edit, and the refresh from the users doc. A null name for this uid changes nothing:
    // a doc without a name never wipes one typed on this phone.
    async set(name: ProfileName | null): Promise<void> {
      if (!name) return;
      const same = current !== null && serialiseProfileName(current) === serialiseProfileName(name);
      if (same) return;
      current = name;
      notify();
      await storage.setItem(PROFILE_NAME_KEY, serialiseProfileName(name)).catch(() => {});
    },
    // a sign-up rolled back: the account no longer exists
    async clear(uid: string): Promise<void> {
      if (current?.uid !== uid) return;
      current = null;
      notify();
      await storage.removeItem(PROFILE_NAME_KEY).catch(() => {});
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
