// The user's name kept on this phone (services/profileName.ts): one JSON value under profile:name:v1,
// {uid, firstName, lastName}, for the greeting on Home's first render with no network. Pure.
//
// One entry for the account last signed in here: it is read in the same native call as the sign-in marker and
// used only when its uid matches the marker, so another account never sees it. The name is never sent anywhere
// from here (the Firestore profile and Auth displayName are written by services/authActions.js).

import {validatePersonName, type Result} from '@/validation/validators';

export const PROFILE_NAME_KEY = 'profile:name:v1';

// Strings for the name fields and the Settings screen (approved in the Stage 0c plan; the validation messages are
// in validation/validators.ts validatePersonName)
export const FIRST_NAME_LABEL = 'First name';
export const LAST_NAME_LABEL = 'Last name';
export const NAME_ROW = 'Your name';
export const NAME_TITLE = 'Your name';
export const NAME_SAVE = 'Save';
export const NAME_SAVED = 'Name saved.';
export const NAME_SAVE_FAILED = "Couldn't save your name. Check your connection and try again.";

export type ProfileName = {uid: string; firstName: string; lastName: string | null};

// Never throws. A corrupt value, or one with an invalid first name, is "no name".
export function parseProfileName(raw: string | null): ProfileName | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.uid !== 'string' || o.uid.length === 0) return null;
  const first = validatePersonName(o.firstName, 'first');
  if (!first.valid) return null;
  const last = validatePersonName(o.lastName, 'last');
  return {uid: o.uid, firstName: first.value, lastName: last.valid ? last.value : null};
}

export function serialiseProfileName(name: ProfileName): string {
  return JSON.stringify({uid: name.uid, firstName: name.firstName, lastName: name.lastName});
}

// The stored name, only for the account it belongs to
export function nameForUid(name: ProfileName | null, uid: string | null | undefined): ProfileName | null {
  return name && uid && name.uid === uid ? name : null;
}

// From the users doc the disabled-account check already reads (services/accountStatus.js): its first and last
// name, or the first word of the Auth displayName for accounts from before names were asked for
export function profileNameFromDoc(
  uid: string, doc: {firstName?: unknown; lastName?: unknown} | null, displayName: string | null | undefined,
): ProfileName | null {
  const first = validatePersonName(doc?.firstName, 'first');
  if (first.valid) {
    const last = validatePersonName(doc?.lastName, 'last');
    return {uid, firstName: first.value, lastName: last.valid ? last.value : null};
  }
  const word = validatePersonName(displayName?.trim().split(/\s+/)[0], 'first');
  return word.valid ? {uid, firstName: word.value, lastName: null} : null;
}

// A field's message: none until the field has been left or the form submitted; after that it follows the
// value as the user types, and clears once it's valid
export function visibleError<T>(result: Result<T>, touched: boolean): string | undefined {
  return touched && !result.valid ? result.error : undefined;
}
