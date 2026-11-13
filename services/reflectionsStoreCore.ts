// The reflection record's storage, per user (utils/reflections/record.ts): one item per year under
// reflections:v2:<uid>:<yyyy> and the marker reflections:migrated:v2:<uid> (F-1, docs/PACKS_REPORTS_SPEC.md sections
// 12 and 17). Storage is injected (AsyncStorage in services/reflectionsStore.ts, a Map in tests). Read once per uid
// per app run, then served from memory; saves run one at a time. Kept on sign-out. Nothing here sends the record
// anywhere in Stage 3; Stage 9 adds one audited export path (section 12).
//
// The first load of an app run reads the marker and the old record (reflections:v1:<uid>) in parallel, then every
// listed year in one multiGet. v1 is merged into the years (a year's own entry always wins) when there is no
// marker yet, when v1's length changed since the last merge (an older build saved to it during a rollback), or when
// a listed year is missing or corrupt; the changed years and the marker go in one multiSet. v1 is never written
// or deleted. A failed migration write never fails the read: the merged record is served, and the writes are
// retried by the next load or carried by the next save.
//
// A read that fails rejects, and is not remembered (the next read tries again): a failed read is never "no
// reflections", so XP and level never fall because of it. One exception: once a valid marker exists, a v1 that
// can't be read is skipped (logged), since the years already hold everything up to the last merge. A corrupt year
// reads as none and is replaced by the next save into that year.

import {isDateString} from '@/utils/gamification';
import type {Answers} from '@/utils/reflections/questions';
import {
  addReflection, emptyRecord, mergeYears, parseMarker, parseReflections, recordOf, reflectionsKey,
  reflectionsMarkerKey, reflectionsYearKey, serialiseMarker, serialiseReflections, splitByYear, unionInto, yearOfKey,
  type ParsedReflections, type ReflectionsMarker, type ReflectionsRecord,
} from '@/utils/reflections/record';

export type ReflectionsStorage = {
  getItem(key: string): Promise<string | null>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiSet(pairs: [string, string][]): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
};

export type SaveInput = {habitId: string; date: string; answers: Answers; text: string; savedAt: number};
export type SaveResult = 'saved' | 'exists' | 'failed';

// What is known for one user: each year read (ok, none or corrupt), the marker as it should be stored, the read
// view, and the writes a failed migration still owes (empty once stored)
type UserState = {
  years: ReadonlyMap<string, ParsedReflections>;
  marker: ReflectionsMarker;
  view: ReflectionsRecord;
  pending: [string, string][];
};

const NO_MARKER: ReflectionsMarker = {version: 1, years: [], v1Length: 0};

function viewOf(years: ReadonlyMap<string, ParsedReflections>): ReflectionsRecord {
  const records = [...years].sort(([a], [b]) => (a < b ? -1 : 1)).flatMap(([, p]) => (p.kind === 'ok' ? [p.record] : []));
  return mergeYears(records);
}

export function createReflectionsStore(storage: ReflectionsStorage) {
  const memory = new Map<string, UserState>();
  const loading = new Map<string, Promise<UserState>>();// one load per uid at a time
  let updates: Promise<unknown> = Promise.resolve();// one save at a time
  let pendingReward: string | null = null;// uid whose saved reflection Home hasn't reacted to yet

  async function readYears(uid: string, years: readonly string[]): Promise<Map<string, ParsedReflections>> {
    const out = new Map<string, ParsedReflections>();
    if (years.length === 0) return out;
    const rows = await storage.multiGet(years.map((y) => reflectionsYearKey(uid, y)));
    const byKey = new Map(rows.map(([key, value]) => [key, value]));
    for (const y of years) out.set(y, parseReflections(byKey.get(reflectionsYearKey(uid, y)) ?? null));
    return out;
  }

  async function fromStorage(uid: string): Promise<UserState> {
    // separate calls: one row too big to read fails a whole multiGet on Android
    const [markerRead, v1Read] = await Promise.allSettled([
      storage.multiGet([reflectionsMarkerKey(uid)]),
      storage.getItem(reflectionsKey(uid)),
    ]);
    if (markerRead.status === 'rejected') throw markerRead.reason;
    const marker = parseMarker(markerRead.value[0]?.[1] ?? null);
    let v1Raw: string | null | undefined;// undefined: unreadable and skipped (only once a marker exists)
    if (v1Read.status === 'fulfilled') v1Raw = v1Read.value;
    else if (marker) console.log('Reflections: the old record could not be read; serving the year keys', v1Read.reason);
    else throw v1Read.reason;

    let v1Years: Map<string, ReflectionsRecord> | null = null;
    const fromV1 = () => (v1Years ??= typeof v1Raw === 'string' ? splitByYear(recordOf(parseReflections(v1Raw))) : new Map());
    const lengthChanged = marker !== null && typeof v1Raw === 'string' && v1Raw.length !== marker.v1Length;

    // the years to read: the marker's, or (no marker) every year key of this uid plus v1's years
    const wanted = new Set(marker ? marker.years
      : (await storage.getAllKeys()).flatMap((key) => yearOfKey(uid, key) ?? []));
    if (!marker || lengthChanged) for (const y of fromV1().keys()) wanted.add(y);
    const years = await readYears(uid, [...wanted]);

    // a listed year that is missing (a migration cut short) or corrupt: filled again from v1
    const damaged = marker !== null && marker.years.some((y) => years.get(y)?.kind !== 'ok');
    if (damaged) {
      const unread = [...fromV1().keys()].filter((y) => !years.has(y));
      for (const [y, parsed] of await readYears(uid, unread)) years.set(y, parsed);
    }

    const pending: [string, string][] = [];
    let next = marker ?? NO_MARKER;
    // nothing is repaired without v1 to repair from: the marker stays as it is until v1 can be read again
    if (v1Raw !== undefined && (!marker || lengthChanged || damaged)) {
      for (const [year, incoming] of fromV1()) {
        const current = years.get(year);
        const merged = unionInto(current?.kind === 'ok' ? current.record : emptyRecord(), incoming);
        if (!merged) continue;
        years.set(year, {kind: 'ok', record: merged});
        pending.push([reflectionsYearKey(uid, year), serialiseReflections(merged)]);
      }
      const okYears = [...years].flatMap(([y, p]) => (p.kind === 'ok' ? [y] : [])).sort();
      next = {...next, years: okYears, v1Length: typeof v1Raw === 'string' ? v1Raw.length : v1Raw === null ? 0 : next.v1Length};
      pending.push([reflectionsMarkerKey(uid), serialiseMarker(next)]);
      try {
        await storage.multiSet(pending);// the years and the marker together: the marker never lands alone
        pending.length = 0;
      } catch (err) {
        console.log('Reflections: the year keys could not be written; retried later', err);
      }
    }
    return {years, marker: next, view: viewOf(years), pending};
  }

  // Rejects if storage can't be read. Remembered only once everything it needed is stored.
  function load(uid: string): Promise<UserState> {
    const known = memory.get(uid);
    if (known) return Promise.resolve(known);
    let run = loading.get(uid);
    if (!run) {
      run = fromStorage(uid)
        .then((state) => {
          if (state.pending.length === 0 && !memory.has(uid)) memory.set(uid, state);// a save that finished meanwhile wins
          return memory.get(uid) ?? state;
        })
        .finally(() => loading.delete(uid));
      loading.set(uid, run);
    }
    return run;
  }

  // Every year's reflections in one record. Rejects if they can't be read (never "no reflections").
  async function read(uid: string): Promise<ReflectionsRecord> {
    return (await load(uid)).view;
  }

  function save(uid: string, input: SaveInput): Promise<SaveResult> {
    const run = updates.then(async (): Promise<SaveResult> => {
      if (!isDateString(input.date)) return 'failed';
      let state: UserState;
      try {
        state = await load(uid);
      } catch {
        return 'failed';// unreadable: never written over
      }
      const year = input.date.slice(0, 4);
      const yearKey = reflectionsYearKey(uid, year);
      const current = state.years.get(year);
      const next = addReflection(current?.kind === 'ok' ? current.record : emptyRecord(), input);// none or corrupt: replaced
      if (!next) return 'exists';
      const listed = state.marker.years.includes(year);
      const marker = listed ? state.marker : {...state.marker, years: [...state.marker.years, year].sort()};
      const markerKey = reflectionsMarkerKey(uid);
      // writes a failed migration still owes go with this one (this year's replaced by its new value)
      const pairs: [string, string][] = state.pending.filter(([key]) => key !== yearKey && key !== markerKey);
      pairs.push([yearKey, serialiseReflections(next)]);
      if (!listed || state.pending.length > 0) pairs.push([markerKey, serialiseMarker(marker)]);
      try {
        await storage.multiSet(pairs);
      } catch {
        return 'failed';
      }
      const years = new Map(state.years).set(year, {kind: 'ok', record: next});
      memory.set(uid, {years, marker, view: viewOf(years), pending: []});
      return 'saved';
    });
    updates = run.catch(() => {});
    return run.catch((): SaveResult => 'failed');
  }

  // Set by the reflection screen after a save, taken by Home's next focus so it can react to the new XP once
  function markRewardPending(uid: string): void {
    pendingReward = uid;
  }

  function takeRewardPending(uid: string): boolean {
    if (pendingReward !== uid) return false;
    pendingReward = null;
    return true;
  }

  return {read, save, markRewardPending, takeRewardPending};
}
