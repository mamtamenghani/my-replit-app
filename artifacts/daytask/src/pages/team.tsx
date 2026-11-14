import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useListEmployees, useCreateEmployee, useDeleteEmployee, getListEmployeesQueryKey, getGetDirectoryQueryKey, useGetMe, type User } from '@workspace/api-client-react';
import { Plus, Trash2, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, EmptyState, ErrorState } from '@/components/brand';
import { POLL, errMsg, invalidateWork } from '@/lib/daytask';
import { useToast } from '@/hooks/use-toast';
import { AssistantAccounts } from '@/components/assistant-accounts';

const inputCls = 'h-11 w-full rounded-xl border border-input bg-card px-3 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10';

export default function Team() {
  const me = useGetMe();
  const qc = useQueryClient();
  const { toast } = useToast();
  const emps = useListEmployees({ query: { refetchInterval: POLL, queryKey: getListEmployeesQueryKey() } });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [dept, setDept] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<User | null>(null);
  const refresh = () => { invalidateWork(qc); qc.invalidateQueries({ queryKey: getGetDirectoryQueryKey() }); };
  const create = useCreateEmployee({
    mutation: {
      onSuccess: (u) => { refresh(); toast({ title: `${u.name} added`, description: 'Share their PIN so they can sign in.' }); setOpen(false); },
      onError: (e) => setErr(errMsg(e)),
    },
  });
  const remove = useDeleteEmployee({
    mutation: {
      onSuccess: () => { refresh(); toast({ title: 'Employee removed' }); setToRemove(null); },
      onError: (e) => toast({ title: 'Could not remove', description: errMsg(e), variant: 'destructive' }),
    },
  });
  const openNew = () => { setName(''); setDept(''); setPw(''); setErr(null); setOpen(true); };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) return setErr('Name is required.');
    if (pw.length < 4) return setErr('PIN or password needs at least 4 characters.');
    create.mutate({ data: { name: name.trim(), password: pw, department: dept.trim() || undefined } });
  };
  const list = (emps.data ?? []).filter((u) => u.role === 'employee');

  return (
    <div className="space-y-6">
      <div className="rise flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Team</p>
          <h1 className="font-display mt-1 text-3xl font-bold sm:text-4xl">Your people</h1>
          <p className="mt-1 text-sm text-muted-foreground">{emps.data ? `${list.length} ${list.length === 1 ? 'employee' : 'employees'}` : ' '}</p>
        </div>
        <button onClick={openNew} className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground hover:brightness-95" data-testid="button-add-employee"><Plus className="h-4 w-4" /> Add employee</button>
      </div>
      {me.data?.user?.role === 'admin' && <AssistantAccounts />}
      {emps.isLoading && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />)}</div>}
      {emps.isError && <ErrorState message="Couldn't load your team." onRetry={() => emps.refetch()} />}
      {emps.data && list.length === 0 && (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No one here yet" body="Add each employee with a name and a 4-digit PIN. They'll pick their name on the sign-in screen and see only their own day."
          action={<button onClick={openNew} className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="button-empty-add-employee">Add first employee</button>} />
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((u, i) => (
          <div key={u.id} className="rise flex items-center gap-3 rounded-2xl border bg-card p-4" style={{ animationDelay: `${i * 40}ms` }} data-testid={`card-employee-${u.id}`}>
            <Avatar name={u.name} color={u.color} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{u.name}</p>
              <p className="truncate text-sm text-muted-foreground">{u.department || 'No department'}</p>
            </div>
            <button onClick={() => setToRemove(u)} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remove ${u.name}`} data-testid={`button-remove-employee-${u.id}`}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Add employee</DialogTitle>
            <DialogDescription>They'll sign in by tapping their name and entering this PIN.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <label className="block"><span className="mb-1.5 block text-sm font-medium">Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputCls} data-testid="input-employee-name" /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium">Department <span className="font-normal text-muted-foreground">(optional)</span></span><input value={dept} onChange={(e) => setDept(e.target.value)} maxLength={80} className={inputCls} data-testid="input-employee-department" /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-medium">PIN or password</span><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls + ' font-mono tracking-widest'} autoComplete="new-password" data-testid="input-employee-password" /><span className="mt-1 block text-xs text-muted-foreground">A 4-digit PIN works, or any password of 4+ characters.</span></label>
            {err && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-employee-error">{err}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl px-4 text-sm font-medium hover:bg-muted">Cancel</button>
              <button type="submit" disabled={create.isPending} className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="button-save-employee">{create.isPending ? 'Adding…' : 'Add employee'}</button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toRemove} onOpenChange={(o) => !o && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Remove {toRemove?.name}?</AlertDialogTitle>
            <AlertDialogDescription>They will no longer be able to sign in, and <b>every task assigned to them, past and future, will be permanently deleted</b>. This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); if (toRemove) remove.mutate({ id: toRemove.id }); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-remove">
              {remove.isPending ? 'Removing…' : 'Remove and delete tasks'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
