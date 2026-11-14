import { pool } from "@workspace/db";
import { today } from "./auth";
import { markSheetDirty } from "./sheets";

// Concrete daily occurrences keep completion and performed times independent.
// Catch up missed days on startup; requested future dates are generated on demand.
export async function ensureDailyTasks(date = today()) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(624022)");
    const inserted = await client.query(`
      INSERT INTO tasks(employee_id,title,description,date,start_time,end_time,recurring_id)
      SELECT r.employee_id,r.title,r.description,d.day::date,r.start_time,r.end_time,r.id
      FROM recurring_tasks r
      CROSS JOIN LATERAL generate_series(r.start_date::timestamp,
        LEAST(COALESCE(r.end_date,$1::date),$1::date)::timestamp,interval '1 day') d(day)
      ON CONFLICT(recurring_id,date) DO NOTHING`, [today()]);
    let extra = 0;
    if (date > today()) {
      const future = await client.query(`
        INSERT INTO tasks(employee_id,title,description,date,start_time,end_time,recurring_id)
        SELECT employee_id,title,description,$1::date,start_time,end_time,id
        FROM recurring_tasks WHERE start_date<=$1::date AND (end_date IS NULL OR end_date>=$1::date)
        ON CONFLICT(recurring_id,date) DO NOTHING`, [date]);
      extra = future.rowCount ?? 0;
    }
    if (inserted.rowCount || extra) await markSheetDirty(client);
    await client.query("COMMIT");
    return (inserted.rowCount ?? 0) + extra;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
