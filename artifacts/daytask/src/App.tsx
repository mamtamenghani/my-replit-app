import { useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useGetMe, type User } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import AuthPage from '@/pages/auth';
import Dashboard from '@/pages/dashboard';
import Team from '@/pages/team';
import Activity from '@/pages/activity';
import MisReport from '@/pages/mis-report';
import MyTasks from '@/pages/my-tasks';
import { Shell } from '@/components/shell';
import { Logo, ErrorState } from '@/components/brand';
import { LiveProvider } from '@/lib/live';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

function Splash() {
  return <div className="flex min-h-[100dvh] items-center justify-center"><div className="animate-pulse"><Logo /></div></div>;
}

function Redirect({ to }: { to: string }) {
  const [, setLoc] = useLocation();
  useEffect(() => { setLoc(to, { replace: true }); }, [to, setLoc]);
  return <Splash />;
}

function Protected({ role, children }: { role: User['role']; children: (u: User) => ReactNode }) {
  const me = useGetMe();
  if (me.isLoading) return <Splash />;
  if (me.isError) return <div className="mx-auto max-w-md px-6 py-24"><ErrorState message="Couldn't check your session." onRetry={() => me.refetch()} /></div>;
  const user = me.data?.user;
  if (!user) return <Redirect to="/" />;
  const allowed = role === 'admin' ? user.role !== 'employee' : user.role === role;
  if (!allowed) return <Redirect to={user.role !== 'employee' ? '/dashboard' : '/my-tasks'} />;
  return <Shell user={user}>{children(user)}</Shell>;
}

function Entry() {
  const me = useGetMe();
  if (me.isLoading) return <Splash />;
  const user = me.data?.user;
  if (user) return <Redirect to={user.role !== 'employee' ? '/dashboard' : '/my-tasks'} />;
  return <AuthPage />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Entry} />
        <Route path="/dashboard">{() => <Protected role="admin">{() => <Dashboard />}</Protected>}</Route>
        <Route path="/team">{() => <Protected role="admin">{() => <Team />}</Protected>}</Route>
        <Route path="/activity">{() => <Protected role="admin">{() => <Activity />}</Protected>}</Route>
        <Route path="/mis">{() => <Protected role="admin">{() => <MisReport />}</Protected>}</Route>
        <Route path="/my-tasks">{() => <Protected role="employee">{(u) => <MyTasks user={u} />}</Protected>}</Route>
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function LiveGate({ children }: { children: ReactNode }) {
  const me = useGetMe();
  return <LiveProvider enabled={!!me.data?.user}>{children}</LiveProvider>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LiveGate>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
        </LiveGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
