import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useListNotifications, useMarkNotificationsRead, getListNotificationsQueryKey } from '@workspace/api-client-react';
import { CheckCheck, History } from 'lucide-react';
import { Avatar, EmptyState, ErrorState } from '@/components/brand';
import { POLL, istDay, istStamp, parseDate, todayStr, shiftDate } from '@/lib/daytask';
import { cn } from '@/lib/utils';

export default function Activity() {
  const qc = useQueryClient();
  const notes = useListNotifications({ query: { refetchInterval: POLL, queryKey: getListNotificationsQueryKey() } });
  const mark = useMarkNotificationsRead({ mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) } });
  const groups = useMemo(() => {
    const m = new Map<string, NonNullable<typeof notes.data>>();
    [...(notes.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach((n) => {
      const k = istDay(n.createdAt);
      m.set(k, [...(m.get(k) ?? []), n]);
    });
    return [...m.entries()];
  }, [notes.data]);
  const unread = notes.data?.filter((n) => !n.read).length ?? 0;
  const dayLabel = (k: string) => k === todayStr() ? 'Today' : k === shiftDate(todayStr(), -1) ? 'Yesterday' : parseDate(k).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rise flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Activity · IST</p>
          <h1 className="font-display mt-1 text-3xl font-bold sm:text-4xl">Completion history</h1>
        </div>
        <button disabled={unread === 0 || mark.isPending} onClick={() => mark.mutate()} data-testid="button-mark-all-read-page"
          className="flex h-10 items-center gap-1.5 rounded-xl bg-card px-3 text-sm font-medium ring-1 ring-border hover:bg-muted disabled:opacity-50">
          <CheckCheck className="h-4 w-4" /> Mark all read{unread ? ` (${unread})` : ''}
        </button>
      </div>
      {notes.isLoading && [0, 1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}
      {notes.isError && <ErrorState message="Couldn't load activity." onRetry={() => notes.refetch()} />}
      {notes.data && notes.data.length === 0 && <EmptyState icon={<History className="h-6 w-6" />} title="No completions yet" body="When someone marks a task Done, it's recorded here with the time it happened." />}
      {groups.map(([day, items]) => (
        <section key={day} className="rise">
          <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">{dayLabel(day)}</h2>
          <ol className="relative space-y-1 border-l-2 border-dashed border-border pl-5">
            {items.map((n) => (
              <li key={n.id} className={cn('relative rounded-xl p-3', !n.read && 'bg-accent/10')} data-testid={`row-notification-${n.id}`}>
                <span className="absolute -left-[29px] top-4 h-3 w-3 rounded-full border-2 border-background bg-[hsl(var(--done))]" />
                <div className="flex items-start gap-3">
                  <Avatar name={n.employeeName} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug"><b>{n.employeeName}</b> completed <span className="font-medium">{n.taskTitle}</span></p>
                    {n.message && <p className="text-xs text-muted-foreground">{n.message}</p>}
                  </div>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{istStamp(n.createdAt)}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
