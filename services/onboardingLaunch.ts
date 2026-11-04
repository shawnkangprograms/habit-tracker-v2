// Opening onboarding straight after a sign-up, without Home showing first (docs/ONBOARDING_SPEC.md, section 10).
// In memory only: nothing is stored and nothing is awaited, so returning users pay one boolean read at Home's
// mount and nothing at cold start. The stored pending flag (services/onboardingStoreCore.ts) is still what lets
// Home's gate reopen onboarding after the app is killed mid-setup; this only covers the moment of sign-up.
//
// - beginSignUp: called by the sign-up path BEFORE the account is created, because the auth listener swaps the
//   sign-up screen for the tabs before createUserWithEmailAndPassword returns.
// - cancelSignUp: any sign-up failure (including a rolled-back profile write).
// - takeLaunch: Home's first render. While a launch is on, Home renders only its background and the tab bar is
//   hidden, until Home is focused again after onboarding (endLaunch).
// - setOpen / isOpen: the onboarding screen while mounted, so neither Home nor the gate pushes it twice.

type State = {requested: boolean; launching: boolean; open: boolean};

export function createOnboardingLaunch() {
  let state: State = {requested: false, launching: false, open: false};
  const listeners = new Set<() => void>();

  const set = (next: Partial<State>) => {
    const changed = (Object.keys(next) as (keyof State)[]).some((k) => next[k] !== state[k]);
    state = {...state, ...next};
    if (changed) for (const listener of listeners) listener();
  };

  return {
    beginSignUp: () => set({requested: true}),
    cancelSignUp: () => set({requested: false, launching: false}),
    // Turns a sign-up's request into a launch; true while a launch is on (so a second call in the same mount, as
    // React's dev double render makes, agrees with the first). The launch lasts until endLaunch.
    takeLaunch(): boolean {
      if (state.requested) set({requested: false, launching: true});
      return state.launching;
    },
    endLaunch: () => set({launching: false}),
    isLaunching: () => state.launching,
    // requested or launching: what the tabs layout reads, since it renders before Home takes the launch
    isLaunchPending: () => state.requested || state.launching,
    setOpen: (open: boolean) => set({open}),
    isOpen: () => state.open,
    // for useSyncExternalStore (the tabs layout hides the tab bar while launching)
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export const onboardingLaunch = createOnboardingLaunch();
