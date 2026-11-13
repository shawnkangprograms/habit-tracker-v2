// An in-memory AsyncStorage for the store cores: getItem, setItem, multiGet, multiSet, getAllKeys, with every call
// logged and failures that can be switched on per key (a read failure mimics Android's "Row too big to fit into
// CursorWindow"; a multiGet fails as a whole when any key it reads fails, as on Android). A multiSet is all or
// nothing unless `partialMultiSet` is set (iOS-like: the pairs before the failing one land).

export type KvCall = {op: 'getItem' | 'setItem' | 'multiGet' | 'multiSet' | 'getAllKeys'; keys: string[]};

export function kvStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const calls: KvCall[] = [];
  const unreadable = new Set<string>();
  const unwritable = new Set<string>();
  let failAll = false;
  let partialMultiSet = false;

  const readFails = (key: string) => failAll || unreadable.has(key);
  const tooBig = (key: string) => new Error(`Row too big to fit into CursorWindow (${key})`);

  return {
    data, calls,
    failReads(keys: string[] | 'all', on = true) {
      if (keys === 'all') failAll = on;
      else for (const k of keys) {
        if (on) unreadable.add(k);
        else unreadable.delete(k);
      }
    },
    failWrites(keys: string[], on = true) {
      for (const k of keys) {
        if (on) unwritable.add(k);
        else unwritable.delete(k);
      }
    },
    setPartialMultiSet(on: boolean) {
      partialMultiSet = on;
    },
    writes(): string[] {
      return calls.flatMap((c) => (c.op === 'setItem' || c.op === 'multiSet' ? c.keys : []));
    },
    async getItem(key: string) {
      calls.push({op: 'getItem', keys: [key]});
      if (readFails(key)) throw tooBig(key);
      return data.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      calls.push({op: 'setItem', keys: [key]});
      if (unwritable.has(key)) throw new Error(`write failed (${key})`);
      data.set(key, value);
    },
    async multiGet(keys: readonly string[]): Promise<[string, string | null][]> {
      calls.push({op: 'multiGet', keys: [...keys]});
      const bad = keys.find(readFails);
      if (bad) throw tooBig(bad);
      return keys.map((k) => [k, data.get(k) ?? null]);
    },
    async multiSet(pairs: [string, string][]) {
      calls.push({op: 'multiSet', keys: pairs.map(([k]) => k)});
      const bad = pairs.findIndex(([k]) => unwritable.has(k));
      if (bad === -1) {
        for (const [k, v] of pairs) data.set(k, v);
        return;
      }
      if (partialMultiSet) for (const [k, v] of pairs.slice(0, bad)) data.set(k, v);
      throw new Error(`write failed (${pairs[bad][0]})`);
    },
    async getAllKeys() {
      calls.push({op: 'getAllKeys', keys: []});
      if (failAll) throw new Error('read failed');
      return [...data.keys()];
    },
  };
}
