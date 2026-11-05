// The reflection record's storage, per user (utils/reflections/record.ts), under reflections:v1:<uid> on this
// phone. Storage is injected (AsyncStorage in services/reflectionsStore.ts, a Map in tests). Read once per uid per
// app run, then served from memory; saves run one at a time. Kept on sign-out. Nothing here sends the record
// anywhere in Stage 3; Stage 9 adds one audited export path (docs/PACKS_REPORTS_SPEC.md, section 12).
//
// Never throws. An unreadable storage reads as no reflections, is not remembered (the next read tries again) and
// is never written over. A corrupt record reads as no reflections and is replaced by the next save.

import type {Answers} from '@/utils/reflections/questions';
import {
  addReflection, parseReflections, recordOf, reflectionsKey, serialiseReflections, type ParsedReflections,
  type ReflectionsRecord,
} from '@/utils/reflections/record';

export type ReflectionsStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export type SaveInput = {habitId: string; date: string; answers: Answers; text: string; savedAt: number};
export type SaveResult = 'saved' | 'exists' | 'failed';

export function createReflectionsStore(storage: ReflectionsStorage) {
  const memory = new Map<string, ParsedReflections>();
  let updates: Promise<unknown> = Promise.resolve();// one read-change-write at a time
  let pendingReward: string | null = null;// uid whose saved reflection Home hasn't reacted to yet

  // null: storage couldn't be read (nothing remembered)
  async function load(uid: string): Promise<ParsedReflections | null> {
    const known = memory.get(uid);
    if (known) return known;
    try {
      const parsed = parseReflections(await storage.getItem(reflectionsKey(uid)));
      if (!memory.has(uid)) memory.set(uid, parsed);// a save that finished meanwhile wins
      return memory.get(uid)!;
    } catch {
      return null;
    }
  }

  async function read(uid: string): Promise<ReflectionsRecord> {
    const parsed = await load(uid);
    return parsed ? recordOf(parsed) : recordOf({kind: 'none'});
  }

  function save(uid: string, input: SaveInput): Promise<SaveResult> {
    const run = updates.then(async (): Promise<SaveResult> => {
      const parsed = await load(uid);
      if (!parsed) return 'failed';// unreadable: never written over
      const next = addReflection(recordOf(parsed), input);
      if (!next) return 'exists';
      try {
        await storage.setItem(reflectionsKey(uid), serialiseReflections(next));
      } catch {
        return 'failed';
      }
      memory.set(uid, {kind: 'ok', record: next});
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
