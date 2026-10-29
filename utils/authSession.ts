// Who the app shows data for at startup, without waiting for Firebase's network check (fix #1). Pure: no React
// Native or Firebase imports, so it runs under Node's test runner. Storage is services/authMarker.ts; the root
// layout (app/_layout.tsx) feeds events in; services/session.ts holds the uid screens read.
//
// Firebase only calls onAuthStateChanged for a saved user after a network round trip (getAccountInfo, up to
// 60 s on a bad network). So a "marker", the uid Firebase last confirmed on this phone, is kept in AsyncStorage:
//   unknown        no marker read yet and no callback: the splash stays (fresh install or signed out: Firebase
//                  answers those without the network, so they are fast anyway)
//   presumed(uid)  the marker was read before the first callback: Home opens with that uid's LOCAL data;
//                  nothing that needs the network (sync, admin and disabled checks) runs yet
//   confirmed(uid) a callback with a user; signedOut: a callback with none. The callback always wins.
// The marker is written only for a confirmed user and cleared on every signed-out callback and BEFORE every
// sign-out (endSession below), so it only ever holds the account Firebase itself holds.

export type AuthSession =
  | {kind: 'unknown'}
  | {kind: 'presumed'; uid: string}
  | {kind: 'confirmed'; uid: string}
  | {kind: 'signedOut'};

export type AuthEvent =
  | {type: 'markerRead'; uid: string | null}// null: no marker, or the read failed
  | {type: 'callback'; uid: string | null};// onAuthStateChanged

export const INITIAL_SESSION: AuthSession = {kind: 'unknown'};

export function nextSession(state: AuthSession, event: AuthEvent): AuthSession {
  if (event.type === 'callback') return event.uid ? {kind: 'confirmed', uid: event.uid} : {kind: 'signedOut'};
  // a marker only matters before anything is known; a callback that came first always wins
  if (state.kind !== 'unknown' || !event.uid) return state;
  return {kind: 'presumed', uid: event.uid};
}

// The uid whose local data screens show (presumed or confirmed), or null
export function shownUid(state: AuthSession): string | null {
  return state.kind === 'presumed' || state.kind === 'confirmed' ? state.uid : null;
}

// The uid network services may run for: confirmed by Firebase only
export function confirmedUid(state: AuthSession): string | null {
  return state.kind === 'confirmed' ? state.uid : null;
}

// The splash stays until this is true (together with the database and fonts)
export function sessionKnown(state: AuthSession): boolean {
  return state.kind !== 'unknown';
}

// The ONE way the app ends a session (the sign-out button, the disabled-account sign-out, the sign-up
// rollback's account delete): the marker is cleared first, so the next launch can never presume this account.
// If clearing fails the session is NOT ended and the error is thrown, unless `proceedIfMarkerClearFails`
// (the sign-up rollback: an account without its users document must go; the signed-out callback that follows
// clears the marker again).
export function createEndSession(deps: {clearMarker: () => Promise<void>}) {
  return async function endSession<T>(end: () => Promise<T>, options: {proceedIfMarkerClearFails?: boolean} = {}): Promise<T> {
    try {
      await deps.clearMarker();
    } catch (err) {
      if (!options.proceedIfMarkerClearFails) throw err;
      console.log('Clearing the sign-in marker failed', err);
    }
    return end();
  };
}
