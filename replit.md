# Megatronics — Day Task

A mobile-friendly employee daily task manager with manager assignment, employee checklists, and completion alerts.

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
- Manager setup is atomic and disabled after the first manager exists. Employees are created by that manager.
- Calendar dates and workday/completion times use Asia/Kolkata (IST) consistently, matching the initial intended working locale.
- Completion messages remain in history after employees or tasks are removed. Removing an employee deletes their assigned tasks and sessions.
- Browser push keys are generated server-side and stored persistently; they are not regenerated on process restarts.

## Product

- Manager: employee creation/removal, task creation/editing/deletion, past/future date selection, daily employee progress, unread notification bell, full completion history.
- Employee: private chronological daily checklist with separate Done and Not Done actions.
- Completion alerts: live event stream, toast and chime, browser Web Push with service worker, and persistent unread history.

## User preferences

- Do not add clock-in, clock-out, attendance tracking, or WhatsApp integration.
- Workday task slots must stay within 10:00 AM to 8:30 PM.
- Employees use their own selected name and 4-digit PIN or password and see only their own tasks.
- Company name is Megatronics; use the supplied Megatronics logo and call the admin role Owner, not Manager. Keep internal `admin` role identifiers for compatibility.

## Gotchas

- Web Push needs browser permission, service worker support, and a secure origin. Real device delivery has not been verified.
- Audio begins only after user interaction, as required by browsers.
- SSE clients reconnect automatically; 15-second query polling supplies a freshness fallback. Event broadcasts are process-local.
- The signed-in screens were not visually verified during the initial build; only the public manager setup screen was captured.
- `web-push` 4 uses named ESM exports rather than a default export. Keep the namespace import.
- Logging out of the manager account clears stored browser push subscriptions; other devices can re-enable notifications or reload to resubscribe.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
