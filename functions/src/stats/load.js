// Loads the rows aggregate.js needs, through the Admin SDK objects it is given (no imports, so tests can pass
// fakes). Field masks (select) keep personal data out: habit names, people's names, ages and emails are never
// loaded (functions/test/stats-aggregate.test.ts checks every mask).
//
// Reads per run (Firestore): every users doc, every habits doc, the completions dated in the window, every
// aiUsage doc, and one aiUsageDaily doc per computed day. Auth listUsers is not a Firestore read.

import {completionWindowStart} from './aggregate.js';

const AUTH_PAGE = 1000;

const toMs = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null);
const parseTime = (s) => {
  const ms = typeof s === 'string' ? Date.parse(s) : NaN;
  return Number.isFinite(ms) ? ms : null;
};
// users/{uid}/habits/{id} or users/{uid}/completions/{id} -> uid
const ownerOf = (doc) => doc.ref.parent.parent?.id ?? null;

export async function loadStatsInput({db, auth}, days) {
  const from = completionWindowStart(days);
  const to = [...days].sort().at(-1);

  const authUsers = [];
  let pageToken;
  do {
    const page = await auth.listUsers(AUTH_PAGE, pageToken);
    for (const u of page.users) {
      authUsers.push({
        uid: u.uid,
        createdMs: parseTime(u.metadata?.creationTime),
        lastRefreshMs: parseTime(u.metadata?.lastRefreshTime),
      });
    }
    pageToken = page.pageToken;
  } while (pageToken);

  const [usersSnap, habitsSnap, completionsSnap, aiUsageSnap, aiDailySnaps] = await Promise.all([
    db.collection('users').select('test').get(),
    db.collectionGroup('habits')
      .select('icon', 'frequencyType', 'days', 'reminderTime', 'source', 'createdAt', 'deleted', 'serverUpdatedAt')
      .get(),
    db.collectionGroup('completions')
      .where('date', '>=', from)
      .where('date', '<=', to)
      .select('habitId', 'date', 'completed', 'serverUpdatedAt')
      .get(),
    db.collection('aiUsage').select('day', 'attempts').get(),
    db.getAll(...days.map((d) => db.collection('aiUsageDaily').doc(d))),
  ]);

  const testUids = usersSnap.docs.filter((d) => d.get('test') === true).map((d) => d.id);

  const habits = [];
  for (const d of habitsSnap.docs) {
    const uid = ownerOf(d);
    if (!uid || d.ref.parent.parent.parent.id !== 'users') continue;// only users/{uid}/habits
    habits.push({
      uid,
      habitId: d.id,
      icon: d.get('icon'),
      frequencyType: d.get('frequencyType'),
      days: d.get('days'),
      reminderTime: d.get('reminderTime'),
      source: d.get('source'),
      createdAt: d.get('createdAt'),
      deleted: d.get('deleted'),
      serverUpdatedMs: toMs(d.get('serverUpdatedAt')),
    });
  }

  const completions = [];
  for (const d of completionsSnap.docs) {
    const uid = ownerOf(d);
    if (!uid || d.ref.parent.parent.parent.id !== 'users') continue;
    completions.push({
      uid,
      habitId: d.get('habitId'),
      date: d.get('date'),
      completed: d.get('completed'),
      serverUpdatedMs: toMs(d.get('serverUpdatedAt')),
    });
  }

  const aiUsage = aiUsageSnap.docs.map((d) => ({uid: d.id, day: d.get('day'), attempts: d.get('attempts')}));
  const aiDaily = {};
  for (const snap of aiDailySnaps) {
    if (snap.exists) aiDaily[snap.id] = snap.get('count');
  }

  // documents read, per source (for the backfill script's report; aggregate.js ignores it)
  const readCounts = {
    users: usersSnap.docs.length,
    habits: habitsSnap.docs.length,
    completions: completionsSnap.docs.length,
    aiUsage: aiUsageSnap.docs.length,
    aiUsageDaily: aiDailySnaps.length,
  };

  return {authUsers, testUids, habits, completions, aiUsage, aiDaily, readCounts};
}
