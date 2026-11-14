# Megatronics — Day Task

A mobile-friendly Megatronics employee daily task manager with Owner/EA assignment, employee checklists, and completion alerts.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/daytask run dev` — run the web app through its managed workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/daytask/` — responsive web app, service worker, and notification controls
- `artifacts/api-server/src/routes/` — session, task, team, and notification endpoints
- `lib/db/src/schema/` — persistent PostgreSQL schema
- `lib/api-spec/openapi.yaml` — API contract; regenerate clients after editing

## Architecture decisions

- Custom password/PIN authentication was explicitly requested: manager creates the first account, with no seeded credentials or public demo accounts.
- Owner setup is atomic and disabled after the first Owner exists. Owner and EA can create employees; only Owner can create or revoke EA accounts.
- Calendar dates and workday/completion times use Asia/Kolkata (IST) consistently, matching the initial intended working locale.
- Completion messages remain in history after employees or tasks are removed. Removing an employee deletes their assigned tasks and sessions.
- Browser push keys are generated server-side and stored persistently; they are not regenerated on process restarts.

## Product

- Owner and EA: employee creation/removal, task creation/editing/deletion, past/future date selection, daily employee progress, unread notification bell, full completion history.
- Owner keeps internal role `admin`; Executive Assistant uses `ea`. Both have task-management and completion-alert access, but EA cannot grant administrative access.
- Employee: private chronological daily checklist with separate Done and Not Done actions.
- Completion alerts: live event stream, toast and chime, browser Web Push with service worker, and persistent unread history.
- Everyday checklists repeat on every calendar day, including weekends, from their selected start date. Daily entries have independent completion states and server timestamps.
- Deleting an Everyday checklist stops its recurrence on the selected date and deletes that date and later entries; earlier history is retained. The confirmation explicitly describes this scope.
- Actual Time Performed is the server-recorded completion time displayed in IST; Not Done clears it.
- Google Sheets uses the connected `google-sheet` integration, not a service-account secret. The linked spreadsheet's gid=0 tab is the sync target; it must retain the app's eight-column header.
- Sheets sync uses a persistent revision updated in each task transaction, immediate background delivery, and retries after failures. Only app-owned `MT-` task rows are changed or deleted; unrelated rows are left intact.
- Preview task IDs use `MT-DEV-` while published task IDs use `MT-`, and sync only manages its own environment's IDs. Keep this separation: the two databases may contain overlapping numeric IDs but share a connected spreadsheet.
- Daily entries catch up after downtime on startup or checklist reads, and while the server is running a timer creates new-day entries. Sync status and manual retry are visible on the dashboard.

## User preferences

- Keep One-Time Task and Everyday Checklist (Repeat Daily) in separate tabs inside the Assign a task form, not together as radio choices.
- Do not add clock-in, clock-out, attendance tracking, or WhatsApp integration.
- Workday task slots must stay within 10:00 AM to 8:30 PM.
- Employees use their own selected name and 4-digit PIN or password and see only their own tasks.
- Company name is Megatronics; use the supplied Megatronics logo and call the admin role Owner, not Manager. Keep internal `admin` role identifiers for compatibility.
- Installed home-screen apps must display the supplied Megatronics logo, including Android app icons and the iPhone touch icon.

## Gotchas

- Web Push needs browser permission, service worker support, and a secure origin. Real device delivery has not been verified.
- Audio begins only after user interaction, as required by browsers.
- SSE clients reconnect automatically; 15-second query polling supplies a freshness fallback. Event broadcasts are process-local.
- `web-push` 4 uses named ESM exports rather than a default export. Keep the namespace import.
- Logging out of the manager account clears stored browser push subscriptions; other devices can re-enable notifications or reload to resubscribe.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
