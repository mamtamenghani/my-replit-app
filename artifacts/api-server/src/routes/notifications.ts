import { Router } from "express";
import { pool } from "@workspace/db";
import { ListNotificationsResponse, SubscribePushBody } from "@workspace/api-zod";
import { requireAdmin, requireUser } from "../lib/auth";
import { liveClients, pushKey } from "../lib/live";
const router = Router();
router.get("/notifications", requireAdmin, async (_req, res) => {
  const result = await pool.query(`SELECT id,message,employee_name AS "employeeName",task_title AS "taskTitle",created_at AS "createdAt",read FROM notifications ORDER BY id DESC`);
  res.json(ListNotificationsResponse.parse(result.rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() }))));
});
router.post("/notifications/read", requireAdmin, async (_req, res) => {
  await pool.query("UPDATE notifications SET read=true WHERE read=false");
  res.sendStatus(204);
});
router.get("/push/config", requireAdmin, async (_req, res) => { res.json({ publicKey: await pushKey() }); });
router.post("/push/subscribe", requireAdmin, async (req, res) => {
  const parsed = SubscribePushBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid push subscription." }); return; }
  const url = new URL(parsed.data.endpoint);
  const hosts = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "wns.windows.com", "notify.windows.com"];
  if (url.protocol !== "https:" || url.port || !hosts.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`))) {
    res.status(400).json({ error: "This browser's push provider is not supported." }); return;
  }
  await pool.query("INSERT INTO push_subscriptions(endpoint,user_id,subscription) VALUES($1,$2,$3) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,subscription=excluded.subscription",
    [parsed.data.endpoint, req.user!.id, JSON.stringify(parsed.data)]);
  res.sendStatus(204);
});
router.get("/events", requireUser, (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "Connection": "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders();
  res.write("retry: 3000\nevent: refresh\ndata: {}\n\n");
  liveClients.set(res, req.user!);
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20000);
  // Reconnection rechecks the session periodically, including expiry.
  const expiry = setTimeout(() => res.end(), 300000);
  req.on("close", () => { clearInterval(heartbeat); clearTimeout(expiry); liveClients.delete(res); });
});
export default router;
