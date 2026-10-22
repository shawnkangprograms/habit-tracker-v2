// Pure validators: no React, database or Firebase imports.
// Each returns { valid: true, value } with the normalised input, or { valid: false, error }
// with a message written for the user.
import {
  ICON_IDS, REMIND_BEFORE_OPTIONS, WEEKDAY_KEYS,
  type Frequency, type IconId, type RemindBeforeMin, type WeekdayKey,
} from '@/constants/habits';

export type Result<T> = { valid: true; value: T } | { valid: false; error: string };

const ok = <T>(value: T): Result<T> => ({ valid: true, value });
const fail = <T>(error: string): Result<T> => ({ valid: false, error });

const NAME_MAX = 30;
const REMINDER_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const AGE_MIN = 18; // avoids the Kenya Data Protection Act 2019 s.33 parental-consent duty
const AGE_MAX = 99;

// ---------- Habits ----------

export function validateHabitName(input: unknown): Result<string> {
  if (typeof input !== 'string') return fail("Habit name can't be empty.");
  const name = input.trim();
  if (name.length === 0) return fail("Habit name can't be empty.");
  // Count code points, not UTF-16 units, so an emoji counts as 1 (matches SQLite length()).
  if (Array.from(name).length > NAME_MAX) return fail(`Habit name must be ${NAME_MAX} characters or fewer.`);
  return ok(name);
}

export function validateIcon(input: unknown): Result<IconId> {
  if (typeof input !== 'string' || !(ICON_IDS as readonly string[]).includes(input)) {
    return fail('Please choose an icon.');
  }
  return ok(input as IconId);
}

export function validateFrequency(input: unknown): Result<Frequency> {
  if (typeof input !== 'object' || input === null) return fail('Please choose how often to do this habit.');
  const { type, days } = input as { type?: unknown; days?: unknown };

  if (type === 'daily') return ok({ type: 'daily' });
  if (type !== 'weekdays') return fail('Please choose how often to do this habit.');

  if (!Array.isArray(days) || days.length === 0) return fail('Please choose at least one day.');
  if (!days.every((d) => typeof d === 'string' && (WEEKDAY_KEYS as readonly string[]).includes(d))) {
    return fail("One of the selected days isn't valid.");
  }
  if (new Set(days).size !== days.length) return fail('Each day can only be chosen once.');
  return ok({ type: 'weekdays', days: [...days] as WeekdayKey[] });
}

export function validateReminderTime(input: unknown): Result<string | null> {
  if (input === null || input === undefined) return ok(null); // reminders are optional
  if (typeof input !== 'string' || !REMINDER_TIME_RE.test(input)) {
    return fail('Reminder time must be a valid time, like 08:30.');
  }
  return ok(input);
}

// Missing = off (older docs and callers that have no alarm); otherwise a strict boolean, no truthy coercion.
export function validateAlarm(input: unknown): Result<boolean> {
  if (input === undefined) return ok(false);
  if (typeof input !== 'boolean') return fail('Alarm sound must be on or off.');
  return ok(input);
}

// Missing = 0 (remind at the time); otherwise one of the fixed options, as a number.
export function validateRemindBeforeMin(input: unknown): Result<RemindBeforeMin> {
  if (input === undefined) return ok(0);
  if (typeof input !== 'number' || !(REMIND_BEFORE_OPTIONS as readonly number[]).includes(input)) {
    return fail('Please choose when to be reminded.');
  }
  return ok(input as RemindBeforeMin);
}

export type HabitInput = {
  habitName: string;
  icon: IconId;
  frequency: Frequency;
  reminderTime: string | null;
  alarm: boolean;
  remindBeforeMin: RemindBeforeMin;
};

// Runs the habit validators; returns the first error, or all normalised fields.
// alarm and remindBeforeMin are stored as given, also without a reminder time (they then have no effect).
export function validateHabitInput(input: {
  habitName?: unknown; icon?: unknown; frequency?: unknown; reminderTime?: unknown;
  alarm?: unknown; remindBeforeMin?: unknown;
}): Result<HabitInput> {
  const name = validateHabitName(input.habitName);
  if (!name.valid) return name;
  const icon = validateIcon(input.icon);
  if (!icon.valid) return icon;
  const frequency = validateFrequency(input.frequency);
  if (!frequency.valid) return frequency;
  const reminderTime = validateReminderTime(input.reminderTime);
  if (!reminderTime.valid) return reminderTime;
  const alarm = validateAlarm(input.alarm);
  if (!alarm.valid) return alarm;
  const remindBeforeMin = validateRemindBeforeMin(input.remindBeforeMin);
  if (!remindBeforeMin.valid) return remindBeforeMin;
  return ok({
    habitName: name.value,
    icon: icon.value,
    frequency: frequency.value,
    reminderTime: reminderTime.value,
    alarm: alarm.value,
    remindBeforeMin: remindBeforeMin.value,
  });
}

// ---------- Completions ----------

// Strict boolean: a guard against bugs in the app's own UI state, so no truthy coercion.
export function validateCompleted(input: unknown): Result<boolean> {
  if (typeof input !== 'boolean') return fail('Something went wrong. Please try again.');
  return ok(input);
}

// ---------- Auth / signup ----------

export function validateEmail(input: unknown): Result<string> {
  if (typeof input !== 'string') return fail("Email can't be empty.");
  const email = input.trim().toLowerCase();
  if (email.length === 0) return fail("Email can't be empty.");
  if (email.length > EMAIL_MAX) return fail(`Email must be ${EMAIL_MAX} characters or fewer.`);
  if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address.');
  return ok(email);
}

// Raw input: no trim or lowercase, since spaces and casing are part of the password.
export function validatePassword(input: unknown): Result<string> {
  if (typeof input !== 'string' || input.length === 0) return fail("Password can't be empty.");
  if (input.length < PASSWORD_MIN) return fail(`Password must be at least ${PASSWORD_MIN} characters.`);
  return ok(input);
}

export function validateConfirmPassword(password: unknown, confirmPassword: unknown): Result<string> {
  if (typeof confirmPassword !== 'string' || confirmPassword !== password) {
    return fail("Passwords don't match.");
  }
  return ok(confirmPassword);
}

// Accepts an integer number, or a string that is all digits after trimming (e.g. text input).
export function validateAge(input: unknown): Result<number> {
  let age: number;
  if (typeof input === 'number') {
    age = input;
  } else if (typeof input === 'string' && /^\d+$/.test(input.trim())) {
    age = Number(input.trim());
  } else {
    return fail('Please enter your age as a whole number.');
  }
  if (!Number.isInteger(age)) return fail('Please enter your age as a whole number.');
  if (age < AGE_MIN) return fail(`You must be at least ${AGE_MIN} to use HabitQuest.`);
  if (age > AGE_MAX) return fail(`Please enter an age between ${AGE_MIN} and ${AGE_MAX}.`);
  return ok(age);
}
