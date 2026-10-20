/// <reference types="node" />
// Test-only: an in-memory node:sqlite database behind the same async interface the app uses from
// expo-sqlite (getAllAsync, getFirstAsync, runAsync, execAsync, withTransactionAsync), set up with the
// app's REAL migration (db/schema.js), so the test schema can't drift from the app's.
import {DatabaseSync, type SQLInputValue} from 'node:sqlite';

export type TestDb = {
  raw: DatabaseSync;
  execAsync(sql: string): Promise<void>;
  getAllAsync<T = Record<string, unknown>>(sql: string, params?: SQLInputValue[]): Promise<T[]>;
  getFirstAsync<T = Record<string, unknown>>(sql: string, params?: SQLInputValue[]): Promise<T | null>;
  runAsync(sql: string, params?: SQLInputValue[]): Promise<{changes: number; lastInsertRowId: number}>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

export async function createTestDatabase(): Promise<TestDb> {
  const raw = new DatabaseSync(':memory:');
  const db: TestDb = {
    raw,
    async execAsync(sql) {
      raw.exec(sql);
    },
    // node:sqlite rows have a null prototype; expo-sqlite returns plain objects, so copy them
    async getAllAsync<T>(sql: string, params: SQLInputValue[] = []) {
      return raw.prepare(sql).all(...params).map((row) => ({...row})) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SQLInputValue[] = []) {
      const row = raw.prepare(sql).get(...params);
      return row === undefined ? null : ({...row} as T); // expo-sqlite returns null for no row
    },
    async runAsync(sql, params = []) {
      const r = raw.prepare(sql).run(...params);
      return {changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid)};
    },
    async withTransactionAsync(task) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };

  // same order as db/database.js: foreign keys on (outside a transaction), then the migration
  raw.exec('PRAGMA foreign_keys = ON');
  const {migrateDbIfNeeded} = await import('../../db/schema.js');
  await migrateDbIfNeeded(db);
  return db;
}
