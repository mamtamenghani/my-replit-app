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

const router = Router();
export const taskSelect = `SELECT t.id,t.employee_id AS "employeeId",u.name AS "employeeName",t.title,t.description,t.date::text,t.start_time AS "startTime",t.end_time AS "endTime",t.done,t.completed_at AS "completedAt" FROM tasks t JOIN users u ON t.employee_id=u.id`;
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
  const result = await pool.query("INSERT INTO tasks(employee_id,title,description,date,start_time,end_time) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
    [t.employeeId, t.title.trim(), t.description ?? "", t.date, t.startTime, t.endTime]);
  const task = await pool.query(`${taskSelect} WHERE t.id=$1`, [result.rows[0].id]);
  broadcast("refresh", {});
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
  const result = await pool.query("UPDATE tasks SET employee_id=$1,title=$2,description=$3,date=$4,start_time=$5,end_time=$6 WHERE id=$7 RETURNING id",
    [t.employeeId, t.title.trim(), t.description ?? "", t.date, t.startTime, t.endTime, params.data.id]);
  if (!result.rowCount) { res.status(404).json({ error: "Task not found." }); return; }
  const task = await pool.query(`${taskSelect} WHERE t.id=$1`, [params.data.id]);
  broadcast("refresh", {});
  res.json(UpdateTaskResponse.parse(serializeTask(task.rows[0])));
});
router.delete("/tasks/:id", requireAdmin, async (req, res) => {
  const parsed = DeleteTaskParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid task." }); return; }
  const result = await pool.query("DELETE FROM tasks WHERE id=$1 RETURNING id", [parsed.data.id]);
  if (!result.rowCount) { res.status(404).json({ error: "Task not found." }); return; }
  broadcast("refresh", {});
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
    if (!task || (req.user!.role !== "admin" && task.employee_id !== req.user!.id)) {
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
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  const result = await pool.query(`${taskSelect} WHERE t.id=$1`, [params.data.id]);
  broadcast("refresh", {});
  if (notification) {
    broadcast("completion", notification, true);
    void pushCompletion(notification).catch(error => logger.error({ err: error }, "Push notification failed"));
  }
  res.json(SetTaskStatusResponse.parse(serializeTask(result.rows[0])));
});
export default router;
