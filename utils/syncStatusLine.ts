// The sync messages the app shows (docs/HABITQUEST_DESIGN.md, S-1 and R-1): the only exceptions to "sync fails
// silently". Pure. Settings shows them, muted, directly under its title; never Home, never a dialog, never at startup.
// - The clock line (S-1): once the engine's "clock suspect" state has lasted two sync cycles; it goes after the next
//   accepted push (sync/engineCore.ts, nextClockSuspectCycles).
// - The cursor line (R-1, approved 2026-11-13): once the pull cursors couldn't be read for three cycles in a row; it
//   goes after the next cursor read that works (nextCursorReadFailures).

export const CLOCK_LINE = 'Backup paused: your phone\'s date and time look wrong. Set them to automatic and your changes will back up.';

export const CLOCK_LINE_MIN_CYCLES = 2;

export const CURSOR_LINE = 'Backup paused: this phone couldn\'t read its backup progress. It will keep trying.';

export const CURSOR_LINE_MIN_CYCLES = 3;

// The line to show for this sync status, or null
export function clockLine(status: {clockSuspectCycles?: number} | null | undefined): string | null {
  const cycles = status?.clockSuspectCycles ?? 0;
  return cycles >= CLOCK_LINE_MIN_CYCLES ? CLOCK_LINE : null;
}

export function cursorLine(status: {cursorReadFailures?: number} | null | undefined): string | null {
  const cycles = status?.cursorReadFailures ?? 0;
  return cycles >= CURSOR_LINE_MIN_CYCLES ? CURSOR_LINE : null;
}

// Every line to show, the clock line first
export function syncLines(status: {clockSuspectCycles?: number; cursorReadFailures?: number} | null | undefined): string[] {
  return [clockLine(status), cursorLine(status)].filter((line): line is string => line !== null);
}
