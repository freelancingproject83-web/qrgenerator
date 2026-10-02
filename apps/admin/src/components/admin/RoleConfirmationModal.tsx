import type { User } from '@qrgenerator/contracts';

interface RoleConfirmationModalProps {
  user: User;
  role: User['role'];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RoleConfirmationModal({
  user,
  role,
  busy,
  onCancel,
  onConfirm,
}: RoleConfirmationModalProps) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onCancel();
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
        <h2 id="role-confirm-title">Make this user {roleLabel(role)}?</h2>
        <p>
          <strong>{user.email}</strong> will become{' '}
          <strong>{roleLabel(role)}</strong>
          {role === 'super_admin'
            ? ' with access to every tenant and user.'
            : role === 'tenant_admin'
              ? ` for ${user.tenantName ?? 'their tenant'}, with permission to create batches and issue codes.`
              : ' with read-only access to their tenant batches.'}
        </p>
        <div className="modal-summary">
          <span>Current role</span>
          <strong>{roleLabel(user.role)}</strong>
          <span>New role</span>
          <strong>{roleLabel(role)}</strong>
        </div>
        <div className="modal-actions">
          <button className="soft" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={
              role === 'super_admin' ? 'primary danger-action' : 'primary'
            }
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Updating role…' : `Yes, make ${roleLabel(role)}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function roleLabel(role: User['role']) {
  return role.replace('_', ' ');
}
