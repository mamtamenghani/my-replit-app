import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListAssistants, useCreateAssistant, useDeleteAssistant,
  getListAssistantsQueryKey, getGetDirectoryQueryKey, type User,
} from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { errMsg } from '@/lib/daytask';
import { useToast } from '@/hooks/use-toast';
import { ErrorState } from '@/components/brand';

const inputCls = 'h-11 w-full rounded-xl border border-input bg-card px-3 text-sm';
export function AssistantAccounts() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const list = useListAssistants({ query: { queryKey: getListAssistantsQueryKey(), refetchInterval: 15000 } });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [remove, setRemove] = useState<User | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListAssistantsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDirectoryQueryKey() });
  };
  const create = useCreateAssistant({ mutation: {
    onSuccess: () => { refresh(); setOpen(false); setPassword(''); toast({ title: 'EA account added', description: 'The EA can now select their name on the login screen.' }); },
    onError: e => setError(errMsg(e)),
  } });
  const del = useDeleteAssistant({ mutation: {
    onSuccess: () => { refresh(); setRemove(null); toast({ title: 'EA login removed' }); },
    onError: e => toast({ title: 'Could not remove EA', description: errMsg(e), variant: 'destructive' }),
  } });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || password.length < 8) { setError('Enter a name and a password of at least 8 characters.'); return; }
    setError(null);
    create.mutate({ data: { name: name.trim(), password } });
  };
  return <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-display text-xl font-semibold">Executive Assistants</h2>
        <p className="mt-1 text-sm text-muted-foreground">Separate logins with the same task-management access as Owner. Only Owner manages EA accounts.</p></div>
      <button onClick={() => { setName(''); setPassword(''); setError(null); setOpen(true); }}
        className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground" data-testid="button-add-ea">Add EA account</button>
    </div>
    {list.isError && <ErrorState message="Couldn't load EA accounts." onRetry={() => list.refetch()} />}
    {list.isLoading && <p className="text-sm text-muted-foreground">Loading EA accounts…</p>}
    {list.data?.length === 0 && <p className="text-sm text-muted-foreground">No EA accounts yet.</p>}
    {list.data?.map(u => <div key={u.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
      <div><p className="font-medium">{u.name}</p><p className="text-xs text-muted-foreground">EA · Executive Assistant</p></div>
      <button onClick={() => setRemove(u)} className="rounded-lg px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/10">Remove EA</button>
    </div>)}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add EA account</DialogTitle><DialogDescription>The EA can view all checklists, manage tasks and employees, and receive completion alerts.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium">EA name<input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={80} className={`${inputCls} mt-1.5`} data-testid="input-ea-name" /></label>
          <label className="block text-sm font-medium">EA password<input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} maxLength={128} autoComplete="new-password" className={`${inputCls} mt-1.5`} data-testid="input-ea-password" /><span className="mt-1 block text-xs text-muted-foreground">At least 8 characters. Share it securely with your EA.</span></label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-3 text-sm">Cancel</button>
            <button disabled={create.isPending} className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50" data-testid="button-save-ea">{create.isPending ? 'Adding…' : 'Create EA login'}</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <AlertDialog open={!!remove} onOpenChange={o => !o && setRemove(null)}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {remove?.name}'s EA login?</AlertDialogTitle>
        <AlertDialogDescription>This signs the EA out and revokes their access. Employee tasks and checklist history are kept.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={del.isPending} onClick={e => { e.preventDefault(); if (remove) del.mutate({ id: remove.id }); }} className="bg-destructive text-destructive-foreground">{del.isPending ? 'Removing…' : 'Remove EA login'}</AlertDialogAction>
        </AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
}
