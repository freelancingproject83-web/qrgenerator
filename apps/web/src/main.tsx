import React, { lazy, Suspense, type ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { codeTokenSchema } from '@qrgenerator/contracts';
import './styles.css';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const ScanResultPage = lazy(() => import('./pages/ScanResultPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function resolvePage(): ReactNode {
  const token = codeTokenSchema.safeParse(window.location.pathname.slice(1));
  if (token.success) return <ScanResultPage token={token.data} />;
  if (window.location.pathname === '/') return <LandingPage />;
  return <NotFoundPage />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <main className="scan-shell">
          <div className="scan-loading" role="status">
            <span className="pulse" />
            <p>Loading medicine registry…</p>
          </div>
        </main>
      }
    >
      {resolvePage()}
    </Suspense>
  </React.StrictMode>,
);
