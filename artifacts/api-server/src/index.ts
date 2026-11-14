import app from "./app";
import { logger } from "./lib/logger";
import { ensureDailyTasks } from "./lib/recurring";
import { markSheetDirty, queueSheetSync } from "./lib/sheets";
import { broadcast } from "./lib/live";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  void (async () => {
    await ensureDailyTasks();
    await markSheetDirty();
    queueSheetSync();
  })().catch(err => logger.error({ err }, "Daily task initialization failed"));
});

// The durable sync revision catches up after downtime. Daily occurrences are also
// generated on reads, so sleeping instances never omit a new day's checklist.
setInterval(() => {
  void ensureDailyTasks().then(count => {
    if (count) broadcast("refresh", {});
    queueSheetSync();
  }).catch(err => logger.error({ err }, "Daily checklist refresh failed"));
}, 60000).unref();
setInterval(queueSheetSync, 5000).unref();
