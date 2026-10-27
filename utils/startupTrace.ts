// Startup trace, for the preview build only: EXPO_PUBLIC_STARTUP_TRACE=1 in eas.json's preview profile.
// Expo inlines the flag at build time (dot notation only), so in any other build every mark() is a no-op.
// Pure: no React Native imports, so the phase maths runs under Node's test runner. Marks are performance.now()
// milliseconds (monotonic); a saved record stores them relative to its base (the bundle start).
// services/startupTraceStore.ts saves records; components/startup-trace-panel.tsx shows them.

export const TRACE_ON = process.env.EXPO_PUBLIC_STARTUP_TRACE === '1';

export type MarkName =
  | 'trace:firstImport'// this module evaluated: the first import in app/_layout.tsx
  | 'layout:rootEvaluated'// every import of app/_layout.tsx evaluated
  | 'layout:tabsEvaluated'
  | 'root:firstCommit'// the root layout's first commit (it renders nothing until the gate opens)
  | 'auth:initStart'// first getFirebaseAuth(): session restore starts
  | 'auth:firstCallback'
  | 'db:ready'
  | 'fonts:ready'
  | 'gate:open'// auth answered, db open and fonts loaded: the Stack renders
  | 'tabs:mount'// the splash hides about one frame after this
  | 'home:mount'
  | 'home:listCommitted'// the first commit with Home's list loaded
  | 'home:usable'// the frame after that commit: what the stopwatch measures
  | 'stats:published'
  | 'sync:firstCycleEnd'
  | 'admin:done'
  | 'disabled:done'
  | 'notif:schedulerStart'
  | 'notif:firstRebuildEnd'
  | 'services:start'
  | 'firestore:requireStart'
  | 'firestore:requireEnd';

export type Marks = Partial<Record<MarkName, number>>;

// performance.rnStartupTiming (React Native): in RN 0.86 all of its markers are logged around the bundle's
// evaluation, so it says when the bundle started and finished running, not when the process started.
export type RnStartupTiming = {
  startTime?: number | null;
  executeJavaScriptBundleEntryPointStart?: number | null;
  endTime?: number | null;
};

export type TraceRecord = {
  launch: number;// 1 = the first saved launch after install
  at: number;// wall clock (ms) of the first mark, to tell launches apart
  base: 'rnStartupTiming' | 'firstImport';// where 0 is
  rnEvalEnd: number | null;// bundle evaluation finished, relative to base; null if not usable
  raw: {firstImport: number | null; rnStart: number | null; rnEnd: number | null};// unprocessed, for diagnosis
  marks: Marks;// relative to base, whole ms
  hermes: string;// Hermes version, 'yes' if unknown, 'no' if another engine
  counts: {habits: number; completions: number} | null;// sizes only, never names
};

// One trace per app run. A name is recorded the first time only; later calls are no-ops.
export function createStartupTrace(options: {enabled: boolean; now: () => number}) {
  const marks: Marks = {};
  function mark(name: MarkName): void {
    if (!options.enabled || marks[name] !== undefined) return;
    marks[name] = options.now();
  }
  return {mark, marks: (): Marks => ({...marks})};
}

const trace = createStartupTrace({enabled: TRACE_ON, now: () => performance.now()});
export const mark = trace.mark;
export const getMarks = trace.marks;
mark('trace:firstImport');

const MAX_PLAUSIBLE_MS = 30 * 1000;

function finite(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

// The bundle start from rnStartupTiming, but only if it is on the same clock as performance.now(): it must be
// positive, not after this module's first import, and less than 30 s before it. Otherwise the first import is 0.
export function chooseBase(firstImport: number | undefined, rn: RnStartupTiming | null): {
  base: TraceRecord['base']; at: number; rnEnd: number | null;
} {
  const start = rn ? (finite(rn.executeJavaScriptBundleEntryPointStart) ? rn.executeJavaScriptBundleEntryPointStart : rn.startTime) : null;
  const first = firstImport ?? 0;
  if (finite(start) && start > 0 && start <= first && first - start < MAX_PLAUSIBLE_MS) {
    const end = rn?.endTime;
    const rnEnd = finite(end) && end >= start && end - start < MAX_PLAUSIBLE_MS ? end : null;
    return {base: 'rnStartupTiming', at: start, rnEnd};
  }
  return {base: 'firstImport', at: first, rnEnd: null};
}

export function buildRecord(input: {
  launch: number;
  wallClockAtFirstImport: number;
  marks: Marks;
  rn: RnStartupTiming | null;
  hermes: string;
  counts: TraceRecord['counts'];
}): TraceRecord {
  const {base, at, rnEnd} = chooseBase(input.marks['trace:firstImport'], input.rn);
  const marks: Marks = {};
  for (const [name, t] of Object.entries(input.marks) as [MarkName, number][]) {
    marks[name] = Math.round(t - at);
  }
  return {
    launch: input.launch,
    at: input.wallClockAtFirstImport,
    base,
    rnEvalEnd: rnEnd === null ? null : Math.round(rnEnd - at),
    raw: {
      firstImport: input.marks['trace:firstImport'] ?? null,
      rnStart: finite(input.rn?.executeJavaScriptBundleEntryPointStart) ? input.rn.executeJavaScriptBundleEntryPointStart : null,
      rnEnd: finite(input.rn?.endTime) ? input.rn.endTime : null,
    },
    marks,
    hermes: input.hermes,
    counts: input.counts,
  };
}

const GATE_PARTS = [
  ['auth', 'auth:firstCallback'],
  ['db', 'db:ready'],
  ['fonts', 'fonts:ready'],
] as const;

// Which of the three gate conditions finished last (the one that kept the splash up), or null if unknown
export function gateHeldBy(marks: Marks): 'auth' | 'db' | 'fonts' | null {
  let held: 'auth' | 'db' | 'fonts' | null = null;
  let latest = -Infinity;
  for (const [label, name] of GATE_PARTS) {
    const t = marks[name];
    if (t !== undefined && t > latest) {
      latest = t;
      held = label;
    }
  }
  return held;
}

export type TraceRow = {label: string; ms: number | null; note?: string};

function span(marks: Marks, from: MarkName | 0, to: MarkName): number | null {
  const start = from === 0 ? 0 : marks[from];
  const end = marks[to];
  return start === undefined || end === undefined ? null : end - start;
}

// The phases the panel shows, in order. Native start is not here: stopwatch total minus the first row.
export function summarise(record: TraceRecord): TraceRow[] {
  const m = record.marks;
  const held = gateHeldBy(m);
  const afterUsable = (label: string, name: MarkName): TraceRow => ({label, ms: span(m, 'home:usable', name), note: 'after usable'});
  // Firestore must load after Home is usable; a negative offset means something put it back on the startup path
  const firestoreAt = span(m, 'home:usable', 'firestore:requireStart');
  return [
    {label: 'JS span: bundle start to usable', ms: span(m, 0, 'home:usable'), note: 'stopwatch minus this = native start'},
    {label: 'Bundle evaluated (RN timing)', ms: record.rnEvalEnd},
    {label: 'Bundle start to first import', ms: span(m, 0, 'trace:firstImport')},
    {label: 'Root layout imports', ms: span(m, 'trace:firstImport', 'layout:rootEvaluated')},
    {label: 'Imports to first commit', ms: span(m, 'layout:rootEvaluated', 'root:firstCommit')},
    {label: 'Gate wait (first commit to gate open)', ms: span(m, 'root:firstCommit', 'gate:open'), note: held ? `held by ${held}` : undefined},
    {label: '  auth: init to first callback', ms: span(m, 'auth:initStart', 'auth:firstCallback')},
    {label: '  db ready', ms: span(m, 0, 'db:ready'), note: 'from bundle start'},
    {label: '  fonts ready', ms: span(m, 0, 'fonts:ready'), note: 'from bundle start'},
    {label: 'First render (gate open to Home mount)', ms: span(m, 'gate:open', 'home:mount')},
    {label: 'Home data (mount to usable)', ms: span(m, 'home:mount', 'home:usable')},
    afterUsable('Stats published', 'stats:published'),
    afterUsable('Sync, admin and disabled checks started', 'services:start'),
    {
      label: 'Firestore SDK load',
      ms: span(m, 'firestore:requireStart', 'firestore:requireEnd'),
      note: firestoreAt === null ? undefined : firestoreAt >= 0 ? `started ${firestoreAt} ms after usable` : 'BEFORE usable',
    },
    afterUsable('Sync first cycle ended', 'sync:firstCycleEnd'),
    afterUsable('Admin check done', 'admin:done'),
    afterUsable('Disabled check done', 'disabled:done'),
    afterUsable('Notification scheduler started', 'notif:schedulerStart'),
    afterUsable('First schedule rebuild done', 'notif:firstRebuildEnd'),
  ];
}

// Plain text for the Share button
export function traceToText(records: TraceRecord[]): string {
  return records.map((r) => {
    const rows = summarise(r).map((row) => `${row.label}: ${row.ms === null ? 'n/a' : `${row.ms} ms`}${row.note ? ` (${row.note})` : ''}`);
    const marks = Object.entries(r.marks).map(([name, t]) => `  ${name} ${t}`);
    return [
      `Launch ${r.launch} at ${new Date(r.at).toISOString()} | base ${r.base} | Hermes ${r.hermes}` +
        (r.counts ? ` | ${r.counts.habits} habits, ${r.counts.completions} completion rows` : ''),
      ...rows,
      'Marks (ms from base):',
      ...marks,
      `Raw: firstImport ${r.raw.firstImport}, rnStart ${r.raw.rnStart}, rnEnd ${r.raw.rnEnd}`,
    ].join('\n');
  }).join('\n\n');
}
