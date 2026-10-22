// What Home shows when the user has no active habits. Pure: no React, database or sync imports.
//
// A returning user on a new phone (or after a reinstall) has an empty local database until the first pull
// from Firestore has finished, so "no habits" only counts once that pull is done. To never leave a new
// offline user stuck, waiting also ends after a timeout or when a sync cycle ends without finishing the
// pull (offline, or an error): see hooks/use-first-pull.ts.

export type HomeEmptyState = 'hidden' | 'checking' | 'empty';

export function homeEmptyState(input: {
  habitCount: number;// active habits (all of them, not just those scheduled today)
  loading: boolean;// Home's first load hasn't finished, or the count is unknown
  firstPullDone: boolean;// sync has pulled everything at least once for this user (saved per uid)
  waitOver: boolean;// 15 s passed, or a sync cycle ended without finishing the first pull
}): HomeEmptyState {
  if (input.loading || input.habitCount > 0) return 'hidden';
  return input.firstPullDone || input.waitOver ? 'empty' : 'checking';
}
