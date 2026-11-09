// The updatedAt stamp of a user write (docs/HABITQUEST_DESIGN.md, S-1): monotonic per row,
// updatedAt = max(now, the row's previous updatedAt + 1), so an edit is never older than the copy it replaces, even
// on a phone whose clock is behind or was moved back. Without it, such an edit is lost: either the next pull keeps
// the server copy (it looks newer), or the rules refuse the push ("updatedAt went back").
//
// The previous value is read by the same SQL statement that writes the new one, so there is no extra query and no
// race (one statement is atomic, and every user write already runs in the write queue). A new row has no previous
// value and is stamped now. System rows (ensureTodayRows) keep updatedAt = 0 and never use these; pulled rows keep
// the remote value.

// The rule itself, for tests and any JS-side stamping
export function nextUpdatedAt(now, previous) {
    return Math.max(now, previous + 1);
}

// For `UPDATE habits SET ..., updatedAt = ${STAMP_UPDATE_SQL}, ...` with now bound to the `?`
export const STAMP_UPDATE_SQL = 'MAX(?, updatedAt + 1)';

// For the completions upsert's `ON CONFLICT (habitId, date) DO UPDATE SET updatedAt = ${STAMP_UPSERT_SQL}`; the
// inserted row's updatedAt (excluded.updatedAt) is now
export const STAMP_UPSERT_SQL = 'MAX(excluded.updatedAt, completions.updatedAt + 1)';
