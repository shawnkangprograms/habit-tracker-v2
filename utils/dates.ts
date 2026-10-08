import { WEEKDAY_KEYS, type WeekdayKey } from '@/constants/habits';

// The LOCAL calendar date as YYYY-MM-DD.
// Never use toISOString().split('T')[0]: that is the UTC date, wrong from 00:00-03:00 in Kenya.
export function getLocalDateString(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// The LOCAL weekday as a key ('sun'..'sat'). getDay() returns 0 for Sunday.
export function getLocalWeekdayKey(d: Date = new Date()): WeekdayKey {
  return WEEKDAY_KEYS[d.getDay()];
}
