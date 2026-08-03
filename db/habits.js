import {getDatabase} from '@/db/database.js';

export async function addHabit(habitName, habitNotes){
    const db = await getDatabase();
    const result = await db.runAsync(
  `INSERT INTO habits (habitName, habitNotes) VALUES (?, ?)`,
  [habitName, habitNotes]);

  /* WRONG
  /*'INSERT INTO completions (completed, synced, date) VALUES (?, ?, new Date().toISOString().split('T')[0])'*/
  
  /* right*/
  await db.runAsync(
    'INSERT INTO completions (habitId, date, completed, synced) VALUES (?, ?, ?, ?)',
    [result.lastInsertRowId, new Date().toISOString().split('T')[0], 0, 0]
  )

  return result.lastInsertRowId;
} 