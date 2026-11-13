// P-8, older code never drops newer fields (docs/PACKS_REPORTS_SPEC.md, section 17). Pure.
//
// A record's parser keeps the keys it does not know, exactly as stored, in an object's `unknownFields`; its
// serialiser writes them back before the known fields, which it still lists one by one. So:
// - only what came from parsing is carried: a property added in memory is never written (no object is spread
//   into storage);
// - a known field always wins: known keys are never collected, and are written after the carried ones;
// - a known key whose value this build can't read is dropped as before (newer builds never widen a field's
//   values; they add a new field instead).
// Absent when there is nothing to carry, so today's records are unchanged in memory and in storage.

export type UnknownFields = Readonly<Record<string, unknown>>;

// The keys of `o` that are not in `known`, or undefined if there are none. Object.fromEntries defines plain own
// properties, so a stored "__proto__" key stays a key and never sets a prototype. Frozen: never edited in place.
export function collectUnknown(o: Record<string, unknown>, known: ReadonlySet<string>): UnknownFields | undefined {
  const entries = Object.entries(o).filter(([key]) => !known.has(key));
  return entries.length > 0 ? Object.freeze(Object.fromEntries(entries)) : undefined;
}

// The value to store: the carried keys first, then the known fields (which win over any name they share)
export function withUnknown<T extends object>(unknown: UnknownFields | undefined, known: T): T {
  return unknown ? {...unknown, ...known} : known;
}

// An own key (a stored "__proto__" or "constructor" included), never one from the prototype
export function hasOwnKey(o: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, key);
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
