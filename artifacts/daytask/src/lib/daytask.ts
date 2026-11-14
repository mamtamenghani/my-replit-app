import type { QueryClient } from '@tanstack/react-query';
import {
  getListEmployeesQueryKey,
  getListNotificationsQueryKey,
  getGetDirectoryQueryKey,
  getGetSheetStatusQueryKey,
  getListAssistantsQueryKey,
} from '@workspace/api-client-react';

export const TASKS_KEY = '/api/tasks';
export const DASHBOARD_KEY = '/api/dashboard';

export function dateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const TZ = 'Asia/Kolkata';
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export function shiftDate(s: string, days: number) {
  const [y, m, d] = s.split('-').map(Number);
  return dateStr(new Date(y, m - 1, d + days));
}
export function parseDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')}${ap}`;
}
export const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let mins = 10 * 60; mins <= 20 * 60 + 30; mins += 15) {
    out.push(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
  }
  return out;
})();
export function nowHM() {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}
export function istStamp(iso: string) {
  return new Intl.DateTimeFormat('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' IST';
}
export function istDay(iso: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
}
export function errMsg(e: unknown, fallback = 'Something went wrong') {
  if (e && typeof e === 'object') {
    const data = (e as { data?: unknown }).data;
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>;
      for (const k of ['error', 'message', 'detail']) if (typeof d[k] === 'string') return d[k] as string;
    }
    const status = (e as { status?: number }).status;
    if (status === 401) return 'Incorrect password or PIN';
    if (e instanceof Error && e.message) return e.message.replace(/^HTTP \d+ [^:]*:?\s*/, '') || fallback;
  }
  return fallback;
}
export function invalidateWork(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: [TASKS_KEY] });
  qc.invalidateQueries({ queryKey: [DASHBOARD_KEY] });
  qc.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
  qc.invalidateQueries({ queryKey: getGetSheetStatusQueryKey() });
  qc.invalidateQueries({ queryKey: getListAssistantsQueryKey() });
}
export function invalidateEverything(qc: QueryClient) {
  invalidateWork(qc);
  qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  qc.invalidateQueries({ queryKey: getGetDirectoryQueryKey() });
}
export function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export const POLL = 15_000;
