// The pure parts of the icon picker (components/icon-picker.tsx), so tests/icon-picker.test.ts can check them under
// Node with any selectable list (the screens pass ICON_IDS, which the release switch decides).
//
// Two modes. Flat: every selectable icon is one of the twelve of 1.0 (the switch is off), so the picker is today's
// grid of twelve, with no tabs and no search. Tabs: the search field above group tabs; a group with no selectable icon
// is hidden; typing searches every group (labels and keywords, at most 40 results); clearing returns to the group.
import {HABIT_ICON_SET, ICON_GROUPS, LEGACY_ICON_IDS, type IconGroup, type IconId} from '@/constants/habitIconSet';
import {ICON_KEYWORDS, ICON_SPOKEN_LABELS} from '@/utils/copy/icons';

export const SEARCH_CAP = 40;

const GROUP_OF = new Map<string, IconGroup>(HABIT_ICON_SET.map((icon) => [icon.id, icon.group]));
const LEGACY = new Set<string>(LEGACY_ICON_IDS);

export type PickerMode = 'flat' | 'tabs';

// An id of the icon set (drawn with its own glyph), as opposed to one this build has never heard of
export function isInSet(id: string): id is IconId {
  return GROUP_OF.has(id);
}

export function pickerMode(selectable: readonly IconId[]): PickerMode {
  return selectable.every((id) => LEGACY.has(id)) ? 'flat' : 'tabs';
}

// The groups that have at least one selectable icon, in the set's order
export function visibleGroups(selectable: readonly IconId[]): IconGroup[] {
  const chosen = new Set<string>(selectable);
  return ICON_GROUPS.filter((group) => HABIT_ICON_SET.some((icon) => icon.group === group && chosen.has(icon.id)));
}

// A group's selectable icons, in the set's order
export function groupIcons(group: IconGroup, selectable: readonly IconId[]): IconId[] {
  const chosen = new Set<string>(selectable);
  return HABIT_ICON_SET.filter((icon) => icon.group === group && chosen.has(icon.id)).map((icon) => icon.id);
}

// The tab to open on: the selected icon's group if it is shown, else the first shown group
export function startGroup(value: string | null, selectable: readonly IconId[]): IconGroup | null {
  const groups = visibleGroups(selectable);
  const own = value ? GROUP_OF.get(value) : undefined;
  return own && groups.includes(own) ? own : groups[0] ?? null;
}

const normalise = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (text: string) => normalise(text).split(/[^a-z0-9]+/).filter(Boolean);

// Selectable icons whose label or keywords match every word typed (each typed word is the start of a label word or
// a keyword), in the set's order, at most `cap`. Nothing typed: no results (the picker shows the group instead).
export function searchIcons(query: string, selectable: readonly IconId[], cap: number = SEARCH_CAP): IconId[] {
  const typed = words(query);
  if (typed.length === 0) return [];
  const chosen = new Set<string>(selectable);
  const hits: IconId[] = [];
  for (const icon of HABIT_ICON_SET) {
    if (!chosen.has(icon.id)) continue;
    const vocabulary = [...words(ICON_SPOKEN_LABELS[icon.id]), ...ICON_KEYWORDS[icon.id].map(normalise)];
    if (typed.every((t) => vocabulary.some((w) => w.startsWith(t)))) hits.push(icon.id);
    if (hits.length === cap) break;
  }
  return hits;
}

export function spokenLabel(id: IconId): string {
  return ICON_SPOKEN_LABELS[id];
}

// The caption under the grid: the chosen icon's label; with nothing chosen, the label of the icon the habit already
// has when this build knows it (a set icon the switch still holds back); else nothing
export function captionFor(value: IconId | null, stored: string | null): string | null {
  if (value) return ICON_SPOKEN_LABELS[value];
  return stored && isInSet(stored) ? ICON_SPOKEN_LABELS[stored] : null;
}

// The muted "from a newer version" line: only for a stored id that is not in the set at all
export function showUnknownLine(value: IconId | null, stored: string | null): boolean {
  return value === null && stored !== null && !isInSet(stored);
}
