import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetDashboard, useListTasks, useListEmployees, useDeleteTask,
  getGetDashboardQueryKey, getListTasksQueryKey, getListEmployeesQueryKey, type Task,
} from '@workspace/api-client-react';
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Pencil, Plus, Search, Trash2, Check, UserPlus } from 'lucide-react';
import { Link } from 'wouter';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, Ring, EmptyState, ErrorState } from '@/components/brand';
import { TaskDialog } from '@/components/task-dialog';
import { POLL, todayStr, shiftDate, parseDate, fmtTime, errMsg, invalidateWork, istStamp } from '@/lib/daytask';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { SheetSyncStatus } from '@/components/sheet-sync-status';

type Filter = 'all' | 'done' | 'pending';

export default function Dashboard() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(todayStr());
  const [emp, setEmp] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<{ open: boolean; task: Task | null }>({ open: false, task: null });
  const [toDelete, setToDelete] = useState<Task | null>(null);

  const dash = useGetDashboard({ date }, { query: { refetchInterval: POLL, queryKey: getGetDashboardQueryKey({ date }) } });
  const tasks = useListTasks({ date }, { query: { refetchInterval: POLL, queryKey: getListTasksQueryKey({ date }) } });
  const emps = useListEmployees({ query: { refetchInterval: POLL, queryKey: getListEmployeesQueryKey() } });
  const del = useDeleteTask({
    mutation: {
      onSuccess: () => { invalidateWork(qc); toast({ title: 'Task deleted' }); setToDelete(null); },
      onError: (e) => toast({ title: 'Could not delete', description: errMsg(e), variant: 'destructive' }),
    },
  });

  const employees = useMemo(() => (emps.data ?? []).filter((u) => u.role === 'employee'), [emps.data]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (tasks.data ?? [])
      .filter((t) => (emp == null || t.employeeId === emp)
        && (filter === 'all' || (filter === 'done' ? t.done : !t.done))
        && (!s || t.title.toLowerCase().includes(s) || t.employeeName.toLowerCase().includes(s) || (t.description ?? '').toLowerCase().includes(s)))
      .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.employeeName.localeCompare(b.employeeName));
  }, [tasks.data, emp, filter, q]);
  const colorOf = (id: number) => employees.find((u) => u.id === id)?.color;

  const d = dash.data;
  const pct = d && d.totalTasks ? Math.round((d.doneTasks / d.totalTasks) * 100) : 0;
  const isToday = date === todayStr();
  const label = parseDate(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{isToday ? 'Today · IST' : date < todayStr() ? 'Looking back' : 'Planning ahead'}</p>
          <h1 className="font-display mt-1 text-3xl font-bold sm:text-4xl" data-testid="text-date-label">{label}</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full bg-card p-1 ring-1 ring-border">
            <button onClick={() => setDate(shiftDate(date, -1))} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Previous day" data-testid="button-prev-day"><ChevronLeft className="h-4 w-4" /></button>
            <label className="relative flex items-center gap-1.5 px-2 text-sm font-medium">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-[8.5rem] bg-transparent font-mono text-sm outline-none" data-testid="input-date" />
            </label>
            <button onClick={() => setDate(shiftDate(date, 1))} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted" aria-label="Next day" data-testid="button-next-day"><ChevronRight className="h-4 w-4" /></button>
          </div>
          {!isToday && <button onClick={() => setDate(todayStr())} className="h-10 rounded-full px-3 text-sm font-medium text-primary hover:bg-muted" data-testid="button-today">Today</button>}
        </div>
      </div>

      <SheetSyncStatus />
      {dash.isError ? <ErrorState message="Couldn't load the day summary." onRetry={() => dash.refetch()} /> : (
        <div className="rise grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_1fr]" style={{ animationDelay: '60ms' }}>
          <div className="flex items-center gap-4 rounded-2xl bg-primary p-5 text-primary-foreground">
            <Ring value={d?.doneTasks ?? 0} total={d?.totalTasks ?? 0} size={72} stroke={8}>
              <span className="font-display text-lg font-bold tabular">{pct}%</span>
            </Ring>
            <div>
              <p className="text-sm opacity-75">Team progress</p>
              <p className="font-display text-2xl font-bold tabular" data-testid="text-progress">{dash.isLoading ? '—' : `${d?.doneTasks} of ${d?.totalTasks}`}</p>
              <p className="text-xs opacity-70">tasks complete</p>
            </div>
          </div>
          {[{ k: 'Done', v: d?.doneTasks, c: 'text-[hsl(var(--done))]' }, { k: 'Not done', v: d?.pendingTasks, c: 'text-destructive' }, { k: 'People', v: d?.totalEmployees, c: 'text-primary' }].map((s) => (
            <div key={s.k} className="rounded-2xl border bg-card p-5">
              <p className="text-sm text-muted-foreground">{s.k}</p>
              {dash.isLoading ? <div className="mt-2 h-8 w-12 animate-pulse rounded bg-muted" /> : <p className={cn('font-display mt-1 text-3xl font-bold tabular', s.c)} data-testid={`stat-${s.k.replace(' ', '-').toLowerCase()}`}>{s.v ?? 0}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <aside className="rise min-w-0 space-y-2" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display font-semibold">People</h2>
            {emp != null && <button onClick={() => setEmp(null)} className="text-xs font-medium text-primary" data-testid="button-clear-employee">Show all</button>}
          </div>
          {dash.isLoading && [0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
          {!dash.isLoading && (d?.employees.length ?? 0) === 0 && (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No employees yet. <Link href="/team" className="font-medium text-primary">Add your team</Link></div>
          )}
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {d?.employees.map((p) => {
              const active = emp === p.employee.id;
              const ratio = p.total ? p.done / p.total : 0;
              return (
                <button key={p.employee.id} onClick={() => setEmp(active ? null : p.employee.id)} data-testid={`card-employee-progress-${p.employee.id}`}
                  className={cn('flex min-w-[220px] items-center gap-3 rounded-xl border bg-card p-3 text-left transition hover:border-primary/40', active && 'border-primary ring-2 ring-primary/15')}>
                  <Avatar name={p.employee.name} color={p.employee.color} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{p.employee.name}</span>
                      <span className="font-mono text-xs tabular text-muted-foreground">{p.done}/{p.total}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn('h-full rounded-full transition-[width] duration-700', ratio >= 1 ? 'bg-[hsl(var(--done))]' : 'bg-accent')} style={{ width: `${ratio * 100}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rise min-w-0 space-y-3" style={{ animationDelay: '180ms' }}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks or people" className="h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none focus:border-primary" data-testid="input-search" />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-xl bg-muted p-1">
                {(['all', 'pending', 'done'] as Filter[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} data-testid={`button-filter-${f}`}
                    className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition', filter === f ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                    {f === 'pending' ? 'Not done' : f}
                  </button>
                ))}
              </div>
              <button onClick={() => setDialog({ open: true, task: null })} data-testid="button-new-task"
                className="ml-auto flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:brightness-95 active:scale-[.98]">
                <Plus className="h-4 w-4" /> Add task
              </button>
            </div>
          </div>

          {tasks.isLoading && [0, 1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted" />)}
          {tasks.isError && <ErrorState message="Couldn't load tasks." onRetry={() => tasks.refetch()} />}
          {tasks.data && tasks.data.length === 0 && (
            employees.length === 0
              ? <EmptyState icon={<UserPlus className="h-6 w-6" />} title="Start by adding your team" body="Tasks are assigned to people. Add an employee with a PIN, then plan their day here." action={<Link href="/team" className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground">Go to Team</Link>} />
              : <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="Nothing planned for this day" body="Assign time-slotted tasks and they'll show up on each person's checklist instantly." action={<button onClick={() => setDialog({ open: true, task: null })} className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="button-empty-new-task">Assign first task</button>} />
          )}
          {tasks.data && tasks.data.length > 0 && visible.length === 0 && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No tasks match these filters.</p>}

          <ul className="space-y-2">
            {visible.map((t) => (
              <li key={t.id} data-testid={`row-task-${t.id}`} className={cn('group flex gap-3 rounded-2xl border bg-card p-3 transition sm:p-4', t.done && 'bg-[hsl(var(--done-soft))]/50')}>
                <div className="w-16 shrink-0 border-r pr-3 font-mono text-xs leading-5 text-muted-foreground">
                  <div className="font-semibold text-foreground">{fmtTime(t.startTime)}</div>
                  <div>{fmtTime(t.endTime)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className={cn('flex-1 font-semibold leading-snug', t.done && 'text-muted-foreground line-through decoration-[hsl(var(--done))]/50')}>{t.title}</p>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', t.done ? 'bg-[hsl(var(--done))] text-white' : 'bg-destructive/10 text-destructive')} data-testid={`status-task-${t.id}`}>
                      {t.done ? 'Done' : 'Not done'}
                    </span>
                  </div>
                  {t.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
                  <p className="mt-1 text-[11px] font-medium text-primary">{t.recurringId ? 'Everyday checklist' : 'One-Time task'}</p>
                  <p className="mt-1 text-xs text-muted-foreground" data-testid={`performed-task-${t.id}`}>
                    Actual Time Performed: <span className={t.done ? 'font-medium text-[hsl(var(--done))]' : ''}>{t.done && t.completedAt ? istStamp(t.completedAt) : '—'}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Avatar name={t.employeeName} color={colorOf(t.employeeId)} size={20} className="ring-0" />
                    <span className="font-medium text-foreground/80">{t.employeeName}</span>
                    <div className="ml-auto flex gap-1">
                      <button onClick={() => setDialog({ open: true, task: t })} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted" aria-label="Edit task" data-testid={`button-edit-task-${t.id}`}><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setToDelete(t)} className="flex h-8 items-center justify-center gap-1 rounded-lg px-2 text-destructive hover:bg-destructive/10" aria-label={t.recurringId ? 'Delete everyday checklist' : 'Delete one-time task'} data-testid={`button-delete-task-${t.id}`}><Trash2 className="h-3.5 w-3.5" /> Delete</button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <TaskDialog open={dialog.open} onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))} task={dialog.task} employees={employees} defaultDate={date} defaultEmployeeId={emp ?? undefined} />
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">{toDelete?.recurringId ? 'Delete everyday checklist?' : 'Delete this one-time task?'}</AlertDialogTitle>
            <AlertDialogDescription>{toDelete?.recurringId
              ? `"${toDelete.title}" will be removed from ${toDelete.employeeName}'s checklist on ${toDelete.date} and every later date, including future repeats. Earlier history is kept. Corresponding Google Sheet rows will also be removed. This can't be undone.`
              : `"${toDelete?.title}" will be removed from ${toDelete?.employeeName}'s checklist and Google Sheet. This can't be undone.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (toDelete) del.mutate({ id: toDelete.id }); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">
              {del.isPending ? 'Deleting…' : toDelete?.recurringId ? 'Delete this date and future repeats' : 'Delete task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
