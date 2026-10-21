// Starter ideas for the New habit screen. Pure (the Firestore read, sign-in check and sync status are
// injected by services/catalogSuggestions.js), so it runs under Node's test runner.
//
// Source: the admin-managed "catalog" collection. When that is unavailable (offline, timeout, permission,
// signed out, or simply empty), three built-in starters are shown instead, so the "Pick a starter habit"
// button on Home always leads to something. Built-ins are never stored anywhere.

import {validateHabitInput, type HabitInput} from '@/validation/validators';

export type StarterIdea = HabitInput & {id: string};
export type CatalogDoc = {id: string; data: Record<string, unknown>};

export const STARTER_SHOW_LIMIT = 12;
export const STARTER_TIMEOUT_MS = 5000;
export const BUILT_IN_ID_PREFIX = 'builtin:';

// Same validator and icon list as the form, so the built-ins obey exactly the form's rules
function validIdea(id: string, raw: {habitName: unknown; icon: unknown; frequency: unknown; reminderTime: unknown}): StarterIdea | null {
  const result = validateHabitInput(raw);
  return result.valid ? {id, ...result.value} : null;
}

export const BUILT_IN_STARTERS: StarterIdea[] = [
  {id: `${BUILT_IN_ID_PREFIX}water`, habitName: 'Drink water', icon: 'water'},
  {id: `${BUILT_IN_ID_PREFIX}read`, habitName: 'Read for 15 minutes', icon: 'book'},
  {id: `${BUILT_IN_ID_PREFIX}walk`, habitName: 'Take a short walk', icon: 'run'},
]
  .map(({id, ...rest}) => validIdea(id, {...rest, frequency: {type: 'daily'}, reminderTime: null}))
  .filter((idea): idea is StarterIdea => idea !== null);

export function withFallback(ideas: StarterIdea[]): StarterIdea[] {
  return ideas.length > 0 ? ideas : BUILT_IN_STARTERS;
}

// Valid catalog docs only, sorted by name (case-insensitive), at most STARTER_SHOW_LIMIT
export function ideasFromCatalog(docs: CatalogDoc[]): StarterIdea[] {
  return docs
    .map((d) => validIdea(d.id, {
      habitName: d.data.name,
      icon: d.data.icon,
      frequency: d.data.frequency,
      reminderTime: d.data.reminderTime ?? null,
    }))
    .filter((idea): idea is StarterIdea => idea !== null)
    .sort((a, b) => a.habitName.localeCompare(b.habitName, undefined, {sensitivity: 'base'}))
    .slice(0, STARTER_SHOW_LIMIT);
}

// Resolves to null if the read takes too long; the read itself is not cancelled, its result is ignored
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function createStarterIdeasLoader(deps: {
  isSignedIn: () => boolean;// the catalog rules only allow signed-in reads
  isOffline: () => boolean;// sync already knows the phone is offline: skip the read, no 5 s wait
  fetchCatalog: () => Promise<CatalogDoc[]>;
  timeoutMs?: number;
}) {
  const timeoutMs = deps.timeoutMs ?? STARTER_TIMEOUT_MS;

  // Never throws, never returns an empty list
  return async function getStarterIdeas(): Promise<StarterIdea[]> {
    try {
      if (!deps.isSignedIn() || deps.isOffline()) return BUILT_IN_STARTERS;
      const docs = await withTimeout(deps.fetchCatalog(), timeoutMs);
      return docs ? withFallback(ideasFromCatalog(docs)) : BUILT_IN_STARTERS;
    } catch {
      return BUILT_IN_STARTERS;
    }
  };
}
