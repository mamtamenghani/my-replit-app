import type { Response } from "express";
import * as webpush from "web-push";
import { pool } from "@workspace/db";
import { logger } from "./logger";

export const liveClients = new Map<Response, { id: number; role: string }>();
export function broadcast(type: string, data: unknown, adminOnly = false) {
  for (const [res, user] of liveClients) {
    if (!adminOnly || user.role === "admin") res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}
export function disconnectUser(id: number) {
  for (const [res, user] of liveClients) if (user.id === id) { res.end(); liveClients.delete(res); }
}
let configured: Promise<string> | undefined;
export function pushKey(): Promise<string> {
  if (!configured) configured = (async () => {
    const keys = webpush.generateVAPIDKeys();
    await pool.query("INSERT INTO settings(key,value) VALUES('vapid',$1) ON CONFLICT(key) DO NOTHING", [JSON.stringify(keys)]);
    const { rows } = await pool.query("SELECT value FROM settings WHERE key='vapid'");
    const saved = rows[0].value;
    webpush.setVapidDetails("https://example.com/daytask", saved.publicKey, saved.privateKey);
    return saved.publicKey;
  })().catch(error => { configured = undefined; throw error; });
  return configured;
}
export async function pushCompletion(notification: unknown) {
  await pushKey();
  const { rows } = await pool.query("SELECT endpoint,subscription FROM push_subscriptions p JOIN users u ON u.id=p.user_id WHERE u.role='admin'");
  await Promise.all(rows.map(async row => {
    try { await webpush.sendNotification(row.subscription, JSON.stringify(notification), { TTL: 3600 }); }
    catch (error: any) {
      if (error.statusCode === 410 || error.statusCode === 404) await pool.query("DELETE FROM push_subscriptions WHERE endpoint=$1", [row.endpoint]);
      else logger.warn({ statusCode: error.statusCode }, "Browser push delivery failed");
    }
  }));
}
