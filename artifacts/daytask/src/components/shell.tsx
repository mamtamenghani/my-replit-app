import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListNotifications, useLogout, useMarkNotificationsRead, getListNotificationsQueryKey,
  getPushConfig, subscribePush, type User,
} from '@workspace/api-client-react';
import { Bell, BellRing, CalendarCheck, History, LayoutGrid, LogOut, Users, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Logo, Avatar } from '@/components/brand';
import { useLive, base64urlToUint8Array } from '@/lib/live';
import { POLL, relTime, errMsg, istStamp } from '@/lib/daytask';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function LiveDot() {
  const { connected } = useLive();
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-medium ring-1 ring-border" data-testid="status-live">
      <span className="relative flex h-2 w-2">
        {connected && <span className="live-ring absolute inset-0 rounded-full bg-[hsl(var(--done))]" />}
        <span className={cn('relative h-2 w-2 rounded-full', connected ? 'bg-[hsl(var(--done))]' : 'bg-muted-foreground/50')} />
      </span>
      <span className="hidden sm:inline">{connected ? 'Live' : 'Reconnecting'}</span>
    </span>
  );
}

type PushState = 'checking' | 'unsupported' | 'denied' | 'idle' | 'working' | 'enabled';

function usePush() {
  const [state, setState] = useState<PushState>('checking');
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!supported) { setState('unsupported'); return; }
    if (Notification.permission === 'denied') { setState('denied'); return; }
    navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
      .then(async (reg) => {
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub && Notification.permission === 'granted') {
          const json = sub.toJSON();
          await subscribePush({ endpoint: json.endpoint ?? sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } });
          setState('enabled');
        } else setState('idle');
      })
      .catch(() => setState('idle'));
  }, []);
  const enable = async () => {
    setNote(null);
    setState('working');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'idle');
        setNote(perm === 'denied' ? 'Notifications are blocked in your browser settings.' : 'Permission was dismissed.');
        return;
      }
      await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL });
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await getPushConfig();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64urlToUint8Array(publicKey) });
      }
      const json = sub.toJSON();
      await subscribePush({ endpoint: json.endpoint ?? sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } });
      setState('enabled');
    } catch (e) {
      setState('idle');
      setNote(`Could not enable notifications: ${errMsg(e, 'unknown error')}`);
    }
  };
  return { state, note, enable };
}

async function unsubscribeDevice() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) await sub.unsubscribe();
  } catch { /* best effort */ }
}

function Bellbox() {
  const qc = useQueryClient();
  const { data, isLoading } = useListNotifications({ query: { refetchInterval: POLL, queryKey: getListNotificationsQueryKey() } });
  const mark = useMarkNotificationsRead({
    mutation: { onSuccess: () => qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() }) },
  });
  const push = usePush();
  const unread = data?.filter((n) => !n.read).length ?? 0;
  const pushLabel: Record<PushState, string> = {
    checking: 'Checking…', unsupported: 'Not supported on this browser', denied: 'Blocked in browser settings',
    idle: 'Enable notifications', working: 'Enabling…', enabled: 'Notifications on',
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button data-testid="button-notifications" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-card ring-1 ring-border transition hover:bg-muted" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span key={unread} className="pop absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground tabular" data-testid="text-unread-count">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,360px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="font-display font-semibold">Completions</span>
          <button
            disabled={unread === 0 || mark.isPending}
            onClick={() => mark.mutate()}
            data-testid="button-mark-all-read"
            className="text-xs font-medium text-primary disabled:text-muted-foreground"
          >Mark all read</button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {isLoading && <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />)}</div>}
          {!isLoading && (data?.length ?? 0) === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing yet. Check-offs from your team land here.</p>}
          {data?.slice(0, 12).map((n) => (
            <div key={n.id} className={cn('flex gap-3 px-4 py-3 text-sm', !n.read && 'bg-accent/10')}>
              <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-accent')} />
              <div className="min-w-0">
                <p className="leading-snug">{n.message}</p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{relTime(n.createdAt)} · {istStamp(n.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t p-3">
          <Link href="/activity" className="block rounded-lg px-2 py-1.5 text-center text-sm font-medium text-primary hover:bg-muted" data-testid="link-all-activity">See full history</Link>
          <button
            onClick={push.enable}
            disabled={push.state !== 'idle'}
            data-testid="button-enable-notifications"
            className={cn('flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
              push.state === 'enabled' ? 'bg-[hsl(var(--done-soft))] text-[hsl(var(--done))]' : push.state === 'idle' ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground')}
          >
            {push.state === 'enabled' ? <Check className="h-4 w-4" /> : <BellRing className="h-4 w-4" />}
            {pushLabel[push.state]}
          </button>
          {push.note && <p className="text-center text-xs text-muted-foreground" data-testid="text-push-note">{push.note}</p>}
          {push.state === 'denied' && !push.note && <p className="text-center text-xs text-muted-foreground">Allow notifications for this site in your browser to turn them on.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function Shell({ user, children }: { user: User; children: ReactNode }) {
  const [loc, setLoc] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const logout = useLogout({
    mutation: {
      onSettled: () => { qc.clear(); setLoc('/'); },
      onError: (e) => toast({ title: 'Signed out locally', description: errMsg(e) }),
    },
  });
  const nav = user.role === 'admin'
    ? [{ href: '/dashboard', label: 'Today', icon: LayoutGrid }, { href: '/team', label: 'Team', icon: Users }, { href: '/activity', label: 'Activity', icon: History }]
    : [{ href: '/my-tasks', label: 'My day', icon: CalendarCheck }];
  return (
    <div className="min-h-[100dvh] pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link href={nav[0].href} data-testid="link-home"><Logo /></Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} data-testid={`link-nav-${n.label.toLowerCase().replace(' ', '-')}`}
                className={cn('flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition',
                  loc === n.href ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <n.icon className="h-4 w-4" />{n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LiveDot />
            {user.role === 'admin' && <Bellbox />}
            <div className="flex items-center gap-2 rounded-full bg-card py-1 pl-1 pr-1 ring-1 ring-border sm:pr-3">
              <Avatar name={user.name} color={user.color} size={28} />
              <span className="hidden text-sm font-medium sm:inline" data-testid="text-current-user">{user.name}</span>
            </div>
            <button onClick={async () => { await unsubscribeDevice(); logout.mutate(); }} disabled={logout.isPending} data-testid="button-logout" aria-label="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:py-8">{children}</main>
      {nav.length > 1 && (
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} data-testid={`link-mobile-${n.label.toLowerCase()}`}
              className={cn('flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium', loc === n.href ? 'text-primary' : 'text-muted-foreground')}>
              <n.icon className="h-5 w-5" />{n.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
