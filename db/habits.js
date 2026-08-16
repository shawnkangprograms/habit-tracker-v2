import {getDatabase} from '@/db/database.js';

import {ensureTodayRows} from '@/sync/syncEngine.js';

export async function addHabit(habitName, habitNotes){
    const db = await getDatabase();

    /*
    //temporary console log to catch the SQL error
    console.log('Running INSERT habits with:', habitName, habitNotes);
    */

    const result = await db.runAsync(
  `INSERT INTO habits (habitName, habitNotes) VALUES (?, ?)`,
  [habitName, habitNotes]);

  /*
  //temporary console log to catch the SQL error
  console.log('Running INSERT completions with:', result.lastInsertRowId, new Date().toISOString().split('T')[0]);
  */

  /* WRONG*/
  /*'INSERT INTO completions (completed, synced, date) VALUES (?, ?, new Date().toISOString().split('T')[0])'*/

   /* right*/
  await db.runAsync(
    'INSERT INTO completions (habitId, date, completed, synced) VALUES (?, ?, ?, ?)',
    [result.lastInsertRowId, new Date().toISOString().split('T')[0], 0, 0]
  )

  return result.lastInsertRowId;
} 

export async function getHabits(){
    const db = await getDatabase();

    /*
    //temporary console log to catch the SQL error
    console.log('Running SELECT habits');
    */

     const allHabits = await db.getAllAsync(
        `SELECT * FROM habits`
    ); 

    return allHabits;
}

export async function deleteHabits(habitId){
    
    /* WRONG

    const db = await getDatabase();
     const deleteCompletions = await db.runAsync(
        `DELETE * FROM completions WHERE habitId = ?`
    ); 

     const deleteHabits = await db.runAsync(
        `DELETE * FROM habits WHERE habitId = ?`
    ); 

    return deleteCompletions;
    return deleteHabits;
    */

    /* CORRECT */
    const db = await getDatabase();
    await db.runAsync(
        'DELETE FROM completions WHERE habitId = ?',
        [habitId]
    );

    await db.runAsync(
        'DELETE FROM habits WHERE habitId = ?',
        [habitId]
    );
}

export async function toggleCompletion(completionId, newValue) {
    const db = await getDatabase();
    await db.runAsync(
        'UPDATE completions SET completed = ?, synced = 0 WHERE completionId = ?',
        [newValue, completionId]
    );
}

export async function getHabitsWithTodayStatus() { //the function shell
    await ensureTodayRows();
    const db = await getDatabase(); //get the connection

    const today = new Date().toISOString().split('T')[0];

    const result = await db.getAllAsync( 
        //run the query using getAllAsync with JOIN, passing today as the parameter

        `SELECT habits.habitId, habits.habitName, habits.habitNotes, completions.completionId, completions.completed
        FROM habits
        JOIN completions ON habits.habitId = completions.habitId
        WHERE completions.date = ?`,
        [today]
    )

    return result;
}