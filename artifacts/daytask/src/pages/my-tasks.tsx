import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useListTasks, useSetTaskStatus, getListTasksQueryKey, type Task, type User } from '@workspace/api-client-react';
import { Check, Coffee, X } from 'lucide-react';
import { Ring, EmptyState, ErrorState } from '@/components/brand';
import { POLL, todayStr, parseDate, fmtTime, nowHM, errMsg, invalidateWork, istStamp } from '@/lib/daytask';
import { chime } from '@/lib/live';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export default function MyTasks({ user }: { user: User }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const date = todayStr();
  const params = { date, employeeId: user.id };
  const key = getListTasksQueryKey(params);
  const tasks = useListTasks(params, { query: { refetchInterval: POLL, queryKey: key } });
  const [now, setNow] = useState(nowHM());
  const [popped, setPopped] = useState<number | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(nowHM()), 30_000); return () => clearInterval(t); }, []);

  const status = useSetTaskStatus({
    mutation: {
      onMutate: async ({ id, data }) => {
        await qc.cancelQueries({ queryKey: key });
        const prev = qc.getQueryData<Task[]>(key);
        qc.setQueryData<Task[]>(key, (old) => old?.map((t) => (t.id === id ? { ...t, done: data.done, completedAt: data.done ? new Date().toISOString() : null } : t)));
        return { prev };
      },
      onError: (e, _v, ctx) => {
        const c = ctx as { prev?: Task[] } | undefined;
        if (c?.prev) qc.setQueryData(key, c.prev);
        toast({ title: 'Could not update', description: errMsg(e), variant: 'destructive' });
      },
      onSettled: () => invalidateWork(qc),
    },
  });
  const setDone = (t: Task, done: boolean) => {
    if (t.done === done) return;
    if (done) { setPopped(t.id); chime(); setTimeout(() => setPopped(null), 500); }
    status.mutate({ id: t.id, data: { done } });
  };

  const list = [...(tasks.data ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const done = list.filter((t) => t.done).length;
  const all = list.length > 0 && done === list.length;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="rise flex items-center gap-4 rounded-3xl bg-primary p-5 text-primary-foreground sm:p-6">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs uppercase tracking-[0.18em] opacity-70">{parseDate(date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · {fmtTime(now)} IST</p>
          <h1 className="font-display mt-1 text-2xl font-bold sm:text-3xl">{all ? 'All done. Nice work.' : `Good to see you, ${user.name.split(' ')[0]}`}</h1>
          <p className="mt-1 text-sm opacity-80" data-testid="text-my-progress">{tasks.isLoading ? 'Loading your day…' : list.length ? `${done} of ${list.length} done` : 'No tasks yet today'}</p>
        </div>
        <Ring value={done} total={list.length} size={76} stroke={8}><span className="font-display text-lg font-bold tabular">{done}/{list.length}</span></Ring>
      </div>

      {tasks.isLoading && [0, 1, 2].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-muted" />)}
      {tasks.isError && <ErrorState message="Couldn't load your tasks." onRetry={() => tasks.refetch()} />}
      {tasks.data && list.length === 0 && <EmptyState icon={<Coffee className="h-6 w-6" />} title="Your day is clear" body="The owner hasn't assigned anything yet. New tasks appear here automatically." />}

      <ol className="space-y-3">
        {list.map((t, i) => {
          const current = !t.done && now >= t.startTime && now < t.endTime;
          const late = !t.done && now >= t.endTime;
          return (
            <li key={t.id} className={cn('rise rounded-2xl border bg-card p-4 transition', t.done && 'border-[hsl(var(--done))]/30 bg-[hsl(var(--done-soft))]/60', current && 'border-accent ring-2 ring-accent/30')} style={{ animationDelay: `${i * 50}ms` }} data-testid={`card-my-task-${t.id}`}>
              <div className="flex items-start gap-3">
                <div className="font-mono text-xs leading-5">
                  <div className="font-semibold">{fmtTime(t.startTime)}</div>
                  <div className="text-muted-foreground">{fmtTime(t.endTime)}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {current && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold uppercase text-accent-foreground">Now</span>}
                    {late && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold uppercase text-destructive">Past slot</span>}
                  </div>
                  <p className={cn('font-semibold leading-snug', t.done && 'text-muted-foreground line-through')}>{t.title}</p>
                  {t.description && <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p>}
                  <p className="mt-1 text-xs text-primary">{t.recurringId ? 'Everyday checklist' : 'One-Time task'}</p>
                  {t.done && t.completedAt && <p className="mt-1 text-xs text-[hsl(var(--done))]">Actual Time Performed: {istStamp(t.completedAt)}</p>}
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setDone(t, false)} aria-pressed={!t.done} data-testid={`button-not-done-${t.id}`}
                  className={cn('flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition active:scale-[.97]',
                    !t.done ? 'bg-destructive/10 text-destructive ring-1 ring-destructive/30' : 'bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive')}>
                  <X className="h-4 w-4" /> Not Done
                </button>
                <button onClick={() => setDone(t, true)} aria-pressed={t.done} data-testid={`button-done-${t.id}`}
                  className={cn('flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition active:scale-[.97]',
                    t.done ? 'bg-[hsl(var(--done))] text-white shadow-[0_8px_20px_-10px_hsl(var(--done))]' : 'bg-[hsl(var(--done-soft))] text-[hsl(var(--done))] hover:brightness-95')}>
                  <Check className={cn('h-4 w-4', popped === t.id && 'pop')} /> Done
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
