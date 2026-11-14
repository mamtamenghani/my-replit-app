import { useGetSheetStatus, useRetrySheetSync, getGetSheetStatusQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { errMsg, istStamp } from '@/lib/daytask';
import { useToast } from '@/hooks/use-toast';

export function SheetSyncStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const status = useGetSheetStatus({ query: { queryKey: getGetSheetStatusQueryKey(), refetchInterval: 5000 } });
  const retry = useRetrySheetSync({ mutation: {
    onSuccess: () => qc.invalidateQueries({ queryKey: getGetSheetStatusQueryKey() }),
    onError: e => toast({ title: 'Could not retry sync', description: errMsg(e), variant: 'destructive' }),
  } });
  const s = status.data;
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-3 text-xs" data-testid="sheet-sync-status">
    <span className="font-semibold">Google Sheets</span>
    <span className={status.isError || s?.error ? 'text-destructive' : 'text-muted-foreground'}>
      {status.isError ? 'Could not check sync status.' : s?.error ? `Sync needs attention: ${s.error}` : !s ? 'Checking sync…'
        : s.pending ? 'Syncing saved changes…' : `Up to date${s.lastSyncedAt ? ` · ${istStamp(s.lastSyncedAt)}` : ''}`}
    </span>
    {s?.url && <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-primary underline">Open sheet</a>}
    {(status.isError || s?.error) && <button disabled={retry.isPending} onClick={() => retry.mutate()} className="font-semibold text-primary underline">{retry.isPending ? 'Retrying…' : 'Retry sync'}</button>}
  </div>;
}
