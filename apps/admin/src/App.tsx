import { lazy, Suspense, useEffect, useState } from 'react';
import type { AuthResponse } from '@qrgenerator/contracts';
import { AppLoading } from './components/ui/LoadingView';
import { restoreSession } from './lib/api';

const AuthPage = lazy(() => import('./pages/AuthPage'));
const Workspace = lazy(() => import('./components/layout/Workspace'));

export function App() {
  const [session, setSession] = useState<AuthResponse | null | undefined>();

  useEffect(() => {
    void restoreSession().then(setSession);
  }, []);

  if (session === undefined) return <AppLoading />;

  return (
    <Suspense fallback={<AppLoading />}>
      {session ? (
        <Workspace session={session} setSession={setSession} />
      ) : (
        <AuthPage onAuthenticated={setSession} />
      )}
    </Suspense>
  );
}
