// "Add the rest" for a built-in pack (docs/PACKS_REPORTS_SPEC.md, sections 2b and 3). Pure: the add-habit call
// and the record save are injected, so the rules are tested under Node. The UI arrives in Stage 1b.
//
// Order: adopt first (an unpacked habit with a missing template's name joins the pack), then create the missing
// templates one at a time in card order, daily with the given reminder, as many as the habit limit leaves room
// for. The record is saved after each success. The first failure stops the run with what was created kept.
// Never twice: a habit created whose save then failed is found again by name on the next run and adopted, not
// created again.

import {roomFor} from '@/utils/packs/limits';
import {addToPack, adoptExisting, missingTemplates, type HabitRef} from '@/utils/packs/membership';
import type {PacksRecord} from '@/utils/packs/record';
import {TEMPLATE_NAMES} from '@/utils/onboarding/copy';
import {CATALOG} from '@/utils/onboarding/starters';
import type {HabitInput} from '@/validation/validators';

export type AddRestDeps = {
  addHabit: (input: HabitInput) => Promise<string>;// the new habit's id
  savePacks: (record: PacksRecord) => Promise<void>;
};

export type AddRestResult = {
  record: PacksRecord;// as last saved (or as given, when nothing changed)
  added: number;
  failed: boolean;// an add or a save failed; tapping again retries the rest
  limited: boolean;// stopped at the habit limit with templates still missing
};

export async function addTheRest(deps: AddRestDeps, input: {
  record: PacksRecord;
  packId: string;
  habits: readonly HabitRef[];// every active habit
  level: number;
  reminderTime: string | null;
}): Promise<AddRestResult> {
  let record = adoptExisting(input.record, input.packId, input.habits);
  const known = [...input.habits];
  let added = 0;
  try {
    if (record !== input.record) await deps.savePacks(record);
  } catch {
    return {record: input.record, added, failed: true, limited: false};
  }

  let room = roomFor(input.level, 'habits', input.habits.length);
  for (const templateId of missingTemplates(record, input.packId, known)) {
    if (room <= 0) return {record, added, failed: false, limited: true};
    const template = CATALOG.find((t) => t.id === templateId)!;
    let habitId: string;
    try {
      habitId = await deps.addHabit({
        habitName: template.habitName, icon: template.icon, frequency: {type: 'daily'},
        reminderTime: input.reminderTime, alarm: false, remindBeforeMin: 0,
      });
      known.push({habitId, habitName: TEMPLATE_NAMES[templateId]});
      added += 1;
      room -= 1;
      const next = addToPack(record, input.packId, habitId);
      await deps.savePacks(next);
      record = next;
    } catch {
      return {record, added, failed: true, limited: false};
    }
  }
  return {record, added, failed: false, limited: false};
}
