import {getDatabase} from '@/db/database'; // call the cached SQLite connection
import {pushCompletion} from './push'; // the per-row push+conflict resolve fxn 

export async function syncCompletions() { // the main fxn that runs on every sync trigger
    const db = await getDatabase(); // get the local SQLite connection

    const unsyncedRows = await db.getAllAsync(
        `SELECT * FROM completions WHERE synced = 0`
    ); // fetch every local row that hasn't been pushed yet

    for (const row of unsyncedRows) { //loops through each unsynced row sequentially - not all at once in parallel
        const finalCompleted = await pushCompletion(row); //push it, resolving any conflict, get back the final value

        await db.runAsync( // db.runAsync(sql, [params]) -> parametized query pattern, avoids SQL risk that execAsync alone has
            `UPDATE completions SET completed = ?, synced = 1 WHERE completionId = ?`
            [finalCompleted, row.completionId]
        ); // update this row locally: correct final value, and mark it as synced
    }
}