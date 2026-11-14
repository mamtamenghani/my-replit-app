import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

const scrypt = promisify(scryptCallback);
export type SessionUser = { id: number; name: string; role: "admin" | "ea" | "employee"; department: string; color: string };
declare global {
  namespace Express {
    interface Request { user?: SessionUser }
  }
}
export const publicUser = (row: Record<string, any>): SessionUser => ({
  id: row.id, name: row.name, role: row.role, department: row.department, color: row.color,
});
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, value] = stored.split(":");
  if (!salt || !value) return false;
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(value, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function sessionToken(req: Request) {
  const raw = req.headers.cookie?.split(";").map(c => c.trim()).find(c => c.startsWith("daytask_session="))?.slice(16);
  return raw && /^[a-f0-9]{64}$/.test(raw) ? raw : undefined;
}
const cookieOptions = (req: Request) => ({
  httpOnly: true, sameSite: "lax" as const, secure: req.secure || req.get("x-forwarded-proto") === "https", path: "/",
});
export async function createSession(req: Request, res: Response, userId: number) {
  const old = sessionToken(req);
  if (old) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [digest(old)]);
  const token = randomBytes(32).toString("hex");
  await pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')", [digest(token), userId]);
  res.cookie("daytask_session", token, { ...cookieOptions(req), maxAge: 7 * 86400000 });
}
export async function destroySession(req: Request, res: Response) {
  const token = sessionToken(req);
  if (token) await pool.query("DELETE FROM sessions WHERE token_hash=$1", [digest(token)]);
  res.clearCookie("daytask_session", cookieOptions(req));
}
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = sessionToken(req);
    if (token) {
      const result = await pool.query("SELECT u.* FROM sessions s JOIN users u ON s.user_id=u.id WHERE token_hash=$1 AND expires_at>now()", [digest(token)]);
      if (result.rows[0]) req.user = publicUser(result.rows[0]);
    }
    next();
  } catch (error) { next(error); }
}
export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: "Please sign in." }); return; }
  next();
}
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: "Please sign in." }); return; }
  if (req.user.role !== "admin" && req.user.role !== "ea") { res.status(403).json({ error: "Owner or EA access required." }); return; }
  next();
}
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: "Please sign in." }); return; }
  if (req.user.role !== "admin") { res.status(403).json({ error: "Only the Owner can manage EA accounts." }); return; }
  next();
}
const attempts = new Map<string, { count: number; reset: number }>();
export function limitLogin(req: Request, res: Response, next: NextFunction) {
  const key = `${req.ip}:${String(req.body?.userId ?? "setup")}`;
  const now = Date.now();
  if (attempts.size > 10000) for (const [k,v] of attempts) if (v.reset < now) attempts.delete(k);
  const entry = attempts.get(key);
  if (entry && entry.reset > now && entry.count >= 10) {
    res.status(429).json({ error: "Too many attempts. Please try again in 15 minutes." }); return;
  }
  attempts.set(key, entry && entry.reset > now ? { ...entry, count: entry.count + 1 } : { count: 1, reset: now + 900000 });
  next();
}
export function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()); }
