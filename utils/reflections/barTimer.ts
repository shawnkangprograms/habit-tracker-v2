// The reflection bar's timer and announcement (docs/PACKS_REPORTS_SPEC.md, section 16; R-3). Pure: setTimeout and
// clearTimeout are injected (the component passes the real ones, tests a fake clock).
//
// The bar is gone after 8 s (20 s with a screen reader), counted only while nothing covers it: while a level-up or
// streak overlay is showing (utils/celebrations.ts coversBar) the timer doesn't run, and each time the bar is
// uncovered it gets its full time again (decided 2026-11-14). Its screen-reader announcement waits until it is first
// uncovered, so it isn't read out under the overlay; it is made once. Nothing runs until the duration is known (the
// screen-reader check is asynchronous).

export type TimerDeps<H> = {
  setTimeout: (fn: () => void, ms: number) => H;
  clearTimeout: (handle: H) => void;
  onExpire: () => void;
  announce: () => void;
};

export function createBarTimer<H>(deps: TimerDeps<H>) {
  let handle: H | null = null;
  let announced = false;
  let done = false;// expired or disposed: never starts again

  const stop = () => {
    if (handle !== null) deps.clearTimeout(handle);
    handle = null;
  };

  // covered: an overlay hides the bar now; durationMs: the bar's time, or null while not known yet
  function update(state: {covered: boolean; durationMs: number | null}): void {
    if (done) return;
    if (state.covered || state.durationMs === null) {
      stop();
      return;
    }
    if (handle !== null) return;// already counting, still uncovered
    if (!announced) {
      announced = true;
      deps.announce();
    }
    handle = deps.setTimeout(() => {
      handle = null;
      done = true;
      deps.onExpire();
    }, state.durationMs);
  }

  function dispose(): void {
    done = true;
    stop();
  }

  return {update, dispose};
}
