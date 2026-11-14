import { Router } from "express";
import { pool } from "@workspace/db";
import { CreateAssistantBody, CreateAssistantResponse, ListAssistantsResponse, DeleteAssistantParams } from "@workspace/api-zod";
import { requireOwner, hashPassword, publicUser } from "../lib/auth";
import { broadcast, disconnectUser } from "../lib/live";

const router = Router();
router.get("/assistants", requireOwner, async (_req,res) => {
  const { rows } = await pool.query("SELECT id,name,role,department,color FROM users WHERE role='ea' ORDER BY name");
  res.json(ListAssistantsResponse.parse(rows));
});
router.post("/assistants", requireOwner, async (req,res) => {
  const parsed = CreateAssistantBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.name.trim()) {
    res.status(400).json({ error: "Enter the EA's name and a password of at least 8 characters." }); return;
  }
  const { rows } = await pool.query(`INSERT INTO users(name,role,password_hash,department,color)
    VALUES($1,'ea',$2,'Executive Assistant','#7a73a9') RETURNING *`,
    [parsed.data.name.trim(),await hashPassword(parsed.data.password)]);
  broadcast("refresh",{});
  res.status(201).json(CreateAssistantResponse.parse(publicUser(rows[0])));
});
router.delete("/assistants/:id", requireOwner, async (req,res) => {
  const parsed = DeleteAssistantParams.safeParse(req.params);
  if (!parsed.success) { res.status(400).json({ error: "Invalid EA account." }); return; }
  const { rowCount } = await pool.query("DELETE FROM users WHERE id=$1 AND role='ea'",[parsed.data.id]);
  if (!rowCount) { res.status(404).json({ error: "EA account not found." }); return; }
  disconnectUser(parsed.data.id);
  broadcast("refresh",{});
  res.sendStatus(204);
});
export default router;
