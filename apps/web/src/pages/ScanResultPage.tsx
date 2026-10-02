import { useEffect, useState } from 'react';
import { PublicHeader } from '../components/layout/PublicHeader';
import { InfoSection } from '../components/medicine/InfoSection';
import { fetchPublicCode, type PublicCode } from '../lib/public-api';

export default function ScanResultPage({ token }: { token: string }) {
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    code?: PublicCode;
  }>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    void fetchPublicCode(token, controller.signal)
      .then((code) => setState({ loading: false, code }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Verification unavailable',
          });
        }
      });
    return () => controller.abort();
  }, [token]);

  if (state.loading) return <ScanLoading />;
  if (!state.code) return <ScanError token={token} message={state.error} />;

  const { code } = state;
  const { batch } = code;
  const expired = batch.expiryDate < new Date().toISOString().slice(0, 10);
  return (
    <main className="scan-shell">
      <PublicHeader />
      <section className="medicine-hero">
        <div>
          <span className="eyebrow">Registered medicine record</span>
          <h1>{batch.medicineName}</h1>
          <p>{batch.medicineType}</p>
          <div className="hero-badges">
            <span className={code.status === 'active' ? 'verified' : 'revoked'}>
              {code.status === 'active'
                ? '✓ Registered identifier'
                : '× Revoked identifier'}
            </span>
            <span className={expired ? 'revoked' : ''}>
              {expired ? 'Expired batch' : 'Within recorded expiry'}
            </span>
          </div>
        </div>
        <div className="monogram">
          {batch.medicineName.slice(0, 2).toUpperCase()}
        </div>
      </section>
      <section className={`registry-note ${code.status}`}>
        <strong>
          {code.status === 'active'
            ? 'Registry match found'
            : 'Important: this code was revoked'}
        </strong>
        <p>{code.message}</p>
      </section>
      <section className="facts">
        <Fact label="Batch number" value={batch.batchNumber} />
        <Fact label="Manufactured" value={formatDate(batch.manufactureDate)} />
        <Fact label="Expires" value={formatDate(batch.expiryDate)} />
        <Fact label="Registered by" value={batch.tenantName} />
      </section>
      <div className="details-grid">
        <InfoSection title="Uses" items={batch.usages} />
        <InfoSection title="Dosage guidance" items={batch.dosages} />
        <InfoSection title="Who can use it" items={batch.eligibleUsers} />
        <InfoSection title="Available variants" items={batch.variants} />
        <InfoSection title="Cautions" items={batch.cautions} tone="warning" />
        <InfoSection
          title="Possible side effects"
          items={batch.sideEffects}
          tone="warning"
        />
      </div>
      <footer>
        <div>
          <strong>Identifier</strong>
          <code>{token}</code>
        </div>
        <p>This page displays information supplied by the registered tenant.</p>
      </footer>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScanLoading() {
  return (
    <main className="scan-shell">
      <div className="scan-loading" role="status">
        <span className="pulse" />
        <p>Retrieving medicine record…</p>
      </div>
    </main>
  );
}

function ScanError({
  token,
  message,
}: {
  token: string;
  message: string | undefined;
}) {
  return (
    <main className="scan-shell">
      <PublicHeader />
      <section className="error-card">
        <span>!</span>
        <h1>Record not found</h1>
        <p>{message}</p>
        <code>{token}</code>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
