import { Router } from "express";
import { pool } from "@workspace/db";
import { SetupAdminBody, LoginBody, GetMeResponse, GetDirectoryResponse } from "@workspace/api-zod";
import { createSession, destroySession, hashPassword, verifyPassword, publicUser, limitLogin } from "../lib/auth";
import { disconnectUser } from "../lib/live";
const router = Router();

router.get("/auth/directory", async (_req, res) => {
  const { rows } = await pool.query("SELECT id,name,role,department,color FROM users ORDER BY role,name");
  res.json(GetDirectoryResponse.parse({ needsSetup: !rows.some(r => r.role === "admin"), users: rows }));
});
router.get("/auth/me", (req, res) => { res.json(GetMeResponse.parse({ user: req.user ?? null })); });
router.post("/auth/setup", limitLogin, async (req, res) => {
  const parsed = SetupAdminBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.name.trim()) { res.status(400).json({ error: "Enter your name and a password of at least 8 characters." }); return; }
  const hash = await hashPassword(parsed.data.password);
  const client = await pool.connect();
  let user;
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(624019)");
    const existing = await client.query("SELECT id FROM users WHERE role='admin'");
    if (existing.rowCount) { await client.query("ROLLBACK"); res.status(409).json({ error: "The owner account has already been set up. Please sign in." }); return; }
    const result = await client.query("INSERT INTO users(name,role,password_hash,department,color) VALUES($1,'admin',$2,'Owner','#56866c') RETURNING *", [parsed.data.name.trim(), hash]);
    user = publicUser(result.rows[0]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  await createSession(req, res, user.id);
  res.status(201).json(user);
});
router.post("/auth/login", limitLogin, async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Select your name and enter your PIN or password." }); return; }
  const result = await pool.query("SELECT * FROM users WHERE id=$1", [parsed.data.userId]);
  const user = result.rows[0];
  if (!user || !await verifyPassword(parsed.data.password, user.password_hash)) {
    res.status(401).json({ error: "The PIN or password is incorrect." }); return;
  }
  await createSession(req, res, user.id);
  res.json(publicUser(user));
});
router.post("/auth/logout", async (req, res) => {
  if (req.user) {
    disconnectUser(req.user.id);
    if (req.user.role === "admin") await pool.query("DELETE FROM push_subscriptions WHERE user_id=$1", [req.user.id]);
  }
  await destroySession(req, res);
  res.sendStatus(204);
});
export default router;
