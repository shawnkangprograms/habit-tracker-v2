/// <reference types="node" />
// Test-only: a small seeded random generator (mulberry32), so property and sequence tests are deterministic and
// a failure can be replayed from its seed. No dependencies. docs/TEST_STRATEGY.md, Parts C and D.

export type Rng = {
  seed: number;
  next(): number;// [0, 1)
  int(min: number, max: number): number;// inclusive
  pick<T>(items: readonly T[]): T;
  bool(p?: number): boolean;
  shuffle<T>(items: readonly T[]): T[];
};

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    seed,
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (items) => items[Math.floor(next() * items.length)],
    bool: (p = 0.5) => next() < p,
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}

// The seeds a property test runs: HQ_SEED replays one seed; HQ_RUNS changes how many (default `runs`)
export function seeds(runs: number, base = 1): number[] {
  const one = process.env.HQ_SEED;
  if (one !== undefined && one !== '') return [Number(one)];
  const count = Number(process.env.HQ_RUNS) || runs;
  return Array.from({length: count}, (_, i) => base + i);
}

// Runs `check` once per seed; a failure names the seed so it can be replayed with HQ_SEED=<seed>
export function forEachSeed(runs: number, check: (rng: Rng) => void): void {
  for (const seed of seeds(runs)) {
    try {
      check(createRng(seed));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`seed ${seed} (replay with HQ_SEED=${seed}): ${message}`, {cause: err});
    }
  }
}
