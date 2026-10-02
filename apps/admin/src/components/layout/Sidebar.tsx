import type { User } from '@qrgenerator/contracts';
import type { WorkspaceView } from '../../types/navigation';

interface SidebarProps {
  user: User;
  view: WorkspaceView;
  hasSelectedBatch: boolean;
  onNavigate: (view: WorkspaceView) => void;
  onLogout: () => void;
}

export function Sidebar({
  user,
  view,
  hasSelectedBatch,
  onNavigate,
  onLogout,
}: SidebarProps) {
  const canCreate = user.role === 'tenant_admin';
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark">M</span>
        <div>
          <strong>MedTrace</strong>
          <small>Registry Console</small>
        </div>
      </div>
      <nav aria-label="Workspace navigation">
        <NavButton
          active={view === 'batches'}
          icon="◫"
          onClick={() => onNavigate('batches')}
        >
          Batch catalogue
        </NavButton>
        {canCreate && (
          <NavButton
            active={view === 'create'}
            icon="＋"
            onClick={() => onNavigate('create')}
          >
            Create batch
          </NavButton>
        )}
        {hasSelectedBatch && canCreate && (
          <NavButton
            active={view === 'generate'}
            icon="⌁"
            onClick={() => onNavigate('generate')}
          >
            Code studio
          </NavButton>
        )}
        {user.role === 'super_admin' && (
          <NavButton
            active={view === 'admin'}
            icon="◇"
            onClick={() => onNavigate('admin')}
          >
            Tenant control
          </NavButton>
        )}
      </nav>
      <div className="sidebar-user">
        <div className="avatar">{user.email[0]?.toUpperCase()}</div>
        <div>
          <strong>{user.email}</strong>
          <small>
            {user.tenantName ?? 'Global administration'} ·{' '}
            {user.role.replace('_', ' ')}
          </small>
        </div>
        <button aria-label="Sign out" onClick={onLogout}>
          ↗
        </button>
      </div>
    </aside>
  );
}

function NavButton({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button className={active ? 'active' : ''} onClick={onClick}>
      <span>{icon}</span>
      {children}
    </button>
  );
}
