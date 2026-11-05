// The pack record kept on this phone only (docs/PACKS_REPORTS_SPEC.md, section 2): one JSON object per uid under
// packs:v1:<uid>, never synced, never sent anywhere, kept on sign-out like the onboarding record. A copy of the
// signed-in user's record also sits under one fixed key (the mirror, section 7), read in the same native call
// as the sign-in marker so Home has it on the first render; it counts only when its uid matches. Pure; the
// AsyncStorage reads and writes live in services/packsStoreCore.ts.
//
// Parsing never throws. Anything structurally wrong makes the whole record 'corrupt', which reads as "no packs"
// and is never written over by onboarding. Repeated membership (a habit in two packs) is repaired on read: the
// pack first in `order` keeps it. Habits deleted since are filtered where they are used (utils/packs/membership.ts).

import {BUILTIN_PACKS, isBuiltinPackId, type BuiltinPackId} from '@/utils/packs/builtin';
import {AXES, TEMPLATE_IDS, isOneOf, type Axis, type TemplateId} from '@/utils/onboarding/types';

export const PACKS_VERSION = 1;
export const packsKey = (uid: string) => `packs:v1:${uid}`;
export const PACKS_MIRROR_KEY = 'packs:mirror:v1';

export const PACK_NAME_MAX = 24;

export type Pack = {
  id: string;// a built-in pack's id is its builtinId; a custom pack's comes from the habit id generator (stage 2)
  kind: 'builtin' | 'custom';
  builtinId?: BuiltinPackId;
  name: string;
  habitIds: string[];// the explicit membership; a habit is in at most one pack
  dropped: TemplateId[];// built-in only: templates removed from the pack, never brought back
  createdAt: number;// ms; anchors the pack's yearly report
  order: number;
  area?: Axis;// custom only, chosen at creation (stage 2); a built-in pack's area comes from its builtinId
};

export type PacksRecord = {version: typeof PACKS_VERSION; packs: Pack[]};

export type ParsedPacks = {kind: 'none'} | {kind: 'corrupt'} | {kind: 'ok'; record: PacksRecord};

export const EMPTY_PACKS: PacksRecord = {version: PACKS_VERSION, packs: []};

// Trimmed with inner spaces collapsed, 1 to 24 characters (code points), no control characters. Uniqueness is
// checked against the record.
export function validatePackName(raw: unknown):
  {valid: true; value: string} | {valid: false; reason: 'empty' | 'long' | 'control'} {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (trimmed.length === 0) return {valid: false, reason: 'empty'};
  if (/\p{Cc}/u.test(trimmed)) return {valid: false, reason: 'control'};
  const value = trimmed.replace(/\s+/g, ' ');
  if (Array.from(value).length > PACK_NAME_MAX) return {valid: false, reason: 'long'};
  return {valid: true, value};
}

// Is this name used by another pack (ignoring case, extra spaces)?
export function packNameTaken(record: PacksRecord, name: string, exceptId?: string): boolean {
  const key = (n: string) => n.trim().replace(/\s+/g, ' ').toLowerCase();
  return record.packs.some((p) => p.id !== exceptId && key(p.name) === key(name));
}

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parsePack(v: unknown): Pack | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0) return null;
  if (o.kind !== 'builtin' && o.kind !== 'custom') return null;
  const name = validatePackName(o.name);
  if (!name.valid || name.value !== o.name) return null;
  if (!Array.isArray(o.habitIds) || !Array.isArray(o.dropped)) return null;
  if (!isTime(o.createdAt) || typeof o.order !== 'number' || !Number.isFinite(o.order)) return null;
  const habitIds = o.habitIds.filter((id): id is string => typeof id === 'string' && id.length > 0);
  const pack: Pack = {id: o.id, kind: o.kind, name: o.name, habitIds, dropped: [], createdAt: o.createdAt, order: o.order};
  if (o.kind === 'builtin') {
    if (!isBuiltinPackId(o.builtinId) || o.id !== o.builtinId) return null;
    const templates = BUILTIN_PACKS.find((p) => p.id === o.builtinId)!.templates;
    pack.builtinId = o.builtinId;
    pack.dropped = [...new Set(o.dropped.filter((t): t is TemplateId => isOneOf(TEMPLATE_IDS, t) && templates.includes(t)))];
  } else {
    if (o.builtinId !== undefined) return null;
    // an area that is missing or unknown reads as "no area" rather than a corrupt record: a rollback to the 1b
    // update would save custom packs without it, and the edit screen lets the user pick one again
    if (isOneOf(AXES, o.area)) pack.area = o.area;
  }
  return pack;
}

// The record from a parsed JSON value, or null if anything is wrong. Shared by the record and the mirror.
export function packsFromValue(v: unknown): PacksRecord | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (o.version !== PACKS_VERSION || !Array.isArray(o.packs)) return null;
  const packs: Pack[] = [];
  for (const raw of o.packs) {
    const pack = parsePack(raw);
    if (!pack) return null;
    packs.push(pack);
  }
  const ids = new Set(packs.map((p) => p.id));
  const names = new Set(packs.map((p) => p.name.toLowerCase()));// stored names are already trimmed and collapsed
  if (ids.size !== packs.length || names.size !== packs.length) return null;
  packs.sort((a, b) => a.order - b.order);
  const seen = new Set<string>();
  for (const pack of packs) {
    pack.habitIds = pack.habitIds.filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  return {version: PACKS_VERSION, packs};
}

export function parsePacks(raw: string | null): ParsedPacks {
  if (raw === null) return {kind: 'none'};
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return {kind: 'corrupt'};
  }
  const record = packsFromValue(v);
  return record ? {kind: 'ok', record} : {kind: 'corrupt'};
}

// Writes the known fields one by one, so nothing else can reach storage
function packValue(p: Pack) {
  return {
    id: p.id, kind: p.kind, ...(p.kind === 'builtin' ? {builtinId: p.builtinId} : {}), name: p.name,
    habitIds: [...p.habitIds], dropped: p.kind === 'builtin' ? [...p.dropped] : [], createdAt: p.createdAt, order: p.order,
    ...(p.kind === 'custom' && p.area ? {area: p.area} : {}),
  };
}

export function serialisePacks(record: PacksRecord): string {
  return JSON.stringify({version: PACKS_VERSION, packs: record.packs.map(packValue)});
}

// ---------- "Not now" on Home's "Choose your habit packs" card (Stage 1b) ----------
// Per user, on this phone only, under its own key ('1' once dismissed), and copied into the mirror so Home knows
// it on the first render. Settings > Habit packs still opens the picker.

export const chooseDismissedKey = (uid: string) => `packs:chooseDismissed:v1:${uid}`;
export const DISMISSED_VALUE = '1';

// ---------- The mirror: {uid, record, dismissed} under PACKS_MIRROR_KEY ----------
// record is the parsed record, null for "no record", or 'corrupt', so the mirror never hides a corrupt record.
// dismissed is the "Not now" flag; a 1a mirror without it reads as false.

export type PacksMirror = {uid: string; parsed: ParsedPacks; dismissed: boolean};

export function parseMirror(raw: string | null): PacksMirror | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.uid !== 'string' || o.uid.length === 0 || !('record' in o)) return null;
  const dismissed = o.dismissed === true;
  if (o.record === null) return {uid: o.uid, parsed: {kind: 'none'}, dismissed};
  if (o.record === 'corrupt') return {uid: o.uid, parsed: {kind: 'corrupt'}, dismissed};
  const record = packsFromValue(o.record);
  return record ? {uid: o.uid, parsed: {kind: 'ok', record}, dismissed} : null;
}

export function serialiseMirror(uid: string, parsed: ParsedPacks, dismissed = false): string {
  const record = parsed.kind === 'ok'
    ? {version: PACKS_VERSION, packs: parsed.record.packs.map(packValue)}
    : parsed.kind === 'corrupt' ? 'corrupt' : null;
  return JSON.stringify({uid, record, dismissed});
}
