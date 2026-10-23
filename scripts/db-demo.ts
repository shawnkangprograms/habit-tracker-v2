/// <reference types="node" />
// Meeting 3 database demo: structure, 3NF evidence and integrity, shown on a throwaway database.
// It never touches real data: the database is in memory (node:sqlite), built by the app's REAL migration
// (db/schema.js, through tests/helpers/sqlite-adapter.ts), and seeded with fictional rows. No file is opened
// or written, and there is no Firebase or network access.
//
//   npm run demo:db                       every section, waiting for Enter after each
//   npm run demo:db -- integrity          one section: schema | data | 3nf | integrity | summary
//   npm run demo:db -- --no-pause         no waiting (tests/db-demo.test.ts runs it this way)
//
// Exit code: 0 all good; 1 an integrity attempt was NOT rejected, a 3NF check failed or the app-level
// frequency rule is violated; 2 unknown arguments.
import '../tests/helpers/alias.ts'; // must come before the dynamic imports below
import {createInterface} from 'node:readline/promises';
import type {SQLInputValue} from 'node:sqlite';
import {createTestDatabase, type TestDb} from '../tests/helpers/sqlite-adapter.ts';
import type {GamificationStats} from '../utils/gamification.ts';

const {DATABASE_VERSION} = await import('../db/schema.js');
const {getGamificationStats} = await import('../db/gamificationCore.js');
const {getActiveHabitsWithDays} = await import('../db/habitsCore.js');
const {getLocalDateString, getLocalWeekdayKey} = await import('../utils/dates.ts');

// ---------- Arguments ----------

const SECTIONS = ['schema', 'data', '3nf', 'integrity', 'summary'] as const;
type Section = (typeof SECTIONS)[number];

const args = process.argv.slice(2);
const noPause = args.includes('--no-pause') || !process.stdin.isTTY;
const positional = args.filter((a) => !a.startsWith('--')).map((a) => a.toLowerCase());
const unknown = [
  ...args.filter((a) => a.startsWith('--') && a !== '--no-pause'),
  ...positional.filter((a) => !(SECTIONS as readonly string[]).includes(a)),
];
if (unknown.length > 0 || positional.length > 1) {
  console.error(`Unknown or extra arguments: ${args.join(' ')}`);
  console.error(`Usage: npm run demo:db -- [${SECTIONS.join(' | ')}] [--no-pause]`);
  process.exit(2);
}
const only = positional[0] as Section | undefined;

// ---------- Output: plain text, every line under 100 characters ----------

const WIDTH = 98;
let quiet = false; // true while `summary` alone re-runs the checks it reports on

function wrap(text: string, hang?: string): string[] {
  if (text.length <= WIDTH) return [text];
  const indent = /^ */.exec(text)![0];
  const cont = hang ?? indent + '    ';
  const lines: string[] = [];
  let current = '';
  // split on single spaces so padding inside a line ("PASS    ...") survives; empty words are those spaces
  for (const word of text.slice(indent.length).split(' ')) {
    if (current === '') current = (lines.length === 0 ? indent : cont) + word;
    else if (word === '' && current.length >= WIDTH) continue;
    else if (current.length + 1 + word.length <= WIDTH) current += ' ' + word;
    else {
      lines.push(current);
      current = cont + word;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

function say(text = '', hang?: string): void {
  if (!quiet) for (const line of wrap(text, hang)) console.log(line);
}

function heading(n: number, title: string): void {
  say();
  say('='.repeat(WIDTH));
  say(`${n}. ${title}`);
  say('='.repeat(WIDTH));
}

function sub(title: string): void {
  say();
  say(title);
  say('-'.repeat(title.length));
}

async function pause(): Promise<void> {
  if (noPause || quiet) return;
  const rl = createInterface({input: process.stdin, output: process.stdout});
  await rl.question('\n  Press Enter to continue ');
  rl.close();
}

const LABEL_HANG = ' '.repeat(10);
const tally = {pass: 0, argued: 0, fail: 0, violations: 0, attempted: 0, rejected: 0, problems: [] as string[]};

function pass(text: string): void {
  tally.pass += 1;
  say(`  PASS    ${text}`, LABEL_HANG);
}

function argued(text: string): void {
  tally.argued += 1;
  say(`  ARGUED  ${text} - argued in the 3NF document`, LABEL_HANG);
}

function check(ok: boolean, text: string): void {
  if (ok) return pass(text);
  tally.fail += 1;
  tally.problems.push(`3NF check failed: ${text}`);
  say(`  FAIL    ${text}`, LABEL_HANG);
}

const list = (items: readonly unknown[]) => (items.length === 0 ? 'none' : items.join(', '));

// ---------- Fictional seed data (no real names or emails) ----------

const DEMO_TODAY = '2026-10-21'; // fixed, so every run (and the test) prints the same numbers
const HISTORY_DAYS = 21;
const GAP_DAY = '2026-10-11'; // user A did nothing this day, which breaks the streak (section 3d)

const USER_A = 'demo-user-a';
const USER_B = 'demo-user-b';
const A_READ = 'aaaaaaaa-0000-4000-8000-000000000001';
const A_RUN = 'aaaaaaaa-0000-4000-8000-000000000002';
const A_WATER = 'aaaaaaaa-0000-4000-8000-000000000003';
const B_STRETCH = 'bbbbbbbb-0000-4000-8000-000000000001';
const MISSING_HABIT = 'ffffffff-0000-4000-8000-00000000dead';

// Local noon, so converting createdAt back to a local date can never land on the neighbouring day
function noonOf(date: string, offsetDays = 0): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + offsetDays, 12);
}

const HISTORY = Array.from({length: HISTORY_DAYS}, (_, i) => noonOf(DEMO_TODAY, i - (HISTORY_DAYS - 1)));
const CREATED_AT = HISTORY[0].getTime();

type SeedHabit = {
  habitId: string; userId: string; habitName: string; icon: string; frequencyType: 'daily' | 'weekdays';
  days: string[]; reminderTime: string | null; alarm: number; remindBeforeMin: number; source: string;
  done: (date: string, index: number) => boolean;
};

const SEED_HABITS: SeedHabit[] = [
  {
    habitId: A_READ, userId: USER_A, habitName: 'Read 10 pages', icon: 'book', frequencyType: 'daily',
    days: [], reminderTime: '07:30', alarm: 0, remindBeforeMin: 0, source: 'user',
    done: (date) => date !== GAP_DAY,
  },
  {
    habitId: A_RUN, userId: USER_A, habitName: 'Morning run', icon: 'run', frequencyType: 'weekdays',
    days: ['mon', 'wed', 'fri'], reminderTime: '06:15', alarm: 1, remindBeforeMin: 10, source: 'user',
    done: (date) => date !== '2026-10-09' && date !== DEMO_TODAY,
  },
  {
    habitId: A_WATER, userId: USER_A, habitName: 'Drink water', icon: 'water', frequencyType: 'daily',
    days: [], reminderTime: null, alarm: 0, remindBeforeMin: 0, source: 'ai_suggested',
    done: (date, i) => i % 3 !== 2 && date !== GAP_DAY && date !== DEMO_TODAY,
  },
  {
    habitId: B_STRETCH, userId: USER_B, habitName: 'Stretch', icon: 'heart', frequencyType: 'weekdays',
    days: ['tue', 'thu', 'sat'], reminderTime: '21:00', alarm: 0, remindBeforeMin: 5, source: 'user',
    done: (date) => date !== '2026-10-13',
  },
];

const HABIT_COLS = [
  'habitId', 'userId', 'habitName', 'icon', 'frequencyType', 'reminderTime', 'alarm', 'remindBeforeMin',
  'source', 'createdAt', 'updatedAt', 'deleted', 'synced',
];
const COMPLETION_COLS = ['habitId', 'date', 'completed', 'updatedAt', 'synced'];
type Row = Record<string, SQLInputValue>;

function insertSql(table: string, cols: string[], row: Row): [string, SQLInputValue[]] {
  return [
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    cols.map((c) => row[c]),
  ];
}

async function seed(db: TestDb): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const h of SEED_HABITS) {
      const {days: _days, done: _done, ...columns} = h;
      const row: Row = {...columns, createdAt: CREATED_AT, updatedAt: CREATED_AT, deleted: 0, synced: 1};
      await db.runAsync(...insertSql('habits', HABIT_COLS, row));
      for (const day of h.days) await db.runAsync('INSERT INTO habitDays (habitId, day) VALUES (?, ?)', [h.habitId, day]);

      // one explicit row per scheduled day: completed rows carry a user-action time, missed ones are system rows
      for (const [i, noon] of HISTORY.entries()) {
        if (h.frequencyType === 'weekdays' && !h.days.includes(getLocalWeekdayKey(noon))) continue;
        const date = getLocalDateString(noon);
        const done = h.done(date, i);
        await db.runAsync(...insertSql('completions', COMPLETION_COLS, {
          habitId: h.habitId, date, completed: done ? 1 : 0,
          updatedAt: done ? noon.getTime() + 3_600_000 : 0, synced: done ? 1 : 0,
        }));
      }
    }
  });
}

// ---------- Reading the schema from the database itself ----------

type Column = {name: string; type: string; notnull: number; dflt_value: string | null; pk: number};
type ForeignKey = {id: number; table: string; from: string; to: string; on_delete: string; on_update: string};
type Index = {name: string; unique: number; origin: string; columns: string[]};
type TableInfo = {
  name: string; sql: string; columns: Column[]; key: string[]; foreignKeys: ForeignKey[]; indexes: Index[];
  checks: string[]; strict: boolean;
};

// Every CHECK ( ... ) expression in a CREATE TABLE statement, with balanced parentheses
function extractChecks(sql: string): string[] {
  const found: string[] = [];
  const re = /CHECK\s*\(/gi;
  for (let m = re.exec(sql); m !== null; m = re.exec(sql)) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < sql.length && depth > 0; i++) {
      if (sql[i] === '(') depth += 1;
      else if (sql[i] === ')') depth -= 1;
    }
    found.push(sql.slice(re.lastIndex, i - 1).replace(/\s+/g, ' ').trim());
    re.lastIndex = i;
  }
  return found;
}

async function loadSchema(db: TestDb): Promise<TableInfo[]> {
  const tables = await db.getAllAsync<{name: string; sql: string}>(
    `SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid`,
  );
  const result: TableInfo[] = [];
  for (const {name, sql} of tables) {
    // table names come from sqlite_master, never from user input
    const columns = await db.getAllAsync<Column>(`PRAGMA table_info(${name})`);
    const indexes: Index[] = [];
    for (const idx of await db.getAllAsync<Omit<Index, 'columns'>>(`PRAGMA index_list(${name})`)) {
      const cols = await db.getAllAsync<{name: string}>(`PRAGMA index_info(${idx.name})`);
      indexes.push({name: idx.name, unique: idx.unique, origin: idx.origin, columns: cols.map((c) => c.name)});
    }
    result.push({
      name, sql, columns,
      key: columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name),
      foreignKeys: await db.getAllAsync<ForeignKey>(`PRAGMA foreign_key_list(${name})`),
      indexes,
      checks: extractChecks(sql),
      strict: /\)\s*STRICT\s*$/i.test(sql),
    });
  }
  return result;
}

// A CHECK expression in plain words; anything not recognised is shown as written
function plainCheck(expr: string): string {
  let m = /^(\w+) IN \((.+)\)$/.exec(expr);
  if (m) return `${m[1]} must be one of: ${m[2].replace(/'/g, '')}`;
  m = /^length\((\w+)\) > 0$/.exec(expr);
  if (m) return `${m[1]} must not be empty`;
  m = /^length\((\w+)\) BETWEEN (\d+) AND (\d+)$/.exec(expr);
  if (m) return `${m[1]} must be ${m[2]} to ${m[3]} characters long`;
  m = /^(\w+) GLOB '(.+)'$/.exec(expr);
  if (m) return `${m[1]} must have the shape 2026-10-21: four digits, dash, two digits, dash, two digits`;
  return `as written: ${expr}`;
}

function nonKey(t: TableInfo): string[] {
  return t.columns.filter((c) => c.pk === 0).map((c) => c.name);
}

function constraintCounts(schema: TableInfo[]) {
  return {
    primaryKeys: schema.filter((t) => t.key.length > 0).length,
    foreignKeys: schema.reduce((n, t) => n + new Set(t.foreignKeys.map((f) => f.id)).size, 0),
    checks: schema.reduce((n, t) => n + t.checks.length, 0),
    notNull: schema.reduce((n, t) => n + t.columns.filter((c) => c.notnull === 1).length, 0),
    explicitUnique: schema.reduce((n, t) => n + t.indexes.filter((i) => i.origin === 'u').length, 0),
    uniqueIndexes: schema.reduce((n, t) => n + t.indexes.filter((i) => i.unique === 1).length, 0),
  };
}

// ---------- Running SQL that must be thrown away ----------

// Runs the statements in a transaction that is ALWAYS rolled back. Returns null if every statement was
// accepted, or the database error message.
function tryAndRollBack(db: TestDb, statements: [string, SQLInputValue[]][]): string | null {
  db.raw.exec('BEGIN');
  try {
    for (const [sql, params] of statements) db.raw.prepare(sql).run(...params);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  } finally {
    db.raw.exec('ROLLBACK');
  }
}

// ---------- 1. Schema ----------

async function showSchema(db: TestDb, schema: TableInfo[]): Promise<void> {
  heading(1, 'SCHEMA: tables, columns, keys, indexes and rules');
  const version = (await db.getFirstAsync<{user_version: number}>('PRAGMA user_version'))!.user_version;
  const fk = (await db.getFirstAsync<{foreign_keys: number}>('PRAGMA foreign_keys'))!.foreign_keys;
  const file = (await db.getFirstAsync<{file: string}>('PRAGMA database_list'))!.file;
  say(`  Database file: ${file === '' ? 'none (in memory, discarded when the script ends)' : file}`);
  say(`  user_version: ${version} (the app's DATABASE_VERSION is ${DATABASE_VERSION})`);
  say(`  Foreign key enforcement: ${fk === 1 ? 'ON' : 'OFF'} (the app turns it on for every connection)`);

  for (const t of schema) {
    sub(`Table ${t.name}`);
    say('  Columns');
    for (const c of t.columns) {
      const notes = [
        c.notnull === 1 ? 'NOT NULL' : 'may be NULL',
        c.dflt_value !== null ? `default ${c.dflt_value}` : '',
        c.pk > 0 ? (t.key.length > 1 ? `key part ${c.pk} of ${t.key.length}` : 'key') : '',
      ].filter(Boolean);
      say(`    ${c.name.padEnd(16)} ${c.type.padEnd(8)} ${notes.join(', ')}`);
    }
    say(`  Primary key: (${t.key.join(', ')}) - no two rows may share it, and it may not be NULL`);
    if (t.foreignKeys.length === 0) say('  Foreign keys: none');
    for (const f of t.foreignKeys) {
      say(`  Foreign key: ${t.name}.${f.from} -> ${f.table}.${f.to} (on delete ${f.on_delete})`);
      say(`    every ${t.name} row must point at an existing ${f.table} row, and a ${f.table} row`
        + ` that still has ${t.name} rows cannot be deleted`);
    }
    for (const i of t.indexes) {
      const origin = i.origin === 'pk' ? 'created by the primary key' : `origin ${i.origin}`;
      say(`  Index: ${i.name} on (${i.columns.join(', ')}), ${i.unique ? 'unique' : 'not unique'}, ${origin}`);
    }
    say('  Rules (CHECK)');
    if (t.checks.length === 0) say('    none');
    for (const expr of t.checks) say(`    - ${plainCheck(expr)}`);
  }

  const n = constraintCounts(schema);
  sub('Totals');
  say(`  ${schema.length} tables, ${n.primaryKeys} primary keys, ${n.foreignKeys} foreign keys,`
    + ` ${n.checks} CHECK rules, ${n.notNull} NOT NULL columns`);
  say(`  Explicit UNIQUE constraints: ${n.explicitUnique} (uniqueness comes from the ${n.uniqueIndexes}`
    + ' primary key indexes)');
}

// ---------- 2. Data ----------

async function showData(db: TestDb, schema: TableInfo[]): Promise<void> {
  heading(2, 'DATA: fictional seed rows');
  say(`  Two fictional users (${USER_A}, ${USER_B}), ${HISTORY_DAYS} days of history ending ${DEMO_TODAY}.`);
  sub('Row counts');
  for (const t of schema) {
    const n = (await db.getFirstAsync<{n: number}>(`SELECT COUNT(*) AS n FROM ${t.name}`))!.n;
    say(`  ${t.name.padEnd(12)} ${String(n).padStart(4)} rows`);
  }
  const perUser = await db.getAllAsync<{userId: string; n: number}>(
    'SELECT userId, COUNT(*) AS n FROM habits GROUP BY userId ORDER BY userId',
  );
  for (const u of perUser) say(`  habits of ${u.userId}: ${u.n}`);

  sub('Joined sample: one weekday habit, its weekdays and its latest completions');
  const habits = await getActiveHabitsWithDays(db, USER_A);
  const run = habits.find((h: {habitId: string}) => h.habitId === A_RUN);
  say(`  Habit ${run.habitId}`);
  say(`    name "${run.habitName}", icon ${run.icon}, ${run.frequencyType}, reminder ${run.reminderTime ?? 'none'}`);
  say(`    weekdays (one habitDays row each): ${run.days.join(' | ')}`);
  say('  SELECT h.habitName, c.date, c.completed FROM completions c');
  say('    JOIN habits h ON h.habitId = c.habitId WHERE h.habitId = ? ORDER BY c.date DESC LIMIT 5');
  const latest = await db.getAllAsync<{habitName: string; date: string; completed: number}>(
    `SELECT h.habitName, c.date, c.completed FROM completions c
    JOIN habits h ON h.habitId = c.habitId WHERE h.habitId = ? ORDER BY c.date DESC LIMIT 5`,
    [A_RUN],
  );
  for (const r of latest) {
    say(`    ${r.habitName.padEnd(14)} ${r.date} ${getLocalWeekdayKey(noonOf(r.date))}  completed ${r.completed}`);
  }
}

// ---------- 3. 3NF evidence ----------

const DERIVED_NAME = /xp|level|streak|badge|medal|score|points|total|perfect|count|progress|rank/i;

async function stats(db: TestDb): Promise<GamificationStats> {
  return getGamificationStats(db, USER_A, DEMO_TODAY);
}

async function showNormalForm(db: TestDb, schema: TableInfo[]): Promise<void> {
  heading(3, '3NF EVIDENCE: computed from the database where it can be checked');
  const byName = new Map(schema.map((t) => [t.name, t]));
  const habits = byName.get('habits');
  const habitDays = byName.get('habitDays');
  if (!habits || !habitDays || !byName.get('completions')) {
    check(false, 'the tables habits, habitDays and completions exist');
    return;
  }

  sub('3a. Keys and functional dependencies (key -> every other column)');
  for (const t of schema) {
    const rest = nonKey(t);
    const key = t.key.length === 1 ? t.key[0] : `(${t.key.join(', ')})`;
    say(`  ${t.name}`);
    if (rest.length === 0) say(`    ${key}: every column is part of the key; there are no non-key columns`);
    else say(`    ${key} -> ${rest.join(', ')}`, ' '.repeat(key.length + 8));
  }
  say();
  for (const t of schema) {
    const rest = nonKey(t);
    if (rest.length === 0) {
      pass(`${t.name} 2NF and 3NF: no non-key columns, so no partial or transitive dependency exists`);
    } else if (t.key.length === 1) {
      pass(`${t.name} 2NF: the key is a single column, so nothing can depend on part of it`);
      argued(`${t.name} 3NF: no non-key column determines another non-key column`);
    } else {
      argued(`${t.name} 2NF: ${rest.join(', ')} describe one habit on one date, not the habit or the date alone`);
      argued(`${t.name} 3NF: no non-key column determines another non-key column`);
    }
  }
  const withUserId = schema.filter((t) => t.columns.some((c) => c.name === 'userId')).map((t) => t.name);
  check(
    withUserId.length === 1 && withUserId[0] === 'habits',
    `userId is stored only in habits (found in: ${list(withUserId)}); habitDays and completions`
      + ' reach the owner through habitId, so it is not repeated',
  );
  const fks = schema.flatMap((t) => t.foreignKeys.map((f) => ({...f, child: t.name})));
  const fksToKey = fks.every((f) => {
    const parent = byName.get(f.table);
    return parent !== undefined && parent.key.length === 1 && parent.key[0] === f.to;
  });
  check(fks.length > 0 && fksToKey, `every foreign key (${fks.length}) references the whole primary key of its table:`
    + ` ${fks.map((f) => `${f.child}.${f.from} -> ${f.table}.${f.to}`).join(', ')}`);

  sub('3b. 1NF: atomic values, no repeating groups');
  check(schema.every((t) => t.key.length > 0), 'every table has a primary key');
  const listCols = habits.columns.filter((c) => /^(days|weekdays|schedule|list)$/i.test(c.name));
  check(listCols.length === 0, 'habits has no column holding a list of days; the schedule lives in habitDays rows');
  const dayCheck = habitDays.checks.map((e) => /^day IN \((.+)\)$/.exec(e)).find((m) => m !== null);
  const allowed = dayCheck ? dayCheck[1].replace(/'/g, '').split(/,\s*/) : [];
  check(allowed.length === 7, `the allowed weekdays are read from the schema's CHECK: ${allowed.join(', ')}`);
  const dayRows = await db.getAllAsync<{habitId: string; day: string}>('SELECT habitId, day FROM habitDays');
  const badDays = dayRows.filter((r) => !allowed.includes(r.day) || /[,\[\]{} ]/.test(r.day));
  check(
    dayRows.length > 0 && badDays.length === 0,
    `habitDays holds one weekday per row: ${dayRows.length} rows, every value is a single key from the`
      + ` allowed set (bad values: ${badDays.length})`,
  );
  const runDays = dayRows.filter((r) => r.habitId === A_RUN).map((r) => r.day);
  say(`          e.g. "Morning run" is ${runDays.length} rows: ${runDays.join(' | ')}, not one value "mon,wed,fri"`);
  check(
    habitDays.key.join(',') === 'habitId,day',
    'the key of habitDays is (habitId, day), so a habit cannot list the same weekday twice',
  );

  sub('3c. No derived value is stored');
  const scanned = schema.flatMap((t) => t.columns.map((c) => `${t.name}.${c.name}`));
  const derived = scanned.filter((c) => DERIVED_NAME.test(c.split('.')[1]));
  check(
    derived.length === 0,
    `${scanned.length} columns scanned for xp, level, streak, badge, medal, score, points, total,`
      + ` perfect, count, progress, rank: found ${list(derived)}`,
  );
  const triggers = (await db.getFirstAsync<{n: number}>(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'`,
  ))!.n;
  check(triggers === 0, `no triggers (${triggers}) that could copy or recompute values behind the scenes`);

  sub('3d. XP, level, streak and badges are computed live from the completion rows');
  say(`  ${USER_A}, today = ${DEMO_TODAY}, by db/gamificationCore.js and utils/gamification.ts (app code)`);
  const completedRows = async () => (await db.getFirstAsync<{n: number}>(
    `SELECT COUNT(*) AS n FROM completions c JOIN habits h ON h.habitId = c.habitId
    WHERE h.userId = ? AND c.completed = 1`,
    [USER_A],
  ))!.n;
  const changes = async () => (await db.getFirstAsync<{n: number}>('SELECT total_changes() AS n'))!.n;
  const flip = (completed: number, updatedAt: number) => db.runAsync(
    'UPDATE completions SET completed = ?, updatedAt = ?, synced = 0 WHERE habitId = ? AND date = ?',
    [completed, updatedAt, A_READ, GAP_DAY],
  );

  const before = await stats(db);
  const rowsBefore = await completedRows();
  const changesBefore = await changes();
  await flip(1, noonOf(GAP_DAY).getTime());
  const rowsWritten = (await changes()) - changesBefore;
  const after = await stats(db);
  const rowsAfter = await completedRows();
  await flip(0, 0);
  const undone = await stats(db);

  say(`  Change: completions (${A_READ.slice(0, 8)}..., ${GAP_DAY}) completed 0 -> 1, then back to 0`);
  say();
  say(`  ${''.padEnd(22)}${'before'.padStart(10)}${'after change'.padStart(16)}${'after undo'.padStart(14)}`);
  const table: [string, (s: GamificationStats) => string | number, string | number][] = [
    ['completed rows', () => rowsBefore, rowsAfter],
    ['total XP', (s) => s.totalXp, after.totalXp],
    ['level', (s) => s.level, after.level],
    ['current streak (days)', (s) => s.currentStreak, after.currentStreak],
    ['longest streak (days)', (s) => s.longestStreak, after.longestStreak],
    ['badges (streak days)', (s) => list(s.badges), list(after.badges)],
  ];
  for (const [label, get, afterValue] of table) {
    const undoValue = label === 'completed rows' ? rowsBefore : get(undone);
    say(`  ${label.padEnd(22)}${String(get(before)).padStart(10)}${String(afterValue).padStart(16)}`
      + `${String(undoValue).padStart(14)}`);
  }
  say();
  check(rowsWritten === 1, `the change wrote exactly ${rowsWritten} row; no stored total had to be updated`);
  check(after.totalXp !== before.totalXp, `XP followed the row: ${before.totalXp} -> ${after.totalXp}`);
  check(
    JSON.stringify(undone) === JSON.stringify(before),
    'undoing the row restored every number exactly; there is nothing to keep in sync',
  );

  sub('3e. Consistency audit: frequencyType vs habitDays');
  say('  APP-LEVEL RULE, not a database constraint: a daily habit has no habitDays rows, and a weekday');
  say('  habit has at least one. The database would accept a violation (see Known gaps); this counts them.');
  const violations = await db.getAllAsync<{habitId: string; frequencyType: string; n: number}>(
    `SELECT h.habitId, h.frequencyType, COUNT(d.day) AS n FROM habits h
    LEFT JOIN habitDays d ON d.habitId = h.habitId
    GROUP BY h.habitId
    HAVING (h.frequencyType = 'daily' AND COUNT(d.day) > 0) OR (h.frequencyType = 'weekdays' AND COUNT(d.day) = 0)`,
  );
  tally.violations = violations.length;
  const total = (await db.getFirstAsync<{n: number}>('SELECT COUNT(*) AS n FROM habits'))!.n;
  say(`  ${total} habits audited: ${violations.length} violations`);
  for (const v of violations) say(`    ${v.habitId} is ${v.frequencyType} with ${v.n} habitDays rows`);
  if (violations.length > 0) tally.problems.push(`${violations.length} habits break the frequencyType/habitDays rule`);
}

// ---------- 4. Integrity ----------

const NOW = noonOf(DEMO_TODAY).getTime();
const BASE_HABIT: Row = {
  habitId: 'cccccccc-0000-4000-8000-000000000001', userId: USER_A, habitName: 'Journal', icon: 'star',
  frequencyType: 'daily', reminderTime: null, alarm: 0, remindBeforeMin: 0, source: 'user',
  createdAt: NOW, updatedAt: NOW, deleted: 0, synced: 0,
};
const BASE_COMPLETION: Row = {habitId: A_READ, date: '2026-09-30', completed: 1, updatedAt: NOW, synced: 0};

const habitInsert = (over: Row) => insertSql('habits', HABIT_COLS, {...BASE_HABIT, ...over});
const completionInsert = (over: Row) => insertSql('completions', COMPLETION_COLS, {...BASE_COMPLETION, ...over});
const dayInsert = (habitId: string, day: string): [string, SQLInputValue[]] =>
  ['INSERT INTO habitDays (habitId, day) VALUES (?, ?)', [habitId, day]];

type Attempt = {what: string; statement: [string, SQLInputValue[]]};

// Every rule here exists in db/schema.js. Each attempt breaks exactly one rule of an otherwise valid row
// (the controls below prove the valid rows are accepted).
const ATTEMPTS: Attempt[] = [
  {what: 'habits.remindBeforeMin = 7', statement: habitInsert({remindBeforeMin: 7})},
  {what: 'habits.alarm = 2', statement: habitInsert({alarm: 2})},
  {what: "habitDays.day = 'monday' (not in the allowed set)", statement: dayInsert(A_RUN, 'monday')},
  {what: 'a completion for a habit that does not exist', statement: completionInsert({habitId: MISSING_HABIT})},
  {what: `a second completion for the same habit and day (${DEMO_TODAY})`, statement: completionInsert({date: DEMO_TODAY})},
  {what: 'a habitDays row for a habit that does not exist', statement: dayInsert(MISSING_HABIT, 'mon')},
  {what: "the same weekday twice for one habit ('mon')", statement: dayInsert(A_RUN, 'mon')},
  {what: 'a second habit with an existing habitId', statement: habitInsert({habitId: A_READ})},
  {what: "habits.frequencyType = 'monthly'", statement: habitInsert({frequencyType: 'monthly'})},
  {what: "habits.source = 'imported'", statement: habitInsert({source: 'imported'})},
  {what: 'habits.deleted = 2', statement: habitInsert({deleted: 2})},
  {what: 'habits.synced = 2', statement: habitInsert({synced: 2})},
  {what: "habits.userId = '' (empty)", statement: habitInsert({userId: ''})},
  {what: "habits.habitName = '' (empty)", statement: habitInsert({habitName: ''})},
  {what: 'habits.habitName of 31 characters', statement: habitInsert({habitName: 'x'.repeat(31)})},
  {what: 'habits.icon = NULL', statement: habitInsert({icon: null})},
  {what: 'completions.completed = 2', statement: completionInsert({completed: 2})},
  {what: 'completions.synced = 2', statement: completionInsert({synced: 2})},
  {what: "completions.date = 'yesterday'", statement: completionInsert({date: 'yesterday'})},
  {what: 'completions.date = NULL', statement: completionInsert({date: null})},
  {
    what: 'hard-deleting a habit that has completions (the app soft-deletes instead)',
    statement: ['DELETE FROM habits WHERE habitId = ?', [A_READ]],
  },
];

const CONTROLS: Attempt[] = [
  {what: 'a valid new habit', statement: habitInsert({})},
  {what: 'a valid new weekday for an existing habit', statement: dayInsert(A_RUN, 'tue')},
  {what: 'a valid completion for a new date', statement: completionInsert({})},
];

function showIntegrity(db: TestDb): void {
  heading(4, 'INTEGRITY: the database itself rejects invalid rows');
  say('  Each attempt runs in a transaction that is rolled back, so nothing is kept either way.');
  sub('Controls: the same statements with valid values are accepted');
  for (const c of CONTROLS) {
    const error = tryAndRollBack(db, [c.statement]);
    if (error === null) say(`  ACCEPTED: ${c.what}`);
    else {
      tally.problems.push(`control rejected: ${c.what}`);
      say(`  !!! CONTROL REJECTED: ${c.what} -> ${error} (fix the demo before using it)`);
    }
  }
  sub('Attempts that must fail');
  tally.attempted = 0;
  tally.rejected = 0;
  for (const a of ATTEMPTS) {
    tally.attempted += 1;
    const error = tryAndRollBack(db, [a.statement]);
    if (error !== null && /constraint failed/i.test(error)) {
      tally.rejected += 1;
      say(`  REJECTED: ${a.what} -> ${error}`);
    } else if (error !== null) {
      tally.problems.push(`attempt failed for a reason other than a constraint: ${a.what}`);
      say(`  !!! ERROR, NOT A CONSTRAINT: ${a.what} -> ${error} (fix the demo before using it)`);
    } else {
      tally.problems.push(`NOT REJECTED: ${a.what}`);
      say('  ' + '!'.repeat(60));
      say(`  !!! NOT REJECTED: ${a.what}`);
      say('  ' + '!'.repeat(60));
    }
  }
  say();
  say(`  ${tally.rejected} of ${tally.attempted} attempts rejected by the database`);
}

// ---------- 5. Summary and known gaps ----------

type Gap = {
  title: string;
  probe: string; // what is tried; it must be ACCEPTED for the gap to be confirmed
  statements: (schema: TableInfo[]) => [string, SQLInputValue[]][];
  fact?: (schema: TableInfo[]) => string;
  enforcedIn: string[];
};

// Each probe is run now, in a rolled-back transaction. Where-enforced lines were checked against the code.
const GAPS: Gap[] = [
  {
    title: 'No STRICT tables: SQLite stores a value of the wrong type instead of rejecting it',
    probe: "habits.createdAt = 'abc' (text in an INTEGER column)",
    statements: () => [habitInsert({createdAt: 'abc'})],
    fact: (schema) => `${schema.filter((t) => t.strict).length} of ${schema.length} tables are STRICT`,
    enforcedIn: [
      'db/habits.js: createdAt/updatedAt are always Date.now(); alarm stored as 0/1 from a boolean',
      'validation/validators.ts: validateAlarm, validateRemindBeforeMin, validateCompleted (strict types)',
      'sync/merge.ts: docToHabit / docToCompletion require integers on pull',
      'firestore.rules: createdAt is int, completed is int in [0, 1] on push',
    ],
  },
  {
    title: 'The date CHECK checks only the shape, so an impossible date is accepted',
    probe: "completions.date = '2026-02-30'",
    statements: () => [completionInsert({date: '2026-02-30'})],
    enforcedIn: [
      'utils/dates.ts: getLocalDateString creates every local date from a real Date',
      'sync/merge.ts: isDate (via parseCompletionDocId) rejects impossible dates on pull',
      'firestore.rules: only the digit pattern is checked, so the same gap exists there',
    ],
  },
  {
    title: 'frequencyType vs habitDays is enforced only by app code',
    probe: 'a daily habit with a habitDays row, and a weekday habit with none',
    statements: () => [
      habitInsert({}),
      dayInsert(String(BASE_HABIT.habitId), 'mon'),
      habitInsert({habitId: 'cccccccc-0000-4000-8000-000000000002', frequencyType: 'weekdays'}),
    ],
    enforcedIn: [
      'validation/validators.ts: validateFrequency (weekdays need at least one day)',
      'db/habits.js: insertHabitDays writes rows only for weekday habits',
      'db/syncCore.js: writeHabit writes rows only for weekday habits on pull',
      'sync/merge.ts: docToHabit runs the same validators on pull',
      'firestore.rules: syncValidHabit (daily has no days, weekdays has at least one)',
      'this script, section 3e: the consistency audit counts violations',
    ],
  },
  {
    title: 'icon has no database CHECK',
    probe: "habits.icon = 'rocket' (not in the icon list)",
    statements: () => [habitInsert({icon: 'rocket'})],
    enforcedIn: [
      'validation/validators.ts: validateIcon against ICON_IDS in constants/habits.ts',
      'sync/merge.ts: docToHabit runs validateHabitInput on pull',
      'firestore.rules: only a string of 1 to 32 characters',
    ],
  },
  {
    title: 'reminderTime format has no database CHECK',
    probe: "habits.reminderTime = '25:99'",
    statements: () => [habitInsert({reminderTime: '25:99'})],
    enforcedIn: [
      'validation/validators.ts: validateReminderTime, ^([01]\\d|2[0-3]):[0-5]\\d$',
      'sync/merge.ts: docToHabit runs validateHabitInput on pull',
      'firestore.rules: the same pattern on push',
    ],
  },
  {
    title: 'Name trimming is app-side: the length CHECK counts spaces',
    probe: "habits.habitName = '   ' (three spaces)",
    statements: () => [habitInsert({habitName: '   '})],
    enforcedIn: [
      'validation/validators.ts: validateHabitName trims, then requires 1 to 30 characters',
      'sync/merge.ts: docToHabit runs validateHabitInput on pull',
      'firestore.rules: only a size of 1 to 60, no trim',
    ],
  },
];

function showSummary(db: TestDb, schema: TableInfo[]): void {
  heading(5, 'SUMMARY');
  const n = constraintCounts(schema);
  say(`  Tables: ${schema.length} (${schema.map((t) => t.name).join(', ')})`);
  say(`  Constraints: ${n.primaryKeys} primary keys, ${n.foreignKeys} foreign keys, ${n.checks} CHECK,`
    + ` ${n.notNull} NOT NULL, ${n.explicitUnique} explicit UNIQUE (${n.uniqueIndexes} unique key indexes)`);
  say(`  3NF checks: ${tally.pass} passed, ${tally.argued} argued in the 3NF document, ${tally.fail} failed`);
  say(`  App-level rule frequencyType/habitDays: ${tally.violations} violations`);
  say(`  Integrity attempts: ${tally.rejected} of ${tally.attempted} rejected by the database`);
  say(`  Result: ${tally.problems.length === 0 ? 'ALL GOOD' : `${tally.problems.length} PROBLEM(S)`}`);
  for (const p of tally.problems) say(`    !!! ${p}`);

  sub('Known gaps (each probed now on the demo database, then rolled back)');
  for (const [i, gap] of GAPS.entries()) {
    const error = tryAndRollBack(db, gap.statements(schema));
    const status = error === null
      ? `GAP CONFIRMED: ${gap.probe} was accepted`
      : `NOW REJECTED (${error}): update this list`;
    say(`  ${i + 1}. ${gap.title}`);
    if (gap.fact) say(`     ${gap.fact(schema)}`);
    say(`     ${status}`);
    say('     Enforced instead in:');
    for (const where of gap.enforcedIn) say(`       - ${where}`, '         ');
  }
}

// ---------- Main ----------

say('Opening an in-memory database and running the real migration (db/schema.js)...');
const db = await createTestDatabase();
await seed(db);
const schema = await loadSchema(db);

const want = (s: Section) => only === undefined || only === s;
if (want('schema')) {
  await showSchema(db, schema);
  await pause();
}
if (want('data')) {
  await showData(db, schema);
  await pause();
}
// `summary` alone re-runs the checks it reports on, without printing them
quiet = only === 'summary';
if (want('3nf') || only === 'summary') {
  await showNormalForm(db, schema);
  await pause();
}
if (want('integrity') || only === 'summary') {
  showIntegrity(db);
  await pause();
}
quiet = false;
if (want('summary')) showSummary(db, schema);

process.exitCode = tally.problems.length === 0 ? 0 : 1;
