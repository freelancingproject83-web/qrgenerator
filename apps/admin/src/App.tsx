import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  authResponseSchema,
  codeJobResponseSchema,
  codePreviewResponseSchema,
  codeUnitResponseSchema,
  type AuthResponse,
  type CodeJobResponse,
  type CodePrintOptions,
  type CodePreviewResponse,
} from '@qrgenerator/contracts';

const apiBase = (
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000'
).replace(/\/$/, '');

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${apiBase}/api/v1${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
}

async function failureMessage(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: { message?: string; details?: { message?: string }[] };
    };
    return (
      body.error?.details?.[0]?.message ??
      body.error?.message ??
      `Request failed (${response.status})`
    );
  } catch {
    return `Request failed (${response.status})`;
  }
}

let sessionRestore: Promise<AuthResponse | null> | undefined;

function restoreSession() {
  sessionRestore ??= request('/auth/refresh', { method: 'POST' })
    .then(async (response) =>
      response.ok ? authResponseSchema.parse(await response.json()) : null,
    )
    .catch(() => null);
  return sessionRestore;
}

export function App() {
  const [session, setSession] = useState<AuthResponse | null | undefined>();
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let active = true;
    void restoreSession().then((restored) => {
      if (active) setSession(restored);
    });
    return () => {
      active = false;
    };
  }, []);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      const response = await request(`/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(await failureMessage(response));
      setSession(authResponseSchema.parse(await response.json()));
      setPassword('');
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : 'Authentication failed',
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    await request('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null);
  }

  if (session === undefined) {
    return (
      <main className="page centered">
        <span className="eyebrow">QR Generator</span>
        <h1>Restoring your session…</h1>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="page auth-page">
        <section className="hero">
          <span className="eyebrow">Secure identifier workspace</span>
          <h1>Issue codes that lead back to your registry.</h1>
          <p>
            Generate digitally verified QR or Data Matrix artwork, download it
            at print size, and revoke an identifier when necessary.
          </p>
        </section>
        <form className="panel auth-card" onSubmit={authenticate}>
          <div className="tabs" role="tablist" aria-label="Account action">
            <button
              className={authMode === 'login' ? 'active' : ''}
              type="button"
              onClick={() => setAuthMode('login')}
            >
              Sign in
            </button>
            <button
              className={authMode === 'register' ? 'active' : ''}
              type="button"
              onClick={() => setAuthMode('register')}
            >
              Create account
            </button>
          </div>
          <label>
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={8}
              maxLength={128}
              type="password"
              autoComplete={
                authMode === 'login' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {authError && (
            <p className="error" role="alert">
              {authError}
            </p>
          )}
          <button className="primary" disabled={authBusy} type="submit">
            {authBusy
              ? 'Please wait…'
              : authMode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <Generator session={session} setSession={setSession} logout={logout} />
  );
}

function Generator({
  session,
  setSession,
  logout,
}: {
  session: AuthResponse;
  setSession: (session: AuthResponse | null) => void;
  logout: () => Promise<void>;
}) {
  const [format, setFormat] = useState<'qr' | 'data_matrix'>('qr');
  const [quantity, setQuantity] = useState(1);
  const [reference, setReference] = useState('');
  const [moduleSizeMm, setModuleSizeMm] = useState(0.25);
  const [printerDpi, setPrinterDpi] = useState(600);
  const [errorCorrection, setErrorCorrection] = useState<'M' | 'Q' | 'H'>('M');
  const [preview, setPreview] = useState<CodePreviewResponse>();
  const [job, setJob] = useState<CodeJobResponse>();
  const [busy, setBusy] = useState<'preview' | 'issue' | string>();
  const [error, setError] = useState('');
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const print = useMemo<CodePrintOptions>(
    () =>
      format === 'qr'
        ? {
            format,
            moduleSizeMm,
            printerDpi,
            printMode: 'standard',
            errorCorrection,
          }
        : { format, moduleSizeMm, printerDpi, printMode: 'standard' },
    [errorCorrection, format, moduleSizeMm, printerDpi],
  );

  async function authenticated(path: string, init: RequestInit = {}) {
    const send = (accessToken: string) =>
      request(path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
      });
    let response = await send(session.accessToken);
    if (response.status !== 401) return response;

    const refresh = await request('/auth/refresh', { method: 'POST' });
    if (!refresh.ok) {
      setSession(null);
      return response;
    }
    const next = authResponseSchema.parse(await refresh.json());
    setSession(next);
    response = await send(next.accessToken);
    return response;
  }

  async function run(action: 'preview' | 'issue') {
    setBusy(action);
    setError('');
    try {
      const response = await authenticated(
        action === 'preview' ? '/code-jobs/preview' : '/code-jobs',
        {
          method: 'POST',
          headers:
            action === 'issue'
              ? { 'Idempotency-Key': crypto.randomUUID() }
              : {},
          body: JSON.stringify(
            action === 'preview'
              ? print
              : {
                  quantity,
                  ...(reference.trim() ? { reference: reference.trim() } : {}),
                  print,
                },
          ),
        },
      );
      if (!response.ok) throw new Error(await failureMessage(response));
      if (action === 'preview') {
        setPreview(codePreviewResponseSchema.parse(await response.json()));
      } else {
        setJob(codeJobResponseSchema.parse(await response.json()));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Request failed');
    } finally {
      setBusy(undefined);
    }
  }

  async function download(id: string, format: 'svg' | 'pdf') {
    setBusy(`${id}-${format}`);
    setError('');
    try {
      const response = await authenticated(`/codes/${id}/artwork.${format}`);
      if (!response.ok) throw new Error(await failureMessage(response));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `unit-${id}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Download failed');
    } finally {
      setBusy(undefined);
    }
  }

  async function revoke(id: string) {
    const reason = reasons[id]?.trim();
    if (!reason) return setError('Enter a revocation reason first.');
    setBusy(`${id}-revoke`);
    setError('');
    try {
      const response = await authenticated(`/codes/${id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error(await failureMessage(response));
      const body = (await response.json()) as { code: unknown };
      const updated = codeUnitResponseSchema.parse(body.code);
      setJob((current) =>
        current
          ? {
              ...current,
              codes: current.codes.map((code) =>
                code.id === id ? updated : code,
              ),
            }
          : current,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Revocation failed');
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <div>
          <span className="eyebrow">QR Generator</span>
          <strong>{session.user.email}</strong>
        </div>
        <button
          className="secondary"
          onClick={() => void logout()}
          type="button"
        >
          Sign out
        </button>
      </header>

      <section className="intro">
        <div>
          <h1>Issue a batch of identifiers.</h1>
          <p>
            Preview sizing first, then issue unique registry-backed codes. A
            digital decode is verified before any identifier is saved.
          </p>
        </div>
        <span className="safety">Physical print qualification required</span>
      </section>

      <div className="work-grid">
        <form
          className="panel controls"
          onSubmit={(event) => event.preventDefault()}
        >
          <h2>Artwork settings</h2>
          <div className="field-grid">
            <label>
              Format
              <select
                value={format}
                onChange={(event) =>
                  setFormat(event.target.value as typeof format)
                }
              >
                <option value="qr">QR code</option>
                <option value="data_matrix">Data Matrix</option>
              </select>
            </label>
            {format === 'qr' && (
              <label>
                Error correction
                <select
                  value={errorCorrection}
                  onChange={(event) =>
                    setErrorCorrection(
                      event.target.value as typeof errorCorrection,
                    )
                  }
                >
                  <option value="M">M · about 15% damage recovery</option>
                  <option value="Q">Q · about 25% damage recovery</option>
                  <option value="H">H · about 30% damage recovery</option>
                </select>
                <span className="field-help">
                  {errorCorrection === 'M' &&
                    'M makes the smallest QR and is the normal default.'}
                  {errorCorrection === 'Q' &&
                    'Q is more resistant to scratches and missing print, but makes a larger QR.'}
                  {errorCorrection === 'H' &&
                    'H gives the most recovery, but produces the largest and densest QR.'}
                </span>
              </label>
            )}
            <label>
              Module size (mm)
              <input
                required
                type="number"
                min="0.125"
                max="1"
                step="0.025"
                value={moduleSizeMm}
                onChange={(event) =>
                  setModuleSizeMm(event.target.valueAsNumber)
                }
              />
              <span className="field-help">
                Allowed: 0.125–1.000 mm per module. The generator rounds upward
                to whole printer dots.
              </span>
            </label>
            <label>
              Printer DPI
              <input
                required
                type="number"
                min="200"
                max="2400"
                step="1"
                value={printerDpi}
                onChange={(event) => setPrinterDpi(event.target.valueAsNumber)}
              />
              <span className="field-help">
                Allowed: 200–2400 DPI. Standard mode keeps at least four printer
                dots per module.
              </span>
            </label>
            <label>
              Quantity
              <input
                required
                type="number"
                min="1"
                max="50"
                value={quantity}
                onChange={(event) => setQuantity(event.target.valueAsNumber)}
              />
            </label>
            <label>
              Batch reference <small>Optional</small>
              <input
                maxLength={80}
                placeholder="LOT-2026-001"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </label>
          </div>
          <aside className="size-guide">
            <strong>How print size works</strong>
            <p>
              The module setting controls each black or white square—not the
              full code. The final width also includes every symbol module and
              the mandatory blank quiet zone. Use <b>Preview size</b> for the
              exact millimetre dimensions before issuing.
            </p>
          </aside>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <button
              className="secondary"
              disabled={Boolean(busy)}
              onClick={() => void run('preview')}
              type="button"
            >
              {busy === 'preview' ? 'Rendering…' : 'Preview size'}
            </button>
            <button
              className="primary"
              disabled={Boolean(busy)}
              onClick={() => void run('issue')}
              type="button"
            >
              {busy === 'issue'
                ? 'Issuing…'
                : `Issue ${quantity} code${quantity === 1 ? '' : 's'}`}
            </button>
          </div>
        </form>

        <section className="panel preview-panel">
          <h2>Size proof</h2>
          {preview ? (
            <>
              <div
                className="artwork"
                dangerouslySetInnerHTML={{ __html: preview.svg }}
              />
              <dl className="metrics">
                <div>
                  <dt>Print at 100% scale</dt>
                  <dd>
                    {preview.print.totalSizeMm} × {preview.print.totalSizeMm} mm
                  </dd>
                </div>
                <div>
                  <dt>Actual module</dt>
                  <dd>{preview.print.actualModuleSizeMm} mm</dd>
                </div>
                <div>
                  <dt>Quiet zone per side</dt>
                  <dd>{preview.print.quietZoneMmPerSide} mm</dd>
                </div>
                <div>
                  <dt>Printer grid</dt>
                  <dd>{preview.print.dotsPerModule} dots/module</dd>
                </div>
              </dl>
              <div
                className={`print-summary ${preview.print.totalSizeMm < 8 ? 'caution' : ''}`}
              >
                <strong>
                  Full artwork: {preview.print.totalSizeMm} ×{' '}
                  {preview.print.totalSizeMm} mm
                </strong>
                <p>
                  Print the SVG or PDF at 100% actual size. Disable fit-to-page,
                  scaling, and image smoothing.
                </p>
                {preview.print.totalSizeMm < 8 && (
                  <p>
                    This is below 8 mm. It passes digital decoding, but small
                    codes on reflective blister foil may fail on real phones.
                    Where space permits, start around 8–10 mm overall at 600 DPI
                    and qualify a physical sample.
                  </p>
                )}
              </div>
              <p className="notice">{preview.message}</p>
            </>
          ) : (
            <p className="empty">
              Choose settings and render an unissued size proof.
            </p>
          )}
        </section>
      </div>

      {job && (
        <section className="results">
          <div className="results-heading">
            <div>
              <span className="eyebrow">Issued batch</span>
              <h2>{job.reference ?? job.id}</h2>
            </div>
            <span>
              {job.codes.length} unique identifier
              {job.codes.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="code-list">
            {job.codes.map((code) => (
              <article className="code-card" key={code.id}>
                <div className="code-meta">
                  <strong>Unit {code.position}</strong>
                  <span className={`badge ${code.status}`}>{code.status}</span>
                </div>
                <a href={code.scanUrl} target="_blank" rel="noreferrer">
                  {code.scanUrl}
                </a>
                <div className="actions compact">
                  <button
                    className="secondary"
                    disabled={Boolean(busy) || code.status === 'revoked'}
                    onClick={() => void download(code.id, 'svg')}
                    type="button"
                  >
                    SVG
                  </button>
                  <button
                    className="secondary"
                    disabled={Boolean(busy) || code.status === 'revoked'}
                    onClick={() => void download(code.id, 'pdf')}
                    type="button"
                  >
                    PDF
                  </button>
                </div>
                {code.status === 'active' ? (
                  <div className="revoke-row">
                    <input
                      aria-label={`Revocation reason for unit ${code.position}`}
                      maxLength={300}
                      placeholder="Reason for revocation"
                      value={reasons[code.id] ?? ''}
                      onChange={(event) =>
                        setReasons((current) => ({
                          ...current,
                          [code.id]: event.target.value,
                        }))
                      }
                    />
                    <button
                      className="danger"
                      disabled={Boolean(busy)}
                      onClick={() => void revoke(code.id)}
                      type="button"
                    >
                      Revoke
                    </button>
                  </div>
                ) : (
                  <p className="notice">Revoked: {code.revokeReason}</p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
