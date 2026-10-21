// Pure: deep equality for plain data (primitives, arrays, plain objects), such as SQLite rows and stats
// snapshots. Arrays compare in order; objects must have exactly the same keys, so {a: undefined} is not
// equal to {} (a false "changed" only costs a re-render). Not for Dates, Maps or class instances.
export function isDeepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, i) => isDeepEqual(value, b[i]));
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const keys = Object.keys(aRecord);
  if (keys.length !== Object.keys(bRecord).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(bRecord, key) && isDeepEqual(aRecord[key], bRecord[key]));
}
