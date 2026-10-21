// Node's built-in runner (npm test). TypeScript 6 no longer loads @types automatically, so node's types are referenced here.
/// <reference types="node" />
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import './helpers/alias.ts'; // must come before the dynamic imports below
import type {CatalogDoc, StarterIdea} from '../utils/starterIdeas.ts';

const s = await import('../utils/starterIdeas.ts');
const {validateHabitInput} = await import('../validation/validators.ts');
const {ICON_IDS} = await import('../constants/habits.ts');

const doc = (id: string, name: unknown, icon: unknown = 'book'): CatalogDoc =>
  ({id, data: {name, icon, frequency: {type: 'daily'}, reminderTime: null}});

function loader(over: Partial<Parameters<typeof s.createStarterIdeasLoader>[0]> = {}) {
  let fetches = 0;
  const get = s.createStarterIdeasLoader({
    isSignedIn: () => true,
    isOffline: () => false,
    fetchCatalog: async () => { fetches += 1; return [doc('c1', 'Stretch', 'heart')]; },
    timeoutMs: 50,
    ...over,
  });
  return {get, fetches: () => fetches};
}

const names = (ideas: StarterIdea[]) => ideas.map((i) => i.habitName);

describe('built-in starters', () => {
  test('exactly the three agreed starters, each valid for the form, with allowed icons and unique ids', () => {
    assert.deepEqual(names(s.BUILT_IN_STARTERS), ['Drink water', 'Read for 15 minutes', 'Take a short walk']);
    for (const idea of s.BUILT_IN_STARTERS) {
      const {id, ...input} = idea;
      assert.ok(id.startsWith(s.BUILT_IN_ID_PREFIX));
      assert.equal(validateHabitInput(input).valid, true);
      assert.ok((ICON_IDS as readonly string[]).includes(idea.icon));
      assert.deepEqual(idea.frequency, {type: 'daily'});
      assert.equal(idea.reminderTime, null);
    }
    assert.equal(new Set(s.BUILT_IN_STARTERS.map((i) => i.id)).size, 3);
  });

  test('withFallback: catalog ideas untouched; an empty list gives the built-ins', () => {
    const catalog = s.ideasFromCatalog([doc('c1', 'Stretch')]);
    assert.equal(s.withFallback(catalog), catalog);
    assert.equal(s.withFallback([]), s.BUILT_IN_STARTERS);
  });

  test('catalog docs: invalid ones skipped, sorted by name, built-in ids never collide with doc ids', () => {
    const ideas = s.ideasFromCatalog([doc('b', 'walk'), doc('bad', ''), doc('a', 'Apples', 'food'), doc('x', 'Ok', 'not-an-icon')]);
    assert.deepEqual(names(ideas), ['Apples', 'walk']);
    assert.ok(ideas.every((i) => !i.id.startsWith(s.BUILT_IN_ID_PREFIX)));
  });
});

describe('getStarterIdeas (injected status, sign-in and catalog read)', () => {
  test('online: the catalog', async () => {
    const l = loader();
    assert.deepEqual(names(await l.get()), ['Stretch']);
    assert.equal(l.fetches(), 1);
  });

  test('sync says offline: built-ins immediately, Firestore is not read', async () => {
    const l = loader({isOffline: () => true});
    const started = Date.now();
    assert.equal(await l.get(), s.BUILT_IN_STARTERS);
    assert.equal(l.fetches(), 0);
    assert.ok(Date.now() - started < 50, 'no timeout wait');
  });

  test('signed out: built-ins, no read', async () => {
    const l = loader({isSignedIn: () => false});
    assert.equal(await l.get(), s.BUILT_IN_STARTERS);
    assert.equal(l.fetches(), 0);
  });

  test('read fails, times out, or the catalog is empty: built-ins', async () => {
    assert.equal(await loader({fetchCatalog: async () => { throw new Error('permission-denied'); }}).get(), s.BUILT_IN_STARTERS);
    assert.equal(await loader({fetchCatalog: () => new Promise(() => {})}).get(), s.BUILT_IN_STARTERS);
    assert.equal(await loader({fetchCatalog: async () => []}).get(), s.BUILT_IN_STARTERS);
    assert.equal(await loader({fetchCatalog: async () => [doc('bad', '')]}).get(), s.BUILT_IN_STARTERS);
  });

  test('a status reader that throws counts as a failure, never as an error to the caller', async () => {
    const l = loader({isOffline: () => { throw new Error('engine not ready'); }});
    assert.equal(await l.get(), s.BUILT_IN_STARTERS);
  });
});
