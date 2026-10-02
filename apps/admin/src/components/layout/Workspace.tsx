import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import {
  batchSchema,
  type AuthResponse,
  type Batch,
} from '@qrgenerator/contracts';
import { useAuthenticatedRequest } from '../../hooks/use-authenticated-request';
import { apiRequest, failureMessage } from '../../lib/api';
import type { WorkspaceView } from '../../types/navigation';
import { PageLoading } from '../ui/LoadingView';
import { Sidebar } from './Sidebar';

const BatchCataloguePage = lazy(() => import('../../pages/BatchCataloguePage'));
const CreateBatchPage = lazy(() => import('../../pages/CreateBatchPage'));
const CodeStudioPage = lazy(() => import('../../pages/CodeStudioPage'));
const SuperAdminPage = lazy(() => import('../../pages/SuperAdminPage'));

export default function Workspace({
  session,
  setSession,
}: {
  session: AuthResponse;
  setSession: (value: AuthResponse | null) => void;
}) {
  const [view, setView] = useState<WorkspaceView>('batches');
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Batch>();
  const [error, setError] = useState('');
  const authenticated = useAuthenticatedRequest(session, setSession);
  const canCreate = session.user.role === 'tenant_admin';

  const loadBatches = useCallback(async () => {
    const response = await authenticated('/batches');
    if (!response.ok) throw new Error(await failureMessage(response));
    const body = (await response.json()) as { batches: unknown[] };
    setBatches(body.batches.map((batch) => batchSchema.parse(batch)));
  }, [authenticated]);

  useEffect(() => {
    void loadBatches().catch((caught: unknown) =>
      setError(
        caught instanceof Error ? caught.message : 'Could not load batches',
      ),
    );
  }, [loadBatches]);

  function openGenerator(batch: Batch) {
    setSelected(batch);
    setView('generate');
  }

  async function logout() {
    await apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null);
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={session.user}
        view={view}
        hasSelectedBatch={Boolean(selected)}
        onNavigate={setView}
        onLogout={() => void logout()}
      />
      <main className="content">
        {error && <p className="error global-error">{error}</p>}
        <Suspense fallback={<PageLoading />}>
          {view === 'batches' && (
            <BatchCataloguePage
              batches={batches}
              canGenerate={canCreate}
              onCreate={() => setView('create')}
              onGenerate={openGenerator}
            />
          )}
          {view === 'create' && canCreate && (
            <CreateBatchPage
              authenticated={authenticated}
              onCreated={(batch) => {
                setBatches((current) => [batch, ...current]);
                openGenerator(batch);
              }}
            />
          )}
          {view === 'generate' && selected && canCreate && (
            <CodeStudioPage batch={selected} authenticated={authenticated} />
          )}
          {view === 'admin' && session.user.role === 'super_admin' && (
            <SuperAdminPage authenticated={authenticated} />
          )}
        </Suspense>
      </main>
    </div>
  );
}
