import { ReplitConnectors } from "@replit/connectors-sdk";
import { pool } from "@workspace/db";
import { logger } from "./logger";

export const spreadsheetId = "1__EUvj60FZGmPNlQ6GCwxVrNJj-UBVN-seQ_hUFOxQE";
export const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=0`;
export const sheetHeaders = ["Task ID", "Date", "Employee Name", "Task Name", "Time Slot", "Type (Everyday / One-Time)", "Status (Done / Not Done)", "Actual Time Performed"];
const connectors = new ReplitConnectors();
const base = `/v4/spreadsheets/${spreadsheetId}`;
// Preview and published databases can have overlapping numeric IDs. Keep their
// rows separate so editing a test task cannot overwrite a live employee record.
const taskPrefix = process.env.NODE_ENV === "production" ? "MT-" : "MT-DEV-";
const ownedTaskId = new RegExp(`^${taskPrefix}\\d+$`);
type Queryable = { query: (sql: string, values?: any[]) => Promise<any> };

// Called inside the same transaction as a task change: sync work survives restarts.
export async function markSheetDirty(client: Queryable = pool) {
  await client.query(`INSERT INTO sheet_sync(id,revision,synced_revision) VALUES(1,1,0)
    ON CONFLICT(id) DO UPDATE SET revision=sheet_sync.revision+1`);
}
function time(value: string) {
  const [h,m] = value.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
}
export function sheetRow(task: Record<string, any>): string[] {
  return [`${taskPrefix}${task.id}`, task.date, task.employeeName, task.title,
    `${time(task.startTime)} - ${time(task.endTime)}`, task.recurringId ? "Everyday" : "One-Time",
    task.done ? "Done" : "Not Done",
    task.done && task.completedAt ? new Date(task.completedAt).toLocaleTimeString("en-US", {
      timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true,
    }) : ""];
}
function dateKey(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) return `${us[3]}-${us[1].padStart(2,"0")}-${us[2].padStart(2,"0")}`;
  return null;
}
function clock24(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  const match = raw.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toUpperCase();
  if (minute > 59 || hour > 23 || (suffix && (hour < 1 || hour > 12))) return null;
  if (suffix === "AM" && hour === 12) hour = 0;
  if (suffix === "PM" && hour !== 12) hour += 12;
  return `${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}`;
}
function clockLabel(value: string | null): string | null {
  if (!value) return null;
  const [h,m] = value.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2,"0")}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
}
function timestamp(date: string | null, clock: string | null): string | null {
  return date && clock ? `${date}T${clock}:00+05:30` : null;
}
function sheetDateTime(date: string | null, raw: unknown): { date: string | null; clock: string | null; iso: string | null } {
  const value = String(raw ?? "").trim();
  const embeddedDate = dateKey(value);
  const resolvedDate = embeddedDate ?? date;
  const slotRange = value.match(/^(.+?)\s+-\s+.+$/);
  const clock = clock24(slotRange ? slotRange[1] : value);
  return { date: resolvedDate, clock, iso: timestamp(resolvedDate, clock) };
}

export async function getMisReportData() {
  const metadata = await request(`${base}?fields=sheets.properties`);
  const sheet = metadata.sheets?.find((item: any) => item.properties.sheetId === 0);
  if (!sheet) throw new Error("The linked Sheet1 tab (gid=0) is missing.");
  const title = String(sheet.properties.title);
  const range = `'${title.replaceAll("'", "''")}'!A:H`;
  const data = await request(`/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`);
  const rows: string[][] = data.values ?? [];
  if (!rows.length) return { tasks: [], teamMembers: [], sourceUrl: spreadsheetUrl };
  const headers = rows[0].map(value => String(value ?? "").trim().toLowerCase());
  const column = (...names: string[]) => headers.findIndex(header => names.includes(header));
  const taskCol = column("task name");
  const memberCol = column("employee name", "team member");
  const statusCol = column("status", "status (done / not done)");
  const dateCol = column("date");
  const idCol = column("task id");
  const givenCol = column("time given", "time slot");
  const doneCol = column("time done", "actual time performed");
  if (taskCol < 0 || memberCol < 0 || statusCol < 0) {
    throw new Error("The linked sheet needs Task Name, Employee Name or Team Member, and Status columns.");
  }
  const tasks = rows.slice(1).map((row, index) => {
    const date = dateCol >= 0 ? dateKey(row[dateCol]) : null;
    const givenRaw = givenCol >= 0 ? row[givenCol] : "";
    const given = sheetDateTime(date, givenRaw);
    const doneRaw = doneCol >= 0 ? row[doneCol] : "";
    const done = sheetDateTime(given.date, doneRaw);
    const isDone = String(row[statusCol] ?? "").trim().toLowerCase() === "done";
    return {
      taskId: String((idCol >= 0 && row[idCol]) || `sheet-row-${index + 2}`),
      date: given.date ?? date ?? "",
      teamMember: String(row[memberCol] ?? "").trim(),
      taskName: String(row[taskCol] ?? "").trim(),
      status: isDone ? "Done" as const : "Not Done" as const,
      timeGiven: clockLabel(given.clock),
      timeDone: isDone ? clockLabel(done.clock) : null,
      timeGivenAt: given.iso,
      timeDoneAt: isDone ? done.iso : null,
    };
  }).filter((task: any) => task.taskName && task.teamMember);
  const teamMembers = [...new Set(tasks.map((task: any) => task.teamMember))].sort((a,b) => a.localeCompare(b));
  return { tasks, teamMembers, sourceUrl: spreadsheetUrl };
}
async function request(path: string, body?: unknown) {
  const response = await connectors.proxy("google-sheet", path, body === undefined ? { method: "GET", signal: AbortSignal.timeout(20000) } : {
    method: "POST", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    // Never log provider response bodies or credentials.
    throw new Error(`Google Sheets returned ${response.status}. ${response.status === 401 || response.status === 403
      ? "Check the Google connection and spreadsheet edit access." : "Sync will retry automatically."}`);
  }
  return response.json() as Promise<any>;
}
const cells = (values: string[]) => values.map(stringValue => ({ userEnteredValue: { stringValue } }));
let running = false;
let retryAfter = 0;
export async function syncSheet() {
  if (running || Date.now() < retryAfter) return;
  running = true;
  const client = await pool.connect().catch(error => { running = false; throw error; });
  let locked = false;
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(624021) AS locked");
    locked = lock.rows[0].locked;
    if (!locked) return;
    const state = await client.query("SELECT * FROM sheet_sync WHERE id=1");
    if (!state.rows[0] || state.rows[0].revision === state.rows[0].synced_revision) return;
    const revision = state.rows[0].revision;
    const metadata = await request(`${base}?fields=sheets.properties`);
    const sheet = metadata.sheets.find((s: any) => s.properties.sheetId === 0);
    if (!sheet) throw new Error("The linked sheet tab (gid=0) is missing. Restore it to resume sync.");
    const { sheetId, title, gridProperties } = sheet.properties;
    const range = `'${title.replaceAll("'", "''")}'!A:H`;
    const existing = await request(`${base}/values/${encodeURIComponent(range)}`);
    const rows: string[][] = existing.values ?? [];
    if (rows.length && (rows[0].length !== sheetHeaders.length || rows[0].some((value, i) => value !== sheetHeaders[i]))) {
      throw new Error("The sheet headers do not match. Existing sheet data was left unchanged.");
    }
    const tasks = await client.query(`SELECT t.id,t.date::text,u.name AS "employeeName",t.title,
      t.start_time AS "startTime",t.end_time AS "endTime",t.recurring_id AS "recurringId",
      t.done,t.completed_at AS "completedAt" FROM tasks t JOIN users u ON u.id=t.employee_id ORDER BY t.date,t.start_time,t.id`);
    const desired = new Map<string,string[]>(tasks.rows.map(t => {
      const row = sheetRow(t); return [row[0],row];
    }));
    const requests: any[] = [];
    const found = new Set<string>();
    const deletes: number[] = [];
    if (!rows.length) requests.push({ updateCells: { start: { sheetId, rowIndex: 0, columnIndex: 0 },
      rows: [{ values: cells(sheetHeaders) }], fields: "userEnteredValue" } });
    for (let i = 1; i < rows.length; i++) {
      const id = String(rows[i][0] ?? "");
      if (!ownedTaskId.test(id)) continue; // Never alter unrelated or other-environment rows.
      const row = desired.get(id);
      if (!row || found.has(id)) { deletes.push(i); continue; }
      found.add(id);
      if (row.some((v,c) => v !== (rows[i][c] ?? ""))) requests.push({
        updateCells: { start: { sheetId, rowIndex: i, columnIndex: 0 },
          rows: [{ values: cells(row) }], fields: "userEnteredValue" },
      });
    }
    const additions = [...desired].filter(([id]) => !found.has(id)).map(([,row]) => ({ values: cells(row) }));
    // Update existing positions first, then remove old rows bottom-up, then add.
    deletes.sort((a,b) => b-a).forEach(i => requests.push({ deleteDimension: {
      range: { sheetId, dimension: "ROWS", startIndex: i, endIndex: i+1 },
    } }));
    const startRow = Math.max(rows.length,1) - deletes.length;
    const needed = startRow + additions.length;
    const remainingGridRows = gridProperties.rowCount - deletes.length;
    if (needed > remainingGridRows) requests.push({ appendDimension: { sheetId, dimension: "ROWS", length: needed - remainingGridRows } });
    if (additions.length) requests.push({ updateCells: { start: { sheetId, rowIndex: startRow, columnIndex: 0 },
      rows: additions, fields: "userEnteredValue" } });
    if (requests.length) await request(`${base}:batchUpdate`, { requests });
    await client.query("UPDATE sheet_sync SET synced_revision=$1,last_synced_at=now(),error=NULL WHERE id=1", [revision]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Sheets sync failed.";
    await client.query("UPDATE sheet_sync SET error=$1 WHERE id=1", [message.slice(0,400)]);
    retryAfter = Date.now() + 30000;
    logger.warn("Google Sheets sync failed; saved changes will retry in 30 seconds");
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(624021)");
    } finally {
      client.release();
      running = false;
    }
  }
}
export function queueSheetSync() {
  void syncSheet().catch(() => logger.error("Unable to start Google Sheets sync; it will retry"));
}
export function retrySheetSync() { retryAfter = 0; queueSheetSync(); }
