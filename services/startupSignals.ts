// One-shot startup signals that work in every build (the trace is separate and preview-only).
// homeUsable fires once per app run, on the frame after Home first commits its loaded list. Work that must not
// compete with Home's first load waits for it. Pure: no React Native imports, so it runs under Node's test runner.

export function createOnceSignal() {
  let fired = false;
  const listeners = new Set<() => void>();

  function fire(): void {
    if (fired) return;
    fired = true;
    for (const listener of [...listeners]) listener();
    listeners.clear();
  }

  // Calls `listener` once: now if the signal already fired, otherwise when it fires. Returns the unsubscribe.
  function on(listener: () => void): () => void {
    if (fired) {
      listener();
      return () => {};
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {fire, on, hasFired: () => fired};
}

export type OnceSignal = ReturnType<typeof createOnceSignal>;

// Runs `start` `afterMs` after `signal` fires, or `fallbackMs` after this call if it never does (e.g. Home is
// stuck on an error). If the signal already fired, that is `afterMs` from now. `start` may return a stop
// function. Returns the cleanup: it cancels a start that is still pending, or calls the stop function.
export function startAfter(
  signal: OnceSignal,
  start: () => (() => void) | void,
  {afterMs, fallbackMs}: {afterMs: number; fallbackMs: number},
): () => void {
  let state: 'pending' | 'started' | 'cancelled' = 'pending';
  let stop: (() => void) | void;
  const go = () => {
    if (state !== 'pending') return;
    state = 'started';
    stop = start();
  };
  let timer = setTimeout(go, fallbackMs);
  const off = signal.on(() => {
    clearTimeout(timer);
    timer = setTimeout(go, afterMs);
  });
  return () => {
    const wasStarted = state === 'started';
    state = 'cancelled';
    clearTimeout(timer);
    off();
    if (wasStarted && stop) stop();
  };
}

export const homeUsable = createOnceSignal();
