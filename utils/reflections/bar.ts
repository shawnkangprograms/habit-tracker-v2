// The reflection bar's state on Home (docs/PACKS_REPORTS_SPEC.md, section 16). Pure. One bar at most: the next
// offer replaces it; it goes when its time is up, when its habit is un-ticked, when the day changes, when it is
// tapped and when Home loses focus. It never needs dismissing.

export const BAR_MS = 8000;
export const BAR_MS_SCREEN_READER = 20000;

export type ReflectionBar = {id: number; habitId: string; habitName: string; date: string};

export function barDuration(screenReader: boolean): number {
  return screenReader ? BAR_MS_SCREEN_READER : BAR_MS;
}

// Its habit was un-ticked
export function withoutHabit(bar: ReflectionBar | null, habitId: string): ReflectionBar | null {
  return bar?.habitId === habitId ? null : bar;
}

// The day it was offered for is over
export function forDay(bar: ReflectionBar | null, today: string): ReflectionBar | null {
  return bar && bar.date !== today ? null : bar;
}

// Its timer ran out; a newer bar with another id stays
export function expired(bar: ReflectionBar | null, id: number): ReflectionBar | null {
  return bar?.id === id ? null : bar;
}
