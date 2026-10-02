import { useEffect, useState } from 'react';
import { publicCodeResponseSchema } from '@qrgenerator/contracts';

type PublicCode = ReturnType<typeof publicCodeResponseSchema.parse>['code'];

export function ScanPage({ token }: { token: string }) {
  const [state, setState] = useState<{
    loading: boolean;
    error?: string;
    code?: PublicCode;
  }>({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    const base = (
      import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'
    ).replace(/\/$/, '');
    fetch(`${base}/api/v1/public/codes/${encodeURIComponent(token)}`, {
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
      .then(async (response) => {
        if (response.status === 404)
          throw new Error(
            'This identifier is not registered. Please contact the medicine supplier.',
          );
        if (!response.ok)
          throw new Error(
            'The registry is temporarily unavailable. Please try again later.',
          );
        return publicCodeResponseSchema.parse(await response.json()).code;
      })
      .then((code) => setState({ loading: false, code }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setState({
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : 'Verification unavailable',
          });
      });
    return () => controller.abort();
  }, [token]);

  if (state.loading)
    return (
      <main className="scan-shell">
        <div className="scan-loading">
          <span className="pulse" />
          <p>Retrieving medicine record…</p>
        </div>
      </main>
    );
  if (!state.code)
    return (
      <main className="scan-shell">
        <header className="public-nav">
          <strong>MedTrace</strong>
          <span>Medicine registry</span>
        </header>
        <section className="error-card">
          <span>!</span>
          <h1>Record not found</h1>
          <p>{state.error}</p>
          <code>{token}</code>
        </section>
      </main>
    );

  const { code } = state;
  const { batch } = code;
  const expired = batch.expiryDate < new Date().toISOString().slice(0, 10);
  return (
    <main className="scan-shell">
      <header className="public-nav">
        <strong>MedTrace</strong>
        <span>Medicine registry</span>
      </header>
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
        <div>
          <span>Batch number</span>
          <strong>{batch.batchNumber}</strong>
        </div>
        <div>
          <span>Manufactured</span>
          <strong>{formatDate(batch.manufactureDate)}</strong>
        </div>
        <div>
          <span>Expires</span>
          <strong>{formatDate(batch.expiryDate)}</strong>
        </div>
        <div>
          <span>Registered by</span>
          <strong>{batch.tenantName}</strong>
        </div>
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

function InfoSection({
  title,
  items,
  tone = '',
}: {
  title: string;
  items: string[];
  tone?: string;
}) {
  return (
    <section className={`info-section ${tone}`}>
      <h2>{title}</h2>
      <ul>
        {items.map((item, index) => (
          <li key={`${item}-${index}`}>
            <span>{index + 1}</span>
            <p>{item}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
