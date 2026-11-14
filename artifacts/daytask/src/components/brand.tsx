import { cn } from '@/lib/utils';
import { initials } from '@/lib/daytask';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2 sm:gap-3', className)}>
      <svg viewBox="60 130 470 135" className="h-9 w-28 rounded-md bg-black sm:h-11 sm:w-40" role="img" aria-label="Megatronics">
        <title>Megatronics</title>
        <image href={`${import.meta.env.BASE_URL}megatronics-logo.png`} width="612" height="408" />
      </svg>
      <span className="font-display text-sm font-bold sm:text-lg">Day Task</span>
    </div>
  );
}

export function Avatar({ name, color, size = 36, className }: { name: string; color?: string; size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-2 ring-card', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: color || 'hsl(var(--primary))' }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Ring({ value, total, size = 56, stroke = 6, children }: { value: number; total: number; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total ? value / total : 0;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={pct >= 1 ? 'hsl(var(--done))' : 'hsl(var(--accent))'}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset .7s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rise flex flex-col items-center rounded-2xl border border-dashed bg-card/60 px-6 py-12 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/20 text-primary">{icon}</div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
      <p className="font-medium text-destructive">{message}</p>
      <button onClick={onRetry} data-testid="button-retry" className="mt-3 rounded-lg bg-card px-4 py-2 text-sm font-medium shadow-sm ring-1 ring-border hover:bg-muted">
        Try again
      </button>
    </div>
  );
}
