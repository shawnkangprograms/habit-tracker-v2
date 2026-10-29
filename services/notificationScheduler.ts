import {AppState} from 'react-native';
import {onAuthStateChanged} from 'firebase/auth';
import {getFirebaseAuth} from '@/services/authInit';
import {onLocalChange} from '@/db/localChanges';
import {onRemoteChange} from '@/db/remoteChanges';
import {getScheduleHabits} from '@/db/notificationHabits';
import {getEntry as getStatsEntry, subscribe as subscribeStats} from '@/services/statsStore';
import {loadNotificationPrefs, subscribeNotificationPrefs} from '@/services/notificationPrefs';
import {
  ensureReminderChannel, getNotificationPermission, nativeNotificationsApi, notificationsAvailable,
} from '@/services/notifications';
import {createApplier} from '@/services/notificationApplier';
import {decideRebuild, stillCurrent, type SchedulerAuth} from '@/services/notificationGate';
import {buildSchedule, type ScheduleHabit} from '@/utils/notificationSchedule';
import {getLocalDateString} from '@/utils/dates';
import {mark} from '@/utils/startupTrace';

// Keeps the scheduled local notifications in line with the user's habits. Rebuilds (debounced, so never on
// the tap path, and never inside a queued write) after: app start, coming back to the foreground (also picks
// up a new day or a changed time zone), any committed local change (tick, add, edit, delete), data pulled
// from another device, a settings change, and a stats change (the streak used by the nudge wording).
//
// Each rebuild does ONE plain read (db/notificationHabits.js), and only while a notification switch is on and
// permission is granted. Then it diffs against what is scheduled (services/notificationApplier.ts).
//
// Known limitation (accepted, D7): the schedule only updates while the app runs on THIS phone. If a habit is
// ticked on another device while this app is closed, this phone's reminder or nudge for it can still fire;
// it is corrected the next time the app opens here and pulls the change.

const DEBOUNCE_MS = 1500;

const applier = createApplier(nativeNotificationsApi);
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let again = false;
let stopListeners: (() => void) | null = null;

function devLog(message: string) {
  if (__DEV__) console.log(`Notifications: ${message}`);
}

// Who the schedule is for, from auth callbacks only (see services/notificationGate.ts)
let auth: SchedulerAuth = {kind: 'unknown'};

// Signing out removes every reminder at once, so nobody gets another account's habits (registered once, when
// this module is first imported, and kept for the app's lifetime). The cancel goes through runRebuild, so it
// runs after any rebuild already in progress and is never overtaken by it. Nothing to remove when unavailable.
// A signed-in callback asks for a rebuild: Home can be usable (and this scheduler started) before Firebase's
// network check at launch has answered, and a rebuild that ran before then was skipped ('unknown').
// The presumed uid from the sign-in marker (utils/authSession.ts) never reaches this scheduler.
onAuthStateChanged(getFirebaseAuth(), (user) => {
  auth = user ? {kind: 'signedIn', uid: user.uid} : {kind: 'signedOut'};
  if (!user && notificationsAvailable()) runRebuild();
  if (user) requestScheduleRebuild();// a no-op until the scheduler has started
});

async function rebuild(): Promise<void> {
  if (!notificationsAvailable()) return;// no module in this app binary: no reads, no native calls
  const startedWith = auth;
  const prefs = startedWith.kind === 'signedIn' ? await loadNotificationPrefs() : null;
  const permission = prefs && (prefs.remindersOn || prefs.nudgeOn) ? await getNotificationPermission() : null;
  const decision = decideRebuild({auth: startedWith, prefs, permission});
  if (decision === 'skip') return;
  if (decision === 'cancelAll') {
    if (startedWith.kind === 'signedIn' && !stillCurrent(startedWith.uid, auth)) return;// a sign-out queues its own run
    const result = await applier.apply([]);// signed out, or both off: cancel ours, no database read
    if (result.cancelled > 0) devLog(`${startedWith.kind === 'signedOut' ? 'signed out' : 'all off'}, cancelled ${result.cancelled}`);
    return;
  }
  if (startedWith.kind !== 'signedIn' || !prefs) return;// narrows the types; decideRebuild already checked
  const uid = startedWith.uid;
  await ensureReminderChannel();

  const now = new Date();
  const today = getLocalDateString(now);
  const rows = (await getScheduleHabits(uid, today)) as (ScheduleHabit & {completedToday: boolean})[];
  const entry = getStatsEntry();
  const streak = entry && entry.userId === uid && entry.date === today ? entry.stats.currentStreak : null;
  const doneToday = new Set(rows.filter((r) => r.completedToday).map((r) => r.habitId));
  const planned = buildSchedule(rows, doneToday, prefs, now, streak);
  if (!stillCurrent(uid, auth)) {
    devLog('the user changed during the rebuild, skipped');
    return;
  }
  const result = await applier.apply(planned);
  const count = (kind: string) => planned.filter((n) => n.kind === kind).length;
  const alarms = planned.filter((n) => n.alarm).length;
  devLog(`${planned.length} planned (${count('habit')} due, ${count('early')} early, ${alarms} alarm, ${count('nudge')} nudge): ` +
    `${result.scheduled} scheduled, ${result.cancelled} cancelled, ${result.kept} kept` +
    (result.failed > 0 ? `, ${result.failed} failed` : ''));
}

// One rebuild at a time; requests arriving meanwhile cause one more run after it
async function runRebuild(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      try {
        await rebuild();
      } catch (err) {
        console.log('Notification schedule rebuild failed', err);// fails silently for the user
      }
    } while (again);
  } finally {
    running = false;
    if (stopListeners) mark('notif:firstRebuildEnd');// not a signed-out launch's cancel
  }
}

export function requestScheduleRebuild(): void {
  if (!stopListeners) return;// not started (signed out)
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    runRebuild();
  }, DEBOUNCE_MS);
}

// Called by the signed-in tab layout; returns the stop function. Does nothing at all (no listeners, no
// rebuilds) when notifications are unavailable in this app binary.
export function startNotificationScheduler(): () => void {
  if (!notificationsAvailable()) return () => {};
  if (stopListeners) return stopListeners;
  mark('notif:schedulerStart');
  const subscriptions = [
    onLocalChange(requestScheduleRebuild),
    onRemoteChange(requestScheduleRebuild),
    subscribeNotificationPrefs(requestScheduleRebuild),
    subscribeStats(requestScheduleRebuild),
  ];
  const appState = AppState.addEventListener('change', (next) => {
    if (next === 'active') requestScheduleRebuild();
  });
  const stop = () => {
    for (const unsubscribe of subscriptions) unsubscribe();
    appState.remove();
    if (timer) clearTimeout(timer);
    timer = null;
    stopListeners = null;
  };
  stopListeners = stop;
  requestScheduleRebuild();// app start / sign-in
  return stop;
}
