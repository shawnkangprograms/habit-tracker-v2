// The pack record's storage, per user (utils/packs/record.ts): the canonical record under packs:v1:<uid>, and
// the mirror {uid, record, dismissed} under one fixed key, read with the sign-in marker in services/authMarker.ts
// (the same native multiGet as the greeting's name), so Home can show packs on its first render with no extra
// startup read. The mirror counts only for its own uid; for any other uid the canonical record (and the "Not now"
// flag of Home's choose card) is read and the mirror is rebuilt from it. Every write saves its key and the mirror
// in one multiSet, so they can't drift apart. Storage is injected (AsyncStorage in services/packsStore.ts, a Map
// in tests). Like the onboarding record, kept on sign-out.
//
// Never throws. An unreadable storage reads as 'corrupt' and is not remembered, so the next read tries again; it is
// never written over (R-1): update() then changes nothing and resolves 'unreadable', which every caller handles.
// A corrupt record (readable, but not the record's shape) is still replaced by a change. A failed save keeps the
// value in memory for this app run only.

import {
  chooseDismissedKey, DISMISSED_VALUE, PACKS_MIRROR_KEY, packsKey, parseMirror, parsePacks, serialiseMirror,
  serialisePacks, type PacksRecord, type ParsedPacks,
} from '@/utils/packs/record';

export type PacksStorage = {
  getItem(key: string): Promise<string | null>;
  multiSet(pairs: [string, string][]): Promise<void>;
};

// What Home renders from: the record and the choose card's "Not now" flag. A new object on every change, so
// it works as a useSyncExternalStore snapshot.
export type PacksState = {parsed: ParsedPacks; dismissed: boolean};

// What update() did. Every caller handles each case through onPacksUpdate (a source test checks every call site).
export type PacksUpdateResult = 'saved' | 'unchanged' | 'unreadable';

// One handler per result, all required, so a caller can't forget 'unreadable' (it doesn't compile)
export function onPacksUpdate<T>(result: PacksUpdateResult, handlers: Record<PacksUpdateResult, () => T>): T {
  return handlers[result]();
}

export function createPacksStore(storage: PacksStorage) {
  const memory = new Map<string, PacksState>();
  let mirrorUid: string | null = null;// whose record the stored mirror holds, as far as this app run knows
  let writes: Promise<void> = Promise.resolve();// one save at a time, in order
  let updates: Promise<unknown> = Promise.resolve();// one read-change-write at a time
  const listeners = new Set<() => void>();

  function remember(uid: string, state: PacksState): void {
    memory.set(uid, state);
    for (const listener of [...listeners]) listener();
  }

  function save(pairs: () => [string, string][]): Promise<void> {
    const next = writes.then(() => storage.multiSet(pairs()));
    writes = next.catch(() => {});
    return writes;
  }

  const mirrorPair = (uid: string): [string, string] => {
    const state = memory.get(uid)!;
    return [PACKS_MIRROR_KEY, serialiseMirror(uid, state.parsed, state.dismissed)];
  };

  // The raw mirror value read with the marker at startup. Reads nothing.
  function loadMirror(raw: string | null): void {
    const mirror = parseMirror(raw);
    mirrorUid = mirror?.uid ?? null;
    if (mirror && !memory.has(mirror.uid)) remember(mirror.uid, {parsed: mirror.parsed, dismissed: mirror.dismissed});
  }

  // What is known for this user right now, without reading storage (undefined: not read yet)
  function peek(uid: string): PacksState | undefined {
    return memory.get(uid);
  }

  async function load(uid: string): Promise<PacksState | null> {
    const known = memory.get(uid);
    if (known) return known;
    let raw: string | null;
    let dismissed: string | null;
    try {
      [raw, dismissed] = await Promise.all([storage.getItem(packsKey(uid)), storage.getItem(chooseDismissedKey(uid))]);
    } catch {
      return null;
    }
    if (!memory.has(uid)) remember(uid, {parsed: parsePacks(raw), dismissed: dismissed === DISMISSED_VALUE});// a write that finished meanwhile wins
    if (mirrorUid !== uid) {
      mirrorUid = uid;
      save(() => [mirrorPair(uid)]);// the newest value when it runs
    }
    return memory.get(uid)!;
  }

  async function read(uid: string): Promise<ParsedPacks> {
    return (await load(uid))?.parsed ?? {kind: 'corrupt'};
  }

  // Memory holds exactly what was saved (parsed back), so it never holds more than storage does. dismiss: also
  // save the choose card's "Not now", in the same multiSet.
  function write(uid: string, record: PacksRecord, dismiss = false): Promise<void> {
    const json = serialisePacks(record);
    remember(uid, {parsed: parsePacks(json), dismissed: dismiss || (memory.get(uid)?.dismissed ?? false)});
    mirrorUid = uid;
    return save(() => [
      [packsKey(uid), json], ...(dismiss ? [[chooseDismissedKey(uid), DISMISSED_VALUE] as [string, string]] : []), mirrorPair(uid),
    ]);
  }

  // Reads the current record, and writes what `change` returns (null: no write). Never throws.
  // 'saved': written (a failed save keeps it in memory, as above); 'unchanged': `change` returned null (or threw);
  // 'unreadable': storage couldn't be read, so `change` was not called and nothing was written (R-1).
  // dismissIfEmpty: a change that leaves no packs (deleting the last one) also saves "Not now", so the choose
  // card doesn't come straight back (Stage 2).
  function update(
    uid: string, change: (parsed: ParsedPacks) => PacksRecord | null, options?: {dismissIfEmpty?: boolean},
  ): Promise<PacksUpdateResult> {
    const run = updates.then(async (): Promise<PacksUpdateResult> => {
      const state = await load(uid);
      if (!state) return 'unreadable';
      const next = change(state.parsed);
      if (!next) return 'unchanged';
      await write(uid, next, (options?.dismissIfEmpty ?? false) && next.packs.length === 0);
      return 'saved';
    });
    updates = run.catch(() => {});
    return run.catch((): PacksUpdateResult => 'unchanged');
  }

  // "Not now" on Home's choose card. Never throws. If the record can't be read, only the flag is saved (the
  // mirror is left alone, so it never claims a record it doesn't know).
  async function dismissChoose(uid: string): Promise<void> {
    const state = await load(uid);
    if (!state) return save(() => [[chooseDismissedKey(uid), DISMISSED_VALUE]]);
    remember(uid, {...state, dismissed: true});
    mirrorUid = uid;
    return save(() => [[chooseDismissedKey(uid), DISMISSED_VALUE], mirrorPair(uid)]);
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {loadMirror, peek, read, write, update, dismissChoose, subscribe};
}
