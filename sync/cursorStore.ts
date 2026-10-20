// Pull cursors per user, kept in a small key-value storage (AsyncStorage in the app, a Map in tests).
// One JSON value per uid: {parserVersion, habitsCursor, completionsCursor, initialPullDone}.
//
// A cursor is the position after the last doc applied: {seconds, nanoseconds} of its serverUpdatedAt
// plus its doc id (the tie-break for docs that share a timestamp, e.g. one batch). The pull query
// continues with startAfter(cursor), so nothing is read twice.
//
// KNOWN, VERY SMALL RACE: if another device's write commits with a serverUpdatedAt slightly EARLIER than
// a cursor we have already moved past (commit ordering within a few milliseconds), that doc is never
// pulled on this phone. Recovery: bump PARSER_VERSION (every phone re-pulls everything once), use
// "Re-sync everything" (resetCursors), or reinstall.

import {PARSER_VERSION} from '@/sync/merge';

export type PullCursor = {seconds: number; nanoseconds: number; docId: string};

export type CursorState = {
  parserVersion: number;
  habitsCursor: PullCursor | null;
  completionsCursor: PullCursor | null;
  initialPullDone: boolean; // both collections have been pulled to the end at least once
};

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function emptyCursorState(parserVersion: number = PARSER_VERSION): CursorState {
  return {parserVersion, habitsCursor: null, completionsCursor: null, initialPullDone: false};
}

function isCursor(value: unknown): value is PullCursor {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  return Number.isSafeInteger(c.seconds)
    && Number.isInteger(c.nanoseconds) && (c.nanoseconds as number) >= 0 && (c.nanoseconds as number) < 1e9
    && typeof c.docId === 'string' && c.docId.length > 0;
}

export function createCursorStore(storage: KeyValueStorage, parserVersion: number = PARSER_VERSION) {
  const keyFor = (uid: string) => `sync:${uid}`;

  // Never throws. Missing, unreadable or corrupt state means "pull from the start".
  // A different parserVersion resets the cursors but keeps initialPullDone (no restore screen again).
  async function load(uid: string): Promise<CursorState> {
    let parsed: unknown = null;
    try {
      const raw = await storage.getItem(keyFor(uid));
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      return emptyCursorState(parserVersion);
    }
    if (typeof parsed !== 'object' || parsed === null) return emptyCursorState(parserVersion);
    const s = parsed as Record<string, unknown>;
    const initialPullDone = s.initialPullDone === true;
    if (s.parserVersion !== parserVersion) return {...emptyCursorState(parserVersion), initialPullDone};
    return {
      parserVersion,
      habitsCursor: isCursor(s.habitsCursor) ? s.habitsCursor : null,
      completionsCursor: isCursor(s.completionsCursor) ? s.completionsCursor : null,
      initialPullDone,
    };
  }

  async function save(uid: string, state: CursorState): Promise<void> {
    await storage.setItem(keyFor(uid), JSON.stringify({...state, parserVersion}));
  }

  // Force a full re-pull for this uid ("Re-sync everything"); keeps initialPullDone
  async function reset(uid: string): Promise<void> {
    const current = await load(uid);
    await save(uid, {...emptyCursorState(parserVersion), initialPullDone: current.initialPullDone});
  }

  return {load, save, reset};
}

export type CursorStore = ReturnType<typeof createCursorStore>;
