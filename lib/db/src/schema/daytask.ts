import { pgTable, serial, text, integer, boolean, date, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  department: text("department").notNull().default(""),
  color: text("color").notNull().default("#56866c"),
});
export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true });
export type User = typeof usersTable.$inferSelect;

export const recurringTasksTable = pgTable("recurring_tasks", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
});
export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  date: date("date", { mode: "string" }).notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  done: boolean("done").notNull().default(false),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  recurringId: integer("recurring_id").references(() => recurringTasksTable.id),
}, table => [uniqueIndex("tasks_recurring_day_unique").on(table.recurringId, table.date)]);
export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true });
export type Task = typeof tasksTable.$inferSelect;

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  employeeName: text("employee_name").notNull(),
  taskTitle: text("task_title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  read: boolean("read").notNull().default(false),
});
export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true });

export const sessionsTable = pgTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const settingsTable = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  subscription: jsonb("subscription").notNull(),
});
export const sheetSyncTable = pgTable("sheet_sync", {
  id: integer("id").primaryKey(),
  revision: integer("revision").notNull().default(1),
  syncedRevision: integer("synced_revision").notNull().default(0),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  error: text("error"),
});
