import { useEffect, useMemo, useState } from 'react';
import { getGetMisReportQueryKey, useGetMisReport } from '@workspace/api-client-react';
import { ArrowDownToLine, BarChart3, CheckCircle2, Clock3, ExternalLink, ListChecks, Users } from 'lucide-react';
import { Avatar, EmptyState, ErrorState } from '@/components/brand';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { parseDate, shiftDate, todayStr, TZ } from '@/lib/daytask';

type Period = 'today' | 'week' | 'custom';
const controlCls = 'h-10 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10';

function isoDay(date: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function durationLabel(minutes: number | null) {
  if (minutes == null || !Number.isFinite(minutes)) return '—';
  const mins = Math.max(0, Math.floor(minutes));
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const remainder = mins % 60;
  if (days) return `${days}d ${hours}h ${remainder}m`;
  if (hours) return `${hours}h ${remainder}m`;
  return `${remainder}m`;
}
function minutesBetween(from: string | null, to: number | string) {
  if (!from) return null;
  const end = typeof to === 'number' ? to : new Date(to).getTime();
  const start = new Date(from).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return (end - start) / 60_000;
}
function timeStampLabel(iso: string | null, clock: string | null) {
  if (!iso || !clock) return '—';
  const date = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
  return `${date} · ${clock} IST`;
}
function csvCell(value: string | number) {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export default function MisReport() {
  const report = useGetMisReport({ query: { queryKey: getGetMisReportQueryKey(), refetchInterval: 15_000 } });
  const [period, setPeriod] = useState<Period>('today');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [teamMember, setTeamMember] = useState('all');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const bounds = useMemo(() => {
    if (period === 'today') return { from: todayStr(), to: todayStr() };
    if (period === 'week') {
      const today = todayStr();
      const monday = shiftDate(today, -((parseDate(today).getDay() + 6) % 7));
      return { from: monday, to: shiftDate(monday, 6) };
    }
    return { from: startDate, to: endDate };
  }, [period, startDate, endDate]);
  const invalidRange = period === 'custom' && (!startDate || !endDate || startDate > endDate);
  const filtered = useMemo(() => (report.data?.tasks ?? [])
    .filter((task) => task.date >= bounds.from && task.date <= bounds.to)
    .filter((task) => teamMember === 'all' || task.teamMember === teamMember)
    .sort((a, b) => b.date.localeCompare(a.date) || (a.timeGivenAt ?? '').localeCompare(b.timeGivenAt ?? '')), [report.data, bounds, teamMember]);
  const completed = filtered.filter((task) => task.status === 'Done');
  const pending = filtered.length - completed.length;
  const completionRate = filtered.length ? Math.round((completed.length / filtered.length) * 100) : 0;

  const performance = useMemo(() => {
    const grouped = new Map<string, typeof filtered>();
    for (const task of filtered) grouped.set(task.teamMember, [...(grouped.get(task.teamMember) ?? []), task]);
    return [...grouped.entries()].map(([name, tasks]) => {
      const doneTasks = tasks.filter((task) => task.status === 'Done');
      const durations = doneTasks.map((task) => minutesBetween(task.timeGivenAt, task.timeDoneAt ?? '')).filter((value): value is number => value != null && value >= 0);
      const avg = durations.length ? durations.reduce((total, value) => total + value, 0) / durations.length : null;
      return { name, total: tasks.length, done: doneTasks.length, pending: tasks.length - doneTasks.length, avg };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const exportCsv = () => {
    const rows = [
      ['Date', 'Task Name', 'Team Member', 'Status', 'Time Given (scheduled start)', 'Time Done', 'Turnaround Time'],
      ...filtered.map((task) => {
        const turnaround = task.status === 'Done'
          ? durationLabel(minutesBetween(task.timeGivenAt, task.timeDoneAt ?? ''))
          : durationLabel(minutesBetween(task.timeGivenAt, now));
        return [task.date, task.taskName, task.teamMember, task.status, task.timeGiven ?? '', task.timeDone ?? '', turnaround];
      }),
    ];
    const csv = '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `megatronics-mis-${bounds.from}-${bounds.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (report.isError) return <div className="mx-auto max-w-4xl"><ErrorState message="Couldn't read MIS data from the connected Google Sheet. Check the Sheet1 headers and connection, then retry." onRetry={() => report.refetch()} /></div>;

  return (
    <div className="space-y-6">
      <div className="rise flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Megatronics · Operations</p>
          <h1 className="font-display mt-1 text-3xl font-bold sm:text-4xl">MIS Report</h1>
          <p className="mt-1 text-sm text-muted-foreground">Task completion and turnaround from the connected Google Sheet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={report.data?.sourceUrl ?? 'https://docs.google.com/spreadsheets/d/1__EUvj60FZGmPNlQ6GCwxVrNJj-UBVN-seQ_hUFOxQE/edit#gid=0'} target="_blank" rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-xl border bg-card px-3 text-sm font-medium hover:bg-muted">
            <ExternalLink className="h-4 w-4" /> Open Sheet
          </a>
          <Button onClick={exportCsv} disabled={report.isLoading || invalidRange} className="h-10 rounded-xl" data-testid="button-export-mis">
            <ArrowDownToLine className="mr-2 h-4 w-4" /> Export MIS to CSV
          </Button>
        </div>
      </div>

      <Card className="rise">
        <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date range</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value as Period)} className={controlCls} data-testid="select-mis-period">
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="custom">Custom Range</option>
            </select>
          </label>
          {period === 'custom' ? (
            <div className="grid grid-cols-2 gap-2 md:col-span-2">
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">From</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={controlCls} /></label>
              <label className="block"><span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">To</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className={controlCls} /></label>
            </div>
          ) : (
            <div className="flex h-10 items-center rounded-xl bg-muted/50 px-3 text-sm text-muted-foreground md:col-span-2" data-testid="text-mis-date-range">
              {bounds.from === bounds.to ? bounds.from : `${bounds.from} – ${bounds.to}`} · IST
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Team member</span>
            <select value={teamMember} onChange={(event) => setTeamMember(event.target.value)} className={controlCls} data-testid="select-mis-team-member">
              <option value="all">All team members</option>
              {(report.data?.teamMembers ?? []).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </CardContent>
        {invalidRange && <p className="px-4 pb-4 text-sm text-destructive">Choose a valid custom date range.</p>}
      </Card>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="MIS summary">
        {[
          { label: 'Total Tasks Assigned', value: filtered.length, icon: ListChecks, color: 'text-primary' },
          { label: 'Total Done', value: completed.length, icon: CheckCircle2, color: 'text-[hsl(var(--done))]' },
          { label: 'Total Not Done (Pending)', value: pending, icon: Clock3, color: 'text-amber-600' },
          { label: 'Completion Rate', value: `${completionRate}%`, icon: BarChart3, color: 'text-primary' },
        ].map((item) => (
          <Card key={item.label} className="rise">
            <CardContent className="flex items-center justify-between p-5">
              <div><p className="text-sm text-muted-foreground">{item.label}</p><p className={`mt-1 font-display text-3xl font-bold tabular-nums ${item.color}`}>{report.isLoading ? '—' : item.value}</p></div>
              <span className="rounded-xl bg-muted p-3"><item.icon className={`h-5 w-5 ${item.color}`} /></span>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="rise min-w-0 overflow-hidden">
        <CardHeader className="pb-3"><CardTitle className="font-display text-xl">Task-Level MIS</CardTitle></CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[940px]">
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Task</TableHead><TableHead>Team Member</TableHead><TableHead>Status</TableHead><TableHead>Time Given</TableHead><TableHead>Time Done</TableHead><TableHead>Turnaround Time</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {report.isLoading && [0, 1, 2].map((index) => <TableRow key={index}><TableCell colSpan={7}><div className="h-5 animate-pulse rounded bg-muted" /></TableCell></TableRow>)}
                {!report.isLoading && !invalidRange && filtered.map((task) => {
                  const turnaround = task.status === 'Done' ? minutesBetween(task.timeGivenAt, task.timeDoneAt ?? '') : minutesBetween(task.timeGivenAt, now);
                  const futureStart = task.status !== 'Done' && task.timeGivenAt && new Date(task.timeGivenAt).getTime() > now;
                  return <TableRow key={task.taskId} data-testid={`row-mis-task-${task.taskId}`}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{task.date}</TableCell>
                    <TableCell className="max-w-[240px] font-medium"><span className="line-clamp-2">{task.taskName}</span></TableCell>
                    <TableCell className="whitespace-nowrap"><span className="flex items-center gap-2"><Avatar name={task.teamMember} size={28} />{task.teamMember}</span></TableCell>
                    <TableCell><Badge variant={task.status === 'Done' ? 'secondary' : 'outline'} className={task.status === 'Done' ? 'bg-[hsl(var(--done-soft))] text-[hsl(var(--done))]' : 'text-amber-700'}>{task.status}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{timeStampLabel(task.timeGivenAt, task.timeGiven)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{timeStampLabel(task.timeDoneAt, task.timeDone)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{futureStart ? `Starts in ${durationLabel(-turnaround!)}` : durationLabel(turnaround)}</TableCell>
                  </TableRow>;
                })}
                {!report.isLoading && !invalidRange && filtered.length === 0 && <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No tasks match these filters.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">Time Given is the scheduled start from the sheet’s Time Slot. Time Done uses Actual Time Performed. Durations are calculated in IST.</p>
        </CardContent>
      </Card>

      <Card className="rise min-w-0 overflow-hidden">
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 font-display text-xl"><Users className="h-5 w-5 text-primary" /> Team Member Performance</CardTitle></CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader><TableRow><TableHead>Team Member</TableHead><TableHead>Assigned Tasks</TableHead><TableHead>Completed</TableHead><TableHead>Pending</TableHead><TableHead>Average Turnaround</TableHead></TableRow></TableHeader>
              <TableBody>
                {report.isLoading && [0, 1].map((index) => <TableRow key={index}><TableCell colSpan={5}><div className="h-5 animate-pulse rounded bg-muted" /></TableCell></TableRow>)}
                {!report.isLoading && performance.map((person) => <TableRow key={person.name}>
                  <TableCell><span className="flex items-center gap-2 font-medium"><Avatar name={person.name} size={28} />{person.name}</span></TableCell>
                  <TableCell className="font-mono">{person.total}</TableCell><TableCell className="font-mono text-[hsl(var(--done))]">{person.done}</TableCell><TableCell className="font-mono text-amber-700">{person.pending}</TableCell><TableCell className="font-mono">{durationLabel(person.avg)}</TableCell>
                </TableRow>)}
                {!report.isLoading && performance.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No team performance data for this selection.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <p className="border-t px-4 py-3 text-xs text-muted-foreground">Average turnaround includes completed tasks with valid start and completion times.</p>
        </CardContent>
      </Card>

      {!report.isLoading && (report.data?.tasks.length ?? 0) === 0 && <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="No task rows in the linked sheet" body="Once tasks sync to Google Sheets, they will appear here automatically." />}
    </div>
  );
}
