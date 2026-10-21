// Makes the scheduled notifications match a planned list (utils/notificationSchedule.ts) with as few native
// calls as possible. The notifications API is injected (expo-notifications in the app, a fake in tests).
// Only our own notifications (ids starting with "hq:") are ever touched. Never throws: notifications fail
// silently, like sync.

import {ID_PREFIX, type PlannedNotification} from '@/utils/notificationSchedule';

export type ScheduledInfo = {identifier: string; data?: Record<string, unknown> | null};

export type NotificationsApi = {
  getAllScheduled(): Promise<ScheduledInfo[]>;
  cancel(identifier: string): Promise<void>;
  // `fingerprint` must come back as data.fp from getAllScheduled
  schedule(notification: PlannedNotification, fingerprint: string): Promise<void>;
};

export type ApplyResult = {scheduled: number; cancelled: number; kept: number; failed: number};

// What identifies a notification's content; a change in any part means cancel and schedule again
export function fingerprint(n: PlannedNotification): string {
  return `${n.fireAt}|${n.title}|${n.body}`;
}

export function createApplier(api: NotificationsApi) {
  let running: Promise<ApplyResult> = Promise.resolve({scheduled: 0, cancelled: 0, kept: 0, failed: 0});

  async function run(planned: PlannedNotification[]): Promise<ApplyResult> {
    const result: ApplyResult = {scheduled: 0, cancelled: 0, kept: 0, failed: 0};
    let existing: ScheduledInfo[];
    try {
      existing = (await api.getAllScheduled()).filter((n) => n.identifier.startsWith(ID_PREFIX));
    } catch (err) {
      console.log('Reading scheduled notifications failed', err);
      result.failed += 1;
      return result;
    }

    const wanted = new Map(planned.map((n) => [n.id, n]));
    const have = new Map(existing.map((n) => [n.identifier, typeof n.data?.fp === 'string' ? n.data.fp : null]));

    for (const [id, fp] of have) {
      const plan = wanted.get(id);
      if (plan && fp === fingerprint(plan)) continue;
      try {
        await api.cancel(id);
        result.cancelled += 1;
      } catch {
        result.failed += 1;
      }
    }
    for (const plan of planned) {
      const fp = fingerprint(plan);
      if (have.get(plan.id) === fp) {
        result.kept += 1;
        continue;
      }
      try {
        await api.schedule(plan, fp);
        result.scheduled += 1;
      } catch {
        result.failed += 1;
      }
    }
    return result;
  }

  // One apply at a time, in call order
  function apply(planned: PlannedNotification[]): Promise<ApplyResult> {
    running = running.then(() => run(planned), () => run(planned));
    return running;
  }

  return {apply};
}
