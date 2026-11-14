import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetDirectory, useSetupAdmin, useLogin, getGetMeQueryKey, getGetDirectoryQueryKey, type User,
} from '@workspace/api-client-react';
import { ArrowLeft, ArrowRight, Check, Lock, ShieldCheck } from 'lucide-react';
import { Logo, Avatar, ErrorState } from '@/components/brand';
import { errMsg } from '@/lib/daytask';
import { unlockAudio } from '@/lib/live';
import { cn } from '@/lib/utils';

function Field({ label, hint, ...props }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <input {...props} className="h-12 w-full rounded-xl border border-input bg-card px-4 text-base outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" />
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Preview() {
  const rows = [
    { t: '10:00', title: 'Open inbox and triage orders', done: true },
    { t: '11:30', title: 'Restock front shelves', done: true },
    { t: '14:00', title: 'Call back supplier', done: false },
    { t: '16:15', title: 'Prepare tomorrow pick list', done: false },
  ];
  return (
    <div className="relative">
      <span className="absolute -top-3 left-5 z-10 rounded-full bg-accent px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">Illustration only</span>
      <div className="rotate-[-1.5deg] rounded-3xl border bg-card p-5 shadow-[0_30px_60px_-30px_hsl(192_45%_14%/.35)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">An employee's day</p>
            <p className="font-display text-lg font-semibold">2 of 4 done</p>
          </div>
          <div className="h-2 w-28 overflow-hidden rounded-full bg-muted"><div className="h-full w-1/2 rounded-full bg-accent" /></div>
        </div>
        <ul className="mt-4 space-y-2">
          {rows.map((r) => (
            <li key={r.t} className="flex items-center gap-3 rounded-xl bg-background px-3 py-2.5">
              <span className="w-11 font-mono text-xs text-muted-foreground">{r.t}</span>
              <span className={cn('flex-1 text-sm', r.done && 'text-muted-foreground line-through')}>{r.title}</span>
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-full', r.done ? 'bg-[hsl(var(--done))] text-white' : 'ring-1 ring-border')}>
                {r.done && <Check className="h-3.5 w-3.5" />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Setup() {
  const qc = useQueryClient();
  const [, setLoc] = useLocation();
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const setup = useSetupAdmin({
    mutation: {
      onSuccess: (user) => {
        qc.setQueryData(getGetMeQueryKey(), { user });
        qc.invalidateQueries({ queryKey: getGetDirectoryQueryKey() });
        setLoc('/dashboard');
      },
      onError: (e) => setErr(errMsg(e)),
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    setErr(null);
    if (!name.trim()) return setErr('Add your name so your team knows who assigns work.');
    if (pw.length < 8) return setErr('Password needs at least 8 characters.');
    if (pw !== pw2) return setErr('Passwords do not match.');
    setup.mutate({ data: { name: name.trim(), password: pw } });
  };
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-2">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Logo />
        <div className="rise my-auto w-full max-w-md py-10">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">First run · Step 1 of 1</p>
          <h1 className="font-display mt-3 text-4xl font-bold leading-[1.05] sm:text-5xl">Set up the owner account.</h1>
          <p className="mt-3 text-muted-foreground">You'll plan each person's day in time slots between 10:00 and 20:30 and watch it fill in as they check things off.</p>
          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Raman" maxLength={80} autoFocus data-testid="input-admin-name" />
            <Field label="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 8 characters" autoComplete="new-password" data-testid="input-admin-password" />
            <Field label="Confirm password" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" data-testid="input-admin-password-confirm" />
            {err && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-setup-error">{err}</p>}
            <button type="submit" disabled={setup.isPending} data-testid="button-setup"
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[.99] disabled:opacity-60">
              {setup.isPending ? 'Creating account…' : <>Create owner account <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>
          <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" /> This screen only appears once. Next, add your team.</p>
        </div>
      </div>
      <div className="relative hidden items-center justify-center overflow-hidden bg-primary p-12 lg:flex">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-accent/25" />
        <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full border-[40px] border-primary-foreground/5" />
        <div className="relative w-full max-w-sm">
          <ol className="mb-10 space-y-3 text-primary-foreground/90">
            {['Add people with a simple PIN', 'Assign tasks to time slots', 'See every check-off the moment it happens'].map((s, i) => (
              <li key={s} className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent font-mono text-xs font-bold text-accent-foreground">{i + 1}</span>{s}</li>
            ))}
          </ol>
          <Preview />
        </div>
      </div>
    </div>
  );
}

function Login({ users }: { users: User[] }) {
  const qc = useQueryClient();
  const [, setLoc] = useLocation();
  const [sel, setSel] = useState<User | null>(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const login = useLogin({
    mutation: {
      onSuccess: (user) => {
        qc.setQueryData(getGetMeQueryKey(), { user });
        setLoc(user.role !== 'employee' ? '/dashboard' : '/my-tasks');
      },
      onError: (e) => { setErr(errMsg(e, 'Could not sign in')); setPw(''); },
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    if (!sel || !pw) return;
    setErr(null);
    login.mutate({ data: { userId: sel.id, password: pw } });
  };
  const sorted = [...users].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'admin' ? -1 : 1));
  return (
    <div className="flex min-h-[100dvh] flex-col items-center px-5 py-8">
      <Logo />
      <div className="rise my-auto w-full max-w-md py-10">
        {!sel ? (
          <>
            <h1 className="font-display text-center text-4xl font-bold">Who's working?</h1>
            <p className="mt-2 text-center text-muted-foreground">Tap your name to open your day.</p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {sorted.map((u, i) => (
                <button key={u.id} onClick={() => { setSel(u); setErr(null); }} data-testid={`button-user-${u.id}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="rise group flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:scale-[.98]">
                  <Avatar name={u.name} color={u.color} size={52} />
                  <span className="line-clamp-1 text-sm font-semibold">{u.name}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{u.role === 'admin' ? 'Owner' : u.role === 'ea' ? 'EA · Executive Assistant' : u.department || 'Team'}</span>
                </button>
              ))}
            </div>
            {users.filter((u) => u.role === 'employee').length === 0 && (
              <p className="mt-6 text-center text-sm text-muted-foreground">No employees yet. The owner can add them from the Team page.</p>
            )}
          </>
        ) : (
          <form onSubmit={submit} className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
            <button type="button" onClick={() => { setSel(null); setPw(''); }} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" /> Not you?
            </button>
            <div className="flex flex-col items-center text-center">
              <Avatar name={sel.name} color={sel.color} size={64} />
              <h2 className="font-display mt-3 text-2xl font-bold">Hi, {sel.name.split(' ')[0]}</h2>
              <p className="text-sm text-muted-foreground">{sel.role !== 'employee' ? 'Enter your password' : 'Enter your PIN or password'}</p>
            </div>
            <div className="relative mt-6">
              <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus
                inputMode={sel.role !== 'employee' ? 'text' : undefined} autoComplete="current-password" data-testid="input-password"
                className="h-14 w-full rounded-xl border border-input bg-background pl-11 pr-4 font-mono text-lg tracking-[0.3em] outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />
            </div>
            {err && <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-login-error">{err}</p>}
            <button type="submit" disabled={!pw || login.isPending} data-testid="button-login"
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
              {login.isPending ? 'Signing in…' : <>Open my day <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function AuthPage() {
  const dir = useGetDirectory();
  if (dir.isLoading)
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-6">
        <Logo />
        <div className="grid w-full max-w-md grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}</div>
      </div>
    );
  if (dir.isError || !dir.data)
    return <div className="mx-auto flex min-h-[100dvh] max-w-md items-center px-6"><div className="w-full"><ErrorState message="Couldn't reach Megatronics Day Task." onRetry={() => dir.refetch()} /></div></div>;
  return dir.data.needsSetup ? <Setup /> : <Login users={dir.data.users} />;
}
