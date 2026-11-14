import { pgTable, serial, text, integer, boolean, date, timestamp, jsonb } from "drizzle-orm/pg-core";
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
});
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
