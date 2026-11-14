import { Router } from "express";
import { pool } from "@workspace/db";
import {
  CreateTaskBody, UpdateTaskBody, SetTaskStatusBody, ListTasksQueryParams,
  ListTasksResponse, CreateTaskResponse, UpdateTaskResponse, SetTaskStatusResponse,
  UpdateTaskParams, DeleteTaskParams, SetTaskStatusParams,
} from "@workspace/api-zod";
import { requireUser, requireAdmin } from "../lib/auth";
import { broadcast, pushCompletion } from "../lib/live";
import { logger } from "../lib/logger";
import { ensureDailyTasks } from "../lib/recurring";
import { markSheetDirty, queueSheetSync } from "../lib/sheets";

const router = Router();
export const taskSelect = `SELECT t.id,t.employee_id AS "employeeId",u.name AS "employeeName",t.title,t.description,t.date::text,t.start_time AS "startTime",t.end_time AS "endTime",t.done,t.completed_at AS "completedAt",t.recurring_id AS "recurringId" FROM tasks t JOIN users u ON t.employee_id=u.id`;
export function serializeTask(row: Record<string, any>) {
  return { ...row, completedAt: row.completedAt ? new Date(row.completedAt).toISOString() : null };
}
export function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validSlot(start: string, end: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(end) &&
    start >= "10:00" && end <= "20:30" && start < end;
}
router.get("/tasks", requireUser, async (req, res) => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success || !validDate(parsed.data.date)) { res.status(400).json({ error: "Choose a valid date." }); return; }
  await ensureDailyTasks(parsed.data.date);
  queueSheetSync();
  const id = req.user!.role === "employee" ? req.user!.id : parsed.data.employeeId;
  const result = await pool.query(`${taskSelect} WHERE t.date=$1 ${id !== undefined ? "AND t.employee_id=$2" : ""} ORDER BY t.start_time,t.end_time,t.id`, id !== undefined ? [parsed.data.date, id] : [parsed.data.date]);
  res.json(ListTasksResponse.parse(result.rows.map(serializeTask)));
});
router.post("/tasks", requireAdmin, async (req, res) => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Enter the task name, employee, date and time slot." }); return; }
  const t = parsed.data;
  if (!t.title.trim() || !validDate(t.date) || !validSlot(t.startTime, t.endTime)) {
    res.status(400).json({ error: "Choose a valid date and a time slot between 10:00 AM and 8:30 PM, ending after it starts." }); return;
  }
  const user = await pool.query("SELECT id FROM users WHERE id=$1 AND role='employee'", [t.employeeId]);
  if (!user.rowCount) { res.status(404).json({ error: "Employee not found." }); return; }
  const client = await pool.connect();
  let id: number;
  try {
    await client.query("BEGIN");
    let recurringId = null;
    if (t.everyday) {
      const recurring = await client.query(`INSERT INTO recurring_tasks(employee_id,title,description,start_date,start_time,end_time)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [t.employeeId,t.title.trim(),t.description ?? "",t.date,t.startTime,t.endTime]);
      recurringId = recurring.rows[0].id;
    }
    const result = await client.query("INSERT INTO tasks(employee_id,title,description,date,start_time,end_time,recurring_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [t.employeeId, t.title.trim(), t.description ?? "", t.date, t.startTime, t.endTime,recurringId]);
    id = result.rows[0].id;
    await markSheetDirty(client);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  await ensureDailyTasks(t.date);
  const task = await pool.query(`${taskSelect} WHERE t.id=$1`, [id]);
  broadcast("refresh", {});
  queueSheetSync();
  res.status(201).json(CreateTaskResponse.parse(serializeTask(task.rows[0])));
});
router.put("/tasks/:id", requireAdmin, async (req, res) => {
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!params.success || !parsed.success) { res.status(400).json({ error: "Invalid task details." }); return; }
  const t = parsed.data;
  if (!t.title.trim() || !validDate(t.date) || !validSlot(t.startTime, t.endTime)) { res.status(400).json({ error: "Choose a valid date and a time slot within 10:00 AM–8:30 PM." }); return; }
  const user = await pool.query("SELECT id FROM users WHERE id=$1 AND role='employee'", [t.employeeId]);
  if (!user.rowCount) { res.status(404).json({ error: "Employee not found." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(624022)");
    const existing = await client.query("SELECT *,date::text AS date FROM tasks WHERE id=$1 FOR UPDATE",[params.data.id]);
    const old = existing.rows[0];
    if (!old) { await client.query("ROLLBACK"); res.status(404).json({ error: "Task not found." }); return; }
    if (old.recurring_id) {
      const oldDate = old.date;
      if (!t.everyday || t.date !== oldDate) {
        await client.query("ROLLBACK"); res.status(400).json({ error: "For an Everyday checklist, keep its type and date. Changes apply to this date and later uncompleted entries." }); return;
      }
      await client.query(`UPDATE recurring_tasks SET employee_id=$1,title=$2,description=$3,start_time=$4,end_time=$5 WHERE id=$6`,
        [t.employeeId,t.title.trim(),t.description ?? "",t.startTime,t.endTime,old.recurring_id]);
      await client.query(`UPDATE tasks SET employee_id=$1,title=$2,description=$3,start_time=$4,end_time=$5,
        done=CASE WHEN employee_id<>$1 THEN false ELSE done END,
        completed_at=CASE WHEN employee_id<>$1 THEN NULL ELSE completed_at END
        WHERE recurring_id=$6 AND date>=$7 AND (NOT done OR id=$8)`,
        [t.employeeId,t.title.trim(),t.description ?? "",t.startTime,t.endTime,old.recurring_id,t.date,params.data.id]);
    } else {
      if (t.everyday) { await client.query("ROLLBACK"); res.status(400).json({ error: "Add a new Everyday checklist instead of changing a one-time task's type." }); return; }
      await client.query(`UPDATE tasks SET employee_id=$1,title=$2,description=$3,date=$4,start_time=$5,end_time=$6,
        done=CASE WHEN employee_id<>$1 THEN false ELSE done END,
        completed_at=CASE WHEN employee_id<>$1 THEN NULL ELSE completed_at END WHERE id=$7`,
        [t.employeeId,t.title.trim(),t.description ?? "",t.date,t.startTime,t.endTime,params.data.id]);
    }
    await markSheetDirty(client);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  const task = await pool.query(`${taskSelect} WHERE t.id=$1`, [params.data.id]);
  broadcast("refresh", {});
  queueSheetSync();
  res.json(UpdateTaskResponse.parse(serializeTask(task.rows[0])));
});
router.delete("/tasks/:id", requireAdmin, async (req, res) => {
  const parsed = DeleteTaskParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid task." }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(624022)");
    const result = await client.query("SELECT id,recurring_id,date::text FROM tasks WHERE id=$1 FOR UPDATE",[parsed.data.id]);
    const task = result.rows[0];
    if (!task) { await client.query("ROLLBACK"); res.status(404).json({ error: "Task not found." }); return; }
    if (task.recurring_id) {
      await client.query("UPDATE recurring_tasks SET end_date=LEAST(COALESCE(end_date,$1::date-1),$1::date-1) WHERE id=$2",[task.date,task.recurring_id]);
      await client.query("DELETE FROM tasks WHERE recurring_id=$1 AND date>=$2",[task.recurring_id,task.date]);
    } else await client.query("DELETE FROM tasks WHERE id=$1",[task.id]);
    await markSheetDirty(client);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  broadcast("refresh", {});
  queueSheetSync();
  res.sendStatus(204);
});
router.patch("/tasks/:id/status", requireUser, async (req, res) => {
  const params = SetTaskStatusParams.safeParse(req.params);
  const body = SetTaskStatusBody.safeParse(req.body);
  if (!params.success || !body.success) { res.status(400).json({ error: "Invalid task status." }); return; }
  const client = await pool.connect();
  let notification;
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT t.*,u.name FROM tasks t JOIN users u ON u.id=t.employee_id WHERE t.id=$1 FOR UPDATE OF t", [params.data.id]);
    const task = result.rows[0];
    if (!task || (req.user!.role === "employee" && task.employee_id !== req.user!.id)) {
      await client.query("ROLLBACK"); res.status(404).json({ error: "Task not found." }); return;
    }
    if (task.done !== body.data.done) {
      await client.query("UPDATE tasks SET done=$1,completed_at=CASE WHEN $1 THEN now() ELSE NULL END WHERE id=$2", [body.data.done, task.id]);
      if (body.data.done) {
        const now = new Date();
        const time = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
        const message = `${task.name} has completed: ${task.title} at ${time}`;
        const inserted = await client.query(`INSERT INTO notifications(message,employee_name,task_title,created_at) VALUES($1,$2,$3,$4) RETURNING id,message,employee_name AS "employeeName",task_title AS "taskTitle",created_at AS "createdAt",read`, [message, task.name, task.title, now]);
        notification = { ...inserted.rows[0], createdAt: now.toISOString() };
      }
      await markSheetDirty(client);
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  const result = await pool.query(`${taskSelect} WHERE t.id=$1`, [params.data.id]);
  broadcast("refresh", {});
  queueSheetSync();
  if (notification) {
    broadcast("completion", notification, true);
    void pushCompletion(notification).catch(error => logger.error({ err: error }, "Push notification failed"));
  }
  res.json(SetTaskStatusResponse.parse(serializeTask(result.rows[0])));
});
export default router;
