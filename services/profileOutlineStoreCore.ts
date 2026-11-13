// The radar's starting outline, per user, under profile:outline:v1:<uid> on this phone: the onboarding Habit Profile
// as six whole numbers 1 to 5, one per area (docs/PACKS_REPORTS_SPEC.md, section 11). Written by onboarding's
// results step on every run that reaches it (first run and Settings retake; a retake replaces it), from the
// in-memory scores; the answers themselves are still never stored. Drawn faintly behind the Summary radar only.
// Kept or cleared like the onboarding record (kept on sign-out). Never synced, never sent anywhere.
//
// Never throws. Missing, unreadable or corrupt reads as no outline (nothing is drawn). A failed write is ignored.
// Replace-only (P-8, decided 2026-11-13): a write replaces the stored outline from fresh scores and carries none of
// its keys, since anything a newer build stored beside the scores would describe the outline being replaced.

import {AXES, type Axis} from '@/utils/onboarding/types';

export type Outline = Record<Axis, number>;

export type OutlineStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export const OUTLINE_MIN = 1;
export const OUTLINE_MAX = 5;

export const outlineKey = (uid: string) => `profile:outline:v1:${uid}`;

const clampScore = (n: number) => Math.min(OUTLINE_MAX, Math.max(OUTLINE_MIN, Math.round(n)));

// Six finite numbers, rounded and clamped to 1..5; anything else is null
export function toOutline(scores: Partial<Record<string, unknown>>): Outline | null {
  const out = {} as Outline;
  for (const axis of AXES) {
    const n = scores[axis];
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    out[axis] = clampScore(n);
  }
  return out;
}

export function parseOutline(raw: string | null): Outline | null {
  if (raw === null) return null;
  try {
    const data: unknown = JSON.parse(raw);
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? toOutline(data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createOutlineStore(storage: OutlineStorage) {
  async function read(uid: string): Promise<Outline | null> {
    try {
      return parseOutline(await storage.getItem(outlineKey(uid)));
    } catch {
      return null;
    }
  }

  // Never throws and never blocks the caller's flow: a failed write is ignored
  async function write(uid: string, scores: Partial<Record<string, unknown>>): Promise<void> {
    const outline = toOutline(scores);
    if (!outline) return;
    try {
      await storage.setItem(outlineKey(uid), JSON.stringify(outline));
    } catch {
      // ignored: the Summary radar simply has no outline
    }
  }

  return {read, write};
}
