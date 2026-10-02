import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  tenantSchema,
  userSchema,
  type Tenant,
  type User,
} from '@qrgenerator/contracts';
import { RoleConfirmationModal } from '../components/admin/RoleConfirmationModal';
import { Field } from '../components/ui/Field';
import { PageHead } from '../components/ui/PageHead';
import { failureMessage, type AuthenticatedRequest } from '../lib/api';

export default function SuperAdminPage({
  authenticated,
}: {
  authenticated: AuthenticatedRequest;
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

  const load = useCallback(async () => {
    const [tenantResponse, userResponse] = await Promise.all([
      authenticated('/tenants'),
      authenticated('/admin/users'),
    ]);
    if (!tenantResponse.ok)
      throw new Error(await failureMessage(tenantResponse));
    if (!userResponse.ok) throw new Error(await failureMessage(userResponse));

    const tenantBody = (await tenantResponse.json()) as { tenants: unknown[] };
    const userBody = (await userResponse.json()) as { users: unknown[] };
    setTenants(tenantBody.tenants.map((item) => tenantSchema.parse(item)));
    setUsers(userBody.users.map((item) => userSchema.parse(item)));
  }, [authenticated]);

  useEffect(() => {
    void load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Could not load'),
    );
  }, [load]);

  async function createTenant(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const response = await authenticated('/admin/tenants', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await failureMessage(response));
      setName('');
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not create tenant',
      );
    }
  }

  async function changeRole(userId: string, nextRole: User['role']) {
    setRoleBusy(true);
    setError('');
    try {
      const response = await authenticated(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) throw new Error(await failureMessage(response));
      await load();
      setPendingRole(undefined);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Could not update role',
      );
    } finally {
      setRoleBusy(false);
    }
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
        <RoleConfirmationModal
          user={pendingRole.user}
          role={pendingRole.role}
          busy={roleBusy}
          onCancel={() => setPendingRole(undefined)}
          onConfirm={() =>
            void changeRole(pendingRole.user.id, pendingRole.role)
          }
        />
      )}
    </>
  );
}
