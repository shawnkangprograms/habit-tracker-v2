// The one sync message the app ever shows (docs/HABITQUEST_DESIGN.md, S-1): the single exception to "sync fails
// silently". Pure. Settings shows it, muted, directly under its title; never Home, never a dialog, never at startup.
// It appears once the engine's "clock suspect" state has lasted two sync cycles and goes after the next accepted
// push (sync/engineCore.ts, nextClockSuspectCycles).

export const CLOCK_LINE = 'Backup paused: your phone\'s date and time look wrong. Set them to automatic and your changes will back up.';

export const CLOCK_LINE_MIN_CYCLES = 2;

// The line to show for this sync status, or null
export function clockLine(status: {clockSuspectCycles?: number} | null | undefined): string | null {
  const cycles = status?.clockSuspectCycles ?? 0;
  return cycles >= CLOCK_LINE_MIN_CYCLES ? CLOCK_LINE : null;
}
