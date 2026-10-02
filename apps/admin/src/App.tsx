import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  authResponseSchema,
  batchSchema,
  codeJobResponseSchema,
  codePreviewResponseSchema,
  tenantSchema,
  userSchema,
  type AuthResponse,
  type Batch,
  type CodeJobResponse,
  type CodePrintOptions,
  type CodePreviewResponse,
  type Tenant,
  type User,
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
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void restoreSession().then(setSession);
  }, []);

  useEffect(() => {
    if (session !== null) return;
    void request('/tenants')
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { tenants: unknown[] })
          : { tenants: [] },
      )
      .then(({ tenants }) =>
        setTenants(tenants.map((tenant) => tenantSchema.parse(tenant))),
      );
  }, [mode, session]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await request(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          ...(mode === 'register' ? { tenantId } : {}),
        }),
      });
      if (!response.ok) throw new Error(await failureMessage(response));
      setSession(authResponseSchema.parse(await response.json()));
      setPassword('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Authentication failed',
      );
    } finally {
      setBusy(false);
    }
  }

  if (session === undefined)
    return (
      <main className="loading">
        <span className="brand-mark">M</span>
        <p>Preparing your workspace…</p>
      </main>
    );
  if (!session)
    return (
      <main className="auth-shell">
        <section className="auth-story">
          <span className="brand">MedTrace Registry</span>
          <div>
            <span className="eyebrow">
              Medicine identity, beautifully controlled
            </span>
            <h1>From batch record to verified scan.</h1>
            <p>
              Create precise medicine records, issue print-ready identifiers,
              and keep every tenant’s catalogue safely separated.
            </p>
          </div>
          <div className="trust-row">
            <span>Tenant isolated</span>
            <span>Digitally verified</span>
            <span>Print ready</span>
          </div>
        </section>
        <form className="auth-card" onSubmit={authenticate}>
          <div className="tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Create account
            </button>
          </div>
          <div>
            <span className="eyebrow">Welcome</span>
            <h2>
              {mode === 'login'
                ? 'Sign in to continue'
                : 'Join your tenant workspace'}
            </h2>
          </div>
          <Field label="Email address">
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
            />
          </Field>
          <Field label="Password">
            <input
              required
              minLength={8}
              maxLength={128}
              type="password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
            />
          </Field>
          {mode === 'register' && (
            <Field label="Tenant">
              <select
                required
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
              >
                <option value="">Select your organisation</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
              <small>New accounts always start as tenant users.</small>
            </Field>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary wide"
            disabled={busy || (mode === 'register' && !tenantId)}
          >
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Enter workspace'
                : 'Create account'}
          </button>
        </form>
      </main>
    );
  return <Workspace session={session} setSession={setSession} />;
}

function Workspace({
  session,
  setSession,
}: {
  session: AuthResponse;
  setSession: (value: AuthResponse | null) => void;
}) {
  const [view, setView] = useState<'batches' | 'create' | 'generate' | 'admin'>(
    'batches',
  );
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Batch>();
  const [error, setError] = useState('');
  async function authenticated(path: string, init: RequestInit = {}) {
    const send = (token: string) =>
      request(path, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
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
  async function loadBatches() {
    const response = await authenticated('/batches');
    if (!response.ok) throw new Error(await failureMessage(response));
    setBatches(
      ((await response.json()) as { batches: unknown[] }).batches.map((batch) =>
        batchSchema.parse(batch),
      ),
    );
  }
  useEffect(() => {
    void loadBatches().catch((caught) =>
      setError(
        caught instanceof Error ? caught.message : 'Could not load batches',
      ),
    );
  }, []);
  function openGenerator(batch: Batch) {
    setSelected(batch);
    setView('generate');
  }
  async function logout() {
    await request('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null);
  }
  const canCreate = session.user.role === 'tenant_admin';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark">M</span>
          <div>
            <strong>MedTrace</strong>
            <small>Registry Console</small>
          </div>
        </div>
        <nav>
          <button
            className={view === 'batches' ? 'active' : ''}
            onClick={() => setView('batches')}
          >
            <span>◫</span>Batch catalogue
          </button>
          {canCreate && (
            <button
              className={view === 'create' ? 'active' : ''}
              onClick={() => setView('create')}
            >
              <span>＋</span>Create batch
            </button>
          )}
          {selected && canCreate && (
            <button
              className={view === 'generate' ? 'active' : ''}
              onClick={() => setView('generate')}
            >
              <span>⌁</span>Code studio
            </button>
          )}
          {session.user.role === 'super_admin' && (
            <button
              className={view === 'admin' ? 'active' : ''}
              onClick={() => setView('admin')}
            >
              <span>◇</span>Tenant control
            </button>
          )}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">{session.user.email[0]?.toUpperCase()}</div>
          <div>
            <strong>{session.user.email}</strong>
            <small>
              {session.user.tenantName ?? 'Global administration'} ·{' '}
              {session.user.role.replace('_', ' ')}
            </small>
          </div>
          <button aria-label="Sign out" onClick={() => void logout()}>
            ↗
          </button>
        </div>
      </aside>
      <main className="content">
        {error && <p className="error global-error">{error}</p>}
        {view === 'batches' && (
          <BatchCatalogue
            batches={batches}
            canGenerate={canCreate}
            onCreate={() => setView('create')}
            onGenerate={openGenerator}
          />
        )}
        {view === 'create' && canCreate && (
          <BatchForm
            authenticated={authenticated}
            onCreated={(batch) => {
              setBatches((current) => [batch, ...current]);
              openGenerator(batch);
            }}
          />
        )}
        {view === 'generate' && selected && canCreate && (
          <CodeStudio batch={selected} authenticated={authenticated} />
        )}
        {view === 'admin' && session.user.role === 'super_admin' && (
          <SuperAdmin authenticated={authenticated} />
        )}
      </main>
    </div>
  );
}

function BatchCatalogue({
  batches,
  canGenerate,
  onCreate,
  onGenerate,
}: {
  batches: Batch[];
  canGenerate: boolean;
  onCreate: () => void;
  onGenerate: (batch: Batch) => void;
}) {
  return (
    <>
      <PageHead
        eyebrow="Batch registry"
        title="Medicine catalogue"
        description="Every identifier begins with a complete, tenant-owned medicine batch record."
        action={
          canGenerate ? (
            <button className="primary" onClick={onCreate}>
              ＋ New medicine batch
            </button>
          ) : undefined
        }
      />
      <section className="stat-grid">
        <Stat label="Total batches" value={batches.length} />
        <Stat
          label="Issued identifiers"
          value={batches.reduce((sum, batch) => sum + batch.codeCount, 0)}
        />
        <Stat
          label="Generation jobs"
          value={batches.reduce((sum, batch) => sum + batch.codeJobCount, 0)}
        />
      </section>
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>All batches</h2>
            <p>
              {canGenerate
                ? 'Select a record to generate identifiers.'
                : 'Read-only access for your tenant.'}
            </p>
          </div>
        </div>
        {batches.length ? (
          <div className="batch-grid">
            {batches.map((batch) => (
              <article className="batch-card" key={batch.batchNumber}>
                <div className="batch-card-top">
                  <span className="medicine-icon">Rx</span>
                  <span className="status-dot">Active</span>
                </div>
                <h3>{batch.medicineName}</h3>
                <p>{batch.medicineType}</p>
                <dl>
                  <div>
                    <dt>Batch number</dt>
                    <dd>{batch.batchNumber}</dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>
                      {new Date(
                        `${batch.expiryDate}T00:00:00`,
                      ).toLocaleDateString()}
                    </dd>
                  </div>
                  <div>
                    <dt>Codes</dt>
                    <dd>{batch.codeCount}</dd>
                  </div>
                  <div>
                    <dt>Tenant</dt>
                    <dd>{batch.tenantName}</dd>
                  </div>
                </dl>
                {canGenerate && (
                  <button
                    className="soft wide"
                    onClick={() => onGenerate(batch)}
                  >
                    Open code studio →
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <span>◇</span>
            <h3>No batches yet</h3>
            <p>
              {canGenerate
                ? 'Create the first medicine batch to unlock code generation.'
                : 'Your tenant administrator has not created a batch yet.'}
            </p>
          </div>
        )}
      </section>
    </>
  );
}

const listFields = [
  ['cautions', 'Cautions', 'Keep away from children'],
  ['variants', 'Available variants / strengths', 'Paracetamol 500 mg tablet'],
  ['usages', 'Usages', 'Temporary relief of fever'],
  [
    'dosages',
    'Dosage guidance',
    'Use only as directed by a qualified professional',
  ],
  ['eligibleUsers', 'Who can use it', 'Adults when medically appropriate'],
  ['sideEffects', 'Possible side effects', 'Nausea or allergic reaction'],
] as const;

function BatchForm({
  authenticated,
  onCreated,
}: {
  authenticated: (path: string, init?: RequestInit) => Promise<Response>;
  onCreated: (batch: Batch) => void;
}) {
  const [fields, setFields] = useState({
    medicineName: '',
    medicineType: '',
    manufactureDate: '',
    expiryDate: '',
    cautions: [''],
    variants: [''],
    usages: [''],
    dosages: [''],
    eligibleUsers: [''],
    sideEffects: [''],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...fields,
        ...Object.fromEntries(
          listFields.map(([key]) => [
            key,
            fields[key].map((value) => value.trim()).filter(Boolean),
          ]),
        ),
      };
      const response = await authenticated('/batches', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error(await failureMessage(response));
      onCreated(
        batchSchema.parse(
          ((await response.json()) as { batch: unknown }).batch,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not create batch',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHead
        eyebrow="Step 1 of 2"
        title="Create a medicine batch"
        description="Record the medicine profile first. A collision-proof batch number is assigned only after validation."
      />
      <form className="panel medicine-form" onSubmit={submit}>
        <div className="form-section">
          <div className="section-number">01</div>
          <div className="section-copy">
            <h2>Medicine identity</h2>
            <p>
              The name and type form a friendly slug; the generated batch number
              remains the only database identity.
            </p>
          </div>
          <div className="form-fields two">
            <Field label="Medicine name">
              <input
                required
                minLength={2}
                maxLength={160}
                value={fields.medicineName}
                onChange={(event) =>
                  setFields({ ...fields, medicineName: event.target.value })
                }
                placeholder="e.g. Calpol"
              />
            </Field>
            <Field label="Type of medicine">
              <input
                required
                minLength={2}
                maxLength={120}
                value={fields.medicineType}
                onChange={(event) =>
                  setFields({ ...fields, medicineType: event.target.value })
                }
                placeholder="e.g. Paracetamol tablet"
              />
            </Field>
          </div>
        </div>
        <div className="form-section">
          <div className="section-number">02</div>
          <div className="section-copy">
            <h2>Lifecycle dates</h2>
            <p>Expiry must be later than manufacture date.</p>
          </div>
          <div className="form-fields two">
            <Field label="Manufacture date">
              <input
                required
                type="date"
                value={fields.manufactureDate}
                onChange={(event) =>
                  setFields({ ...fields, manufactureDate: event.target.value })
                }
              />
            </Field>
            <Field label="Date of expiry">
              <input
                required
                type="date"
                min={fields.manufactureDate || undefined}
                value={fields.expiryDate}
                onChange={(event) =>
                  setFields({ ...fields, expiryDate: event.target.value })
                }
              />
            </Field>
          </div>
        </div>
        <div className="form-section">
          <div className="section-number">03</div>
          <div className="section-copy">
            <h2>Clinical information</h2>
            <p>
              Add one clear point per row. Every section requires at least one
              point.
            </p>
          </div>
          <div className="list-fields">
            {listFields.map(([key, label, placeholder]) => (
              <PointList
                key={key}
                label={label}
                placeholder={placeholder}
                values={fields[key]}
                onChange={(values) => setFields({ ...fields, [key]: values })}
              />
            ))}
          </div>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="form-footer">
          <p>
            The batch number is server generated and protected by a database
            primary key.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? 'Creating batch…' : 'Create batch & continue →'}
          </button>
        </div>
      </form>
    </>
  );
}

function PointList({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <fieldset className="point-list">
      <legend>{label}</legend>
      {values.map((value, index) => (
        <div className="point-row" key={index}>
          <span>{index + 1}</span>
          <input
            required
            value={value}
            maxLength={500}
            placeholder={placeholder}
            onChange={(event) =>
              onChange(
                values.map((item, itemIndex) =>
                  itemIndex === index ? event.target.value : item,
                ),
              )
            }
          />
          {values.length > 1 && (
            <button
              type="button"
              aria-label={`Remove ${label} point`}
              onClick={() =>
                onChange(values.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        className="add-point"
        type="button"
        onClick={() => onChange([...values, ''])}
      >
        ＋ Add another point
      </button>
    </fieldset>
  );
}

function CodeStudio({
  batch,
  authenticated,
}: {
  batch: Batch;
  authenticated: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [format, setFormat] = useState<'qr' | 'data_matrix'>('qr');
  const [quantity, setQuantity] = useState(1);
  const [moduleSizeMm, setModuleSizeMm] = useState(0.25);
  const [printerDpi, setPrinterDpi] = useState(600);
  const [errorCorrection, setErrorCorrection] = useState<'M' | 'Q' | 'H'>('M');
  const [preview, setPreview] = useState<CodePreviewResponse>();
  const [job, setJob] = useState<CodeJobResponse>();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
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
    [format, moduleSizeMm, printerDpi, errorCorrection],
  );
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
              ? { batchNumber: batch.batchNumber, print }
              : { quantity, batchNumber: batch.batchNumber, print },
          ),
        },
      );
      if (!response.ok) throw new Error(await failureMessage(response));
      if (action === 'preview')
        setPreview(codePreviewResponseSchema.parse(await response.json()));
      else setJob(codeJobResponseSchema.parse(await response.json()));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Generation failed');
    } finally {
      setBusy('');
    }
  }
  async function download(id: string, type: 'svg' | 'pdf') {
    setBusy(`${id}-${type}`);
    setError('');
    try {
      const response = await authenticated(`/codes/${id}/artwork.${type}`);
      if (!response.ok) throw new Error(await failureMessage(response));
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${batch.batchNumber}-${id}.${type}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Download failed');
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageHead
        eyebrow="Step 2 of 2 · Code studio"
        title={batch.medicineName}
        description={`${batch.batchNumber} · ${batch.medicineType}`}
      />
      <div className="studio-grid">
        <section className="panel">
          <h2>Identifier settings</h2>
          <div className="format-switch">
            <button
              className={format === 'qr' ? 'active' : ''}
              onClick={() => setFormat('qr')}
            >
              <strong>QR</strong>
              <small>Best native camera support</small>
            </button>
            <button
              className={format === 'data_matrix' ? 'active' : ''}
              onClick={() => setFormat('data_matrix')}
            >
              <strong>Data Matrix</strong>
              <small>Compact ECC200 symbol</small>
            </button>
          </div>
          <div className="form-fields two">
            <Field label="Quantity">
              <input
                type="number"
                min="1"
                max="50"
                value={quantity}
                onChange={(event) => setQuantity(event.target.valueAsNumber)}
              />
            </Field>
            <Field label="Printer DPI">
              <input
                type="number"
                min="200"
                max="2400"
                value={printerDpi}
                onChange={(event) => setPrinterDpi(event.target.valueAsNumber)}
              />
            </Field>
            <Field label="Module size (mm)">
              <input
                type="number"
                min="0.125"
                max="1"
                step="0.025"
                value={moduleSizeMm}
                onChange={(event) =>
                  setModuleSizeMm(event.target.valueAsNumber)
                }
              />
            </Field>
            {format === 'qr' && (
              <Field label="Error correction">
                <select
                  value={errorCorrection}
                  onChange={(event) =>
                    setErrorCorrection(
                      event.target.value as typeof errorCorrection,
                    )
                  }
                >
                  <option value="M">M · compact default</option>
                  <option value="Q">Q · stronger recovery</option>
                  <option value="H">H · maximum recovery</option>
                </select>
              </Field>
            )}
          </div>
          <div className="info-box">
            <strong>Exact printer geometry</strong>
            <p>
              Artwork is rounded up to whole printer dots and independently
              decoded before it can be issued.
            </p>
          </div>
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button
              className="soft"
              disabled={Boolean(busy)}
              onClick={() => void run('preview')}
            >
              {busy === 'preview' ? 'Rendering…' : 'Preview size'}
            </button>
            <button
              className="primary"
              disabled={Boolean(busy)}
              onClick={() => void run('issue')}
            >
              {busy === 'issue'
                ? 'Issuing…'
                : `Issue ${quantity} code${quantity === 1 ? '' : 's'}`}
            </button>
          </div>
        </section>
        <section className="panel preview">
          <h2>Print proof</h2>
          {preview ? (
            <>
              <div
                className="artwork"
                dangerouslySetInnerHTML={{ __html: preview.svg }}
              />
              <div className="proof-size">
                <span>Final artwork</span>
                <strong>
                  {preview.print.totalSizeMm} × {preview.print.totalSizeMm} mm
                </strong>
                <small>
                  {preview.print.dotsPerModule} dots/module ·{' '}
                  {preview.print.actualModuleSizeMm} mm module
                </small>
              </div>
            </>
          ) : (
            <div className="empty compact-empty">
              <span>⌁</span>
              <p>Preview the exact physical size before issuing.</p>
            </div>
          )}
        </section>
      </div>
      {job && (
        <section className="panel issued">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Issued successfully</span>
              <h2>{job.batchNumber}</h2>
            </div>
            <span>
              {job.codes.length} unique code{job.codes.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="issued-grid">
            {job.codes.map((code) => (
              <article key={code.id}>
                <div>
                  <strong>Unit {code.position}</strong>
                  <span className={`badge ${code.status}`}>{code.status}</span>
                </div>
                <a href={code.scanUrl} target="_blank" rel="noreferrer">
                  {code.scanUrl}
                </a>
                <div className="actions">
                  <button
                    className="soft"
                    disabled={Boolean(busy)}
                    onClick={() => void download(code.id, 'svg')}
                  >
                    SVG
                  </button>
                  <button
                    className="soft"
                    disabled={Boolean(busy)}
                    onClick={() => void download(code.id, 'pdf')}
                  >
                    PDF
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function SuperAdmin({
  authenticated,
}: {
  authenticated: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pendingRole, setPendingRole] = useState<{
    user: User;
    role: User['role'];
  }>();
  const [roleBusy, setRoleBusy] = useState(false);
  async function load() {
    const [tenantResponse, userResponse] = await Promise.all([
      authenticated('/tenants'),
      authenticated('/admin/users'),
    ]);
    if (!tenantResponse.ok || !userResponse.ok)
      throw new Error('Could not load tenant administration');
    setTenants(
      ((await tenantResponse.json()) as { tenants: unknown[] }).tenants.map(
        (item) => tenantSchema.parse(item),
      ),
    );
    setUsers(
      ((await userResponse.json()) as { users: unknown[] }).users.map((item) =>
        userSchema.parse(item),
      ),
    );
  }
  useEffect(() => {
    void load().catch((caught) =>
      setError(caught instanceof Error ? caught.message : 'Could not load'),
    );
  }, []);
  async function createTenant(event: FormEvent) {
    event.preventDefault();
    const response = await authenticated('/admin/tenants', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!response.ok) return setError(await failureMessage(response));
    setName('');
    await load();
  }
  async function role(userId: string, nextRole: User['role']) {
    setRoleBusy(true);
    setError('');
    const response = await authenticated(`/admin/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: nextRole }),
    });
    if (!response.ok) {
      setError(await failureMessage(response));
      setRoleBusy(false);
      return;
    }
    await load();
    setPendingRole(undefined);
    setRoleBusy(false);
  }
  return (
    <>
      <PageHead
        eyebrow="Super administration"
        title="Tenant control"
        description="Create tenant workspaces and control user authority across the registry."
      />
      {error && (
        <p className="error admin-error" role="alert">
          {error}
        </p>
      )}
      <div className="admin-grid">
        <form className="panel" onSubmit={createTenant}>
          <h2>Add tenant</h2>
          <Field label="Organisation name">
            <input
              required
              minLength={2}
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Tenant legal or trading name"
            />
          </Field>
          <button className="primary wide">Create tenant</button>
          <div className="tenant-pills">
            {tenants.map((tenant) => (
              <span key={tenant.id}>{tenant.name}</span>
            ))}
          </div>
        </form>
        <section className="panel">
          <h2>Users</h2>
          <div className="user-list">
            {users.map((user) => (
              <div key={user.id}>
                <div>
                  <strong>{user.email}</strong>
                  <small>
                    {user.tenantName ?? 'Global'} ·{' '}
                    {user.role.replace('_', ' ')}
                  </small>
                </div>
                {user.role !== 'super_admin' && (
                  <select
                    aria-label={`Role for ${user.email}`}
                    value={user.role}
                    onChange={(event) =>
                      setPendingRole({
                        user,
                        role: event.target.value as User['role'],
                      })
                    }
                  >
                    <option value="tenant_user">Tenant user</option>
                    <option value="tenant_admin">Tenant admin</option>
                    <option value="super_admin">Super admin</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
      {pendingRole && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !roleBusy)
              setPendingRole(undefined);
          }}
        >
          <section
            className="confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="role-confirm-title"
          >
            <div className="modal-icon">◇</div>
            <span className="eyebrow">Confirm role change</span>
            <h2 id="role-confirm-title">
              Make this user {roleLabel(pendingRole.role)}?
            </h2>
            <p>
              <strong>{pendingRole.user.email}</strong> will become{' '}
              <strong>{roleLabel(pendingRole.role)}</strong>
              {pendingRole.role === 'super_admin'
                ? ' with access to every tenant and user.'
                : pendingRole.role === 'tenant_admin'
                  ? ` for ${pendingRole.user.tenantName ?? 'their tenant'}, with permission to create batches and issue codes.`
                  : ' with read-only access to their tenant batches.'}
            </p>
            <div className="modal-summary">
              <span>Current role</span>
              <strong>{roleLabel(pendingRole.user.role)}</strong>
              <span>New role</span>
              <strong>{roleLabel(pendingRole.role)}</strong>
            </div>
            <div className="modal-actions">
              <button
                className="soft"
                disabled={roleBusy}
                onClick={() => setPendingRole(undefined)}
              >
                Cancel
              </button>
              <button
                className={
                  pendingRole.role === 'super_admin'
                    ? 'primary danger-action'
                    : 'primary'
                }
                disabled={roleBusy}
                onClick={() => void role(pendingRole.user.id, pendingRole.role)}
              >
                {roleBusy
                  ? 'Updating role…'
                  : `Yes, make ${roleLabel(pendingRole.role)}`}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function roleLabel(role: User['role']) {
  return role.replace('_', ' ');
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );
}
function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="stat">
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </article>
  );
}
