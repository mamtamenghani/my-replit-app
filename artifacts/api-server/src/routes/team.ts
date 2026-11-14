import { Router } from "express";
import { pool } from "@workspace/db";
import { CreateEmployeeBody, CreateEmployeeResponse, DeleteEmployeeParams, ListEmployeesResponse, GetDashboardQueryParams, GetDashboardResponse } from "@workspace/api-zod";
import { requireAdmin, hashPassword, publicUser } from "../lib/auth";
import { broadcast, disconnectUser } from "../lib/live";
import { validDate } from "./tasks";
const router = Router();
router.get("/employees", requireAdmin, async (_req, res) => {
  const result = await pool.query("SELECT id,name,role,department,color FROM users WHERE role='employee' ORDER BY name");
  res.json(ListEmployeesResponse.parse(result.rows));
});
router.post("/employees", requireAdmin, async (req, res) => {
  const parsed = CreateEmployeeBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.name.trim()) { res.status(400).json({ error: "Enter a name and a PIN or password with at least 4 characters." }); return; }
  const e = parsed.data;
  if (/^\d+$/.test(e.password) && e.password.length !== 4) { res.status(400).json({ error: "A numeric PIN must be exactly 4 digits. Or use a password." }); return; }
  const colors = ["#56866c", "#c18b54", "#7a73a9", "#6589ad", "#b86f78"];
  const result = await pool.query("INSERT INTO users(name,role,password_hash,department,color) VALUES($1,'employee',$2,$3,$4) RETURNING *",
    [e.name.trim(), await hashPassword(e.password), e.department?.trim() ?? "", colors[Math.floor(Math.random() * colors.length)]]);
  broadcast("refresh", {});
  res.status(201).json(CreateEmployeeResponse.parse(publicUser(result.rows[0])));
});
router.delete("/employees/:id", requireAdmin, async (req, res) => {
  const parsed = DeleteEmployeeParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid employee." }); return; }
  const result = await pool.query("DELETE FROM users WHERE id=$1 AND role='employee' RETURNING id", [parsed.data.id]);
  if (!result.rowCount) { res.status(404).json({ error: "Employee not found." }); return; }
  disconnectUser(parsed.data.id);
  broadcast("refresh", {});
  res.sendStatus(204);
});
router.get("/dashboard", requireAdmin, async (req, res) => {
  const parsed = GetDashboardQueryParams.safeParse(req.query);
  if (!parsed.success || !validDate(parsed.data.date)) { res.status(400).json({ error: "Choose a valid date." }); return; }
  const result = await pool.query(`SELECT u.id,u.name,u.role,u.department,u.color,count(t.id)::int AS total,count(t.id) FILTER(WHERE t.done)::int AS done
    FROM users u LEFT JOIN tasks t ON t.employee_id=u.id AND t.date=$1 WHERE u.role='employee' GROUP BY u.id ORDER BY u.name`, [parsed.data.date]);
  const employees = result.rows.map(r => ({ employee: publicUser(r), total: r.total, done: r.done }));
  const totalTasks = employees.reduce((sum, e) => sum + e.total, 0);
  const doneTasks = employees.reduce((sum, e) => sum + e.done, 0);
  res.json(GetDashboardResponse.parse({ totalTasks, doneTasks, pendingTasks: totalTasks - doneTasks, totalEmployees: employees.length, employees }));
});
export default router;
