import { useEffect, useState, type FormEvent } from 'react';
import {
  authResponseSchema,
  tenantSchema,
  type AuthResponse,
  type Tenant,
} from '@qrgenerator/contracts';
import { Field } from '../components/ui/Field';
import { apiRequest, failureMessage } from '../lib/api';

export default function AuthPage({
  onAuthenticated,
}: {
  onAuthenticated: (session: AuthResponse) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (mode !== 'register') return;
    void apiRequest('/tenants')
      .then(async (response) => {
        if (!response.ok) throw new Error(await failureMessage(response));
        return (await response.json()) as { tenants: unknown[] };
      })
      .then(({ tenants }) =>
        setTenants(tenants.map((tenant) => tenantSchema.parse(tenant))),
      )
      .catch((caught: unknown) =>
        setError(
          caught instanceof Error ? caught.message : 'Could not load tenants',
        ),
      );
  }, [mode]);

  async function authenticate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await apiRequest(`/auth/${mode}`, {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          ...(mode === 'register' ? { tenantId } : {}),
        }),
      });
      if (!response.ok) throw new Error(await failureMessage(response));
      onAuthenticated(authResponseSchema.parse(await response.json()));
      setPassword('');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Authentication failed',
      );
    } finally {
      setBusy(false);
    }
  }

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
            Create precise medicine records, issue print-ready identifiers, and
            keep every tenant’s catalogue safely separated.
          </p>
        </div>
        <div className="trust-row">
          <span>Tenant isolated</span>
          <span>Digitally verified</span>
          <span>Print ready</span>
        </div>
      </section>
      <form className="auth-card" onSubmit={authenticate}>
        <div className="tabs" role="tablist" aria-label="Authentication mode">
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
}
