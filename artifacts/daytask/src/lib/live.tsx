import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getListNotificationsQueryKey, type Notification } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { invalidateEverything, invalidateWork } from './daytask';

let audioCtx: AudioContext | null = null;
export function unlockAudio() {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch { /* audio unavailable */ }
}
export function chime() {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const t = audioCtx.currentTime;
  [880, 1318.5].forEach((f, i) => {
    const o = audioCtx!.createOscillator();
    const g = audioCtx!.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t + i * 0.09);
    g.gain.linearRampToValueAtTime(0.08, t + i * 0.09 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.6);
    o.connect(g).connect(audioCtx!.destination);
    o.start(t + i * 0.09);
    o.stop(t + i * 0.09 + 0.65);
  });
}

const LiveCtx = createContext<{ connected: boolean }>({ connected: false });
export const useLive = () => useContext(LiveCtx);

export function LiveProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const onGesture = () => unlockAudio();
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, []);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') { setConnected(false); return; }
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let everOpened = false;
    let disposed = false;
    const open = () => {
      es = new EventSource('/api/events', { withCredentials: true });
      es.onopen = () => {
        setConnected(true);
        if (everOpened) invalidateEverything(qc);
        everOpened = true;
      };
      es.onerror = () => {
        setConnected(false);
        if (es && es.readyState === EventSource.CLOSED && !disposed) {
          es.close();
          retry = setTimeout(open, 4000);
        }
      };
      es.addEventListener('refresh', () => invalidateWork(qc));
      es.addEventListener('completion', (ev) => {
        let n: Notification | null = null;
        try { n = JSON.parse((ev as MessageEvent).data); } catch { /* ignore */ }
        qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
        invalidateWork(qc);
        chime();
        toastRef.current({
          title: 'Task completed',
          description: n?.message ?? 'Your team completed a task.',
        });
      });
    };
    open();
    return () => {
      disposed = true;
      if (retry) clearTimeout(retry);
      es?.close();
      setConnected(false);
    };
  }, [enabled, qc]);

  return <LiveCtx.Provider value={{ connected }}>{children}</LiveCtx.Provider>;
}

export function base64urlToUint8Array(b64: string) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
