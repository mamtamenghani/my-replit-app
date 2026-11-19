import { Router } from "express";
import { pool } from "@workspace/db";
import { GetMisReportResponse, GetSheetStatusResponse } from "@workspace/api-zod";
import { requireAdmin } from "../lib/auth";
import { getMisReportData, markSheetDirty, spreadsheetUrl, retrySheetSync } from "../lib/sheets";
const router = Router();
router.get("/sheets/mis", requireAdmin, async (_req,res) => {
  res.json(GetMisReportResponse.parse(await getMisReportData()));
});
router.get("/sheets/status", requireAdmin, async (_req,res) => {
  const { rows } = await pool.query("SELECT * FROM sheet_sync WHERE id=1");
  const state = rows[0];
  res.json(GetSheetStatusResponse.parse({
    pending: !state || state.revision !== state.synced_revision,
    lastSyncedAt: state?.last_synced_at?.toISOString() ?? null,
    error: state?.error ?? null, url: spreadsheetUrl,
  }));
});
router.post("/sheets/retry", requireAdmin, async (_req,res) => {
  await markSheetDirty();
  retrySheetSync();
  res.sendStatus(202);
});
export default router;
