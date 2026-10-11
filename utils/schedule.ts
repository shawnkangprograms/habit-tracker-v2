import type {Frequency, WeekdayKey} from '@/constants/habits';

// Same wording as the Home card subtitle. A copy for the admin screens; Home keeps its own until the two are unified.

const DAY_ORDER: WeekdayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']; // display order, Monday first

// "Every day · 07:30", "Mon, Wed, Fri", or "Specific days" if the days are missing
export function scheduleText(frequency: Frequency | undefined, reminderTime: string | null): string {
  let schedule = 'Every day';
  if (frequency?.type === 'weekdays') {
    schedule = Array.isArray(frequency.days) && frequency.days.length > 0
      ? DAY_ORDER.filter((d) => frequency.days.includes(d))
          .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
          .join(', ')
      : 'Specific days';
  }
  return reminderTime ? `${schedule} · ${reminderTime}` : schedule;
}
