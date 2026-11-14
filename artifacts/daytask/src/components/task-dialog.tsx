import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateTask, useUpdateTask, type Task, type User } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TIME_OPTIONS, errMsg, invalidateWork, fmtTime } from '@/lib/daytask';
import { useToast } from '@/hooks/use-toast';

const inputCls = 'h-11 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10';

export function TaskDialog({ open, onOpenChange, employees, task, defaultDate, defaultEmployeeId }: {
  open: boolean; onOpenChange: (o: boolean) => void; employees: User[]; task?: Task | null; defaultDate: string; defaultEmployeeId?: number;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [employeeId, setEmployeeId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStart] = useState('10:00');
  const [endTime, setEnd] = useState('11:00');
  const [everyday, setEveryday] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (task) {
      setEmployeeId(String(task.employeeId)); setTitle(task.title); setDescription(task.description ?? '');
      setDate(task.date); setStart(task.startTime); setEnd(task.endTime);
      setEveryday(!!task.recurringId);
    } else {
      setEmployeeId(defaultEmployeeId ? String(defaultEmployeeId) : employees[0] ? String(employees[0].id) : '');
      setTitle(''); setDescription(''); setDate(defaultDate); setStart('10:00'); setEnd('11:00');
      setEveryday(false);
    }
  }, [open, task, defaultDate, defaultEmployeeId, employees]);

  const opts = { mutation: {
    onSuccess: () => { invalidateWork(qc); toast({ title: task ? 'Task updated' : 'Task assigned' }); onOpenChange(false); },
    onError: (e: unknown) => setErr(errMsg(e)),
  } };
  const create = useCreateTask(opts);
  const update = useUpdateTask(opts);
  const pending = create.isPending || update.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!employeeId) return setErr('Choose who this task is for.');
    if (!title.trim()) return setErr('Give the task a title.');
    if (!date) return setErr('Pick a date.');
    if (!(startTime >= '10:00' && startTime < endTime && endTime <= '20:30')) return setErr('Time slot must sit between 10:00 and 20:30, with start before end.');
    const data = { employeeId: Number(employeeId), title: title.trim(), description: description.trim(), date, startTime, endTime, everyday };
    if (task) update.mutate({ id: task.id, data }); else create.mutate({ data });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{task ? 'Edit task' : 'Assign a task'}</DialogTitle>
          <DialogDescription>Workday runs 10:00 to 20:30 IST. New tasks start as Not Done.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Tabs value={everyday ? 'everyday' : 'one-time'} onValueChange={(value) => { if (!task) { setEveryday(value === 'everyday'); setErr(null); } }}>
            <TabsList aria-label="Task type" className="grid h-auto w-full grid-cols-2 gap-1 p-1">
              <TabsTrigger type="button" value="one-time" disabled={!!task && everyday} className="min-h-14 whitespace-normal px-2" data-testid="tab-task-one-time">One-Time Task</TabsTrigger>
              <TabsTrigger type="button" value="everyday" disabled={!!task && !everyday} className="min-h-14 flex-col whitespace-normal px-2" data-testid="toggle-task-everyday">
                <span>Everyday Checklist</span>
                <span className="text-xs font-normal">(Repeat Daily)</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value={everyday ? 'everyday' : 'one-time'} className="mt-4 space-y-4">
              <p className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">{everyday
                ? task
                  ? 'Changes apply to this entry and later uncompleted entries. Earlier history is kept.'
                  : 'Repeats every day from the selected start date, including weekends. Each day starts as Not Done.'
                : 'Only appears on the selected date.'}</p>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Employee</span>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputCls} data-testid="select-task-employee">
              {employees.length === 0 && <option value="">No employees yet</option>}
              {employees.map((u) => <option key={u.id} value={u.id}>{u.name}{u.department ? ` · ${u.department}` : ''}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} className={inputCls} placeholder="What needs doing?" data-testid="input-task-title" />
          </label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium">Notes <span className="font-normal text-muted-foreground">(optional)</span></span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} className={inputCls + ' h-auto py-2.5'} data-testid="input-task-description" />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-3 block sm:col-span-1"><span className="mb-1.5 block text-sm font-medium">{everyday && !task ? 'Starts on' : 'Date'}</span>
              <input type="date" disabled={!!task?.recurringId} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} data-testid="input-task-date" />
            </label>
            <label className="block sm:col-span-1"><span className="mb-1.5 block text-sm font-medium">Start</span>
              <select value={startTime} onChange={(e) => setStart(e.target.value)} className={inputCls + ' font-mono'} data-testid="select-task-start">
                {TIME_OPTIONS.slice(0, -1).map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
              </select>
            </label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium">End</span>
              <select value={endTime} onChange={(e) => setEnd(e.target.value)} className={inputCls + ' font-mono'} data-testid="select-task-end">
                {TIME_OPTIONS.slice(1).map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
              </select>
            </label>
          </div>
          {err && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-task-error">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-4 text-sm font-medium hover:bg-muted" data-testid="button-cancel-task">Cancel</button>
            <button type="submit" disabled={pending || employees.length === 0} className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50" data-testid="button-save-task">
              {pending ? 'Saving…' : task ? 'Save changes' : everyday ? 'Add everyday checklist' : 'Add one-time task'}
            </button>
          </div>
            </TabsContent>
          </Tabs>
        </form>
      </DialogContent>
    </Dialog>
  );
}
