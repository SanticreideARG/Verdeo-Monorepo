import { useCallback, useMemo, useEffect, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface UserRow {
  avatarUrl?: string | null;
  createdAt: string;
  displayName: string;
  id: string;
  roles: { displayName: string; key: string }[];
  status: string;
}

const UNASSIGNED_GROUP = 'Sin rol asignado';

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );
}

/**
 * Groups the directory by role, filtered by the search box.
 *
 * A user with several roles appears under each of them: the question this list answers is "who are
 * the repartidores", and hiding someone from that group because they are also an admin would be
 * the wrong answer. Users with no role at all get their own group rather than disappearing.
 */
function groupUsersByRole(users: readonly UserRow[], search: string): [string, UserRow[]][] {
  const needle = search.trim().toLocaleLowerCase('es-AR');
  const matching = needle
    ? users.filter((user) => user.displayName.toLocaleLowerCase('es-AR').includes(needle))
    : users;

  const groups = new Map<string, UserRow[]>();
  for (const user of matching) {
    const names =
      user.roles.length > 0 ? user.roles.map((role) => role.displayName) : [UNASSIGNED_GROUP];
    for (const name of names) {
      const bucket = groups.get(name);
      if (bucket) bucket.push(user);
      else groups.set(name, [user]);
    }
  }

  return [...groups.entries()].sort(([a], [b]) => {
    // "Sin rol asignado" last: it is a gap to fix, not a category to browse.
    if (a === UNASSIGNED_GROUP) return 1;
    if (b === UNASSIGNED_GROUP) return -1;
    return a.localeCompare(b, 'es-AR');
  });
}

interface RoleSummary {
  active: boolean;
  description: string | null;
  id: string;
  key: string;
  name: string;
}

interface PermissionCatalogEntry {
  description: string;
  group: string;
  id: string;
  key: string;
}

interface PermissionOverride {
  effect: 'allow' | 'deny';
  permissionId: string;
  permissionKey: string;
  reason: string | null;
}

interface UserDetail {
  avatarUrl: string | null;
  displayName: string;
  effectivePermissions: string[];
  email: string | null;
  id: string;
  overrides: PermissionOverride[];
  roles: RoleSummary[];
  status: string;
}

interface AccessTokenSummary {
  boundUserDisplayName: string | null;
  createdAt: string;
  createdByDisplayName: string | null;
  expiresAt: string;
  id: string;
  kind: 'repartidor_access' | 'user_invite';
  label: string;
  lastUsedAt: string | null;
  operatingSiteName: string | null;
  redeemedAt: string | null;
  revokedAt: string | null;
  roleKey: string | null;
  useCount: number;
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/** "Usuarios" (Administración): view, deactivate, and manage privileges — roles and individual
 * permission overrides — plus generating access tokens ("Acceder con token" on /login): a reusable
 * bearer credential bound to an existing repartidor, or a single-use invite that creates a new
 * user with a preset role. */
export function UsersAdminPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set());
  const [overrideEffects, setOverrideEffects] = useState<Map<string, 'allow' | 'deny' | 'none'>>(
    new Map(),
  );
  const [tokens, setTokens] = useState<AccessTokenSummary[]>([]);
  const [issuedToken, setIssuedToken] = useState<{ expiresAt: string; token: string } | null>(null);
  const [tokenKind, setTokenKind] = useState<'repartidor_access' | 'user_invite'>(
    'repartidor_access',
  );
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const canManage = profile?.permissions.includes('roles.manage') ?? false;
  const groupedUsers = useMemo(() => groupUsersByRole(users, search), [search, users]);
  const canOverride = profile?.permissions.includes('permissions.override') ?? false;
  const canDisable = profile?.permissions.includes('users.disable') ?? false;
  const canIssueTokens = profile?.permissions.includes('access_tokens.manage') ?? false;

  const loadUsers = useCallback(async () => {
    const response = await apiRequest('/api/v1/users?limit=100');
    if (response.ok) {
      setUsers(((await response.json()) as { items: UserRow[] }).items);
    }
  }, []);

  const loadTokens = useCallback(async () => {
    if (!canIssueTokens) return;
    const response = await apiRequest('/api/v1/access-tokens');
    if (response.ok) {
      setTokens(((await response.json()) as { items: AccessTokenSummary[] }).items);
    }
  }, [canIssueTokens]);

  useEffect(() => {
    if (!profile?.permissions.includes('users.read')) {
      setLoading(false);
      return;
    }
    void Promise.all([
      loadUsers(),
      apiRequest('/api/v1/roles').then(async (response) => {
        if (response.ok) setRoles(((await response.json()) as { items: RoleSummary[] }).items);
      }),
      apiRequest('/api/v1/permissions').then(async (response) => {
        if (response.ok) {
          setCatalog(((await response.json()) as { items: PermissionCatalogEntry[] }).items);
        }
      }),
      loadTokens(),
    ]).finally(() => setLoading(false));
  }, [loadTokens, loadUsers, profile]);

  const loadDetail = useCallback(async (userId: string) => {
    setMessage('');
    const response = await apiRequest(`/api/v1/users/${userId}`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const loaded = (await response.json()) as UserDetail;
    setDetail(loaded);
    setSelectedRoleIds(new Set(loaded.roles.map((role) => role.id)));
    setOverrideEffects(
      new Map(loaded.overrides.map((override) => [override.permissionId, override.effect])),
    );
  }, []);

  async function selectUser(userId: string) {
    setSelectedUserId(userId);
    await loadDetail(userId);
  }

  async function toggleStatus() {
    if (!detail) return;
    const response = await apiRequest(`/api/v1/users/${detail.id}/status`, {
      body: JSON.stringify({ active: detail.status !== 'active' }),
      method: 'PATCH',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage('Estado actualizado.');
    await loadDetail(detail.id);
    await loadUsers();
  }

  async function saveRoles() {
    if (!detail) return;
    const response = await apiRequest(`/api/v1/users/${detail.id}/roles`, {
      body: JSON.stringify({ roleIds: [...selectedRoleIds] }),
      method: 'PUT',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage('Roles actualizados.');
    await loadDetail(detail.id);
  }

  async function saveOverrides() {
    if (!detail) return;
    const overrides = [...overrideEffects.entries()]
      .filter(([, effect]) => effect !== 'none')
      .map(([permissionId, effect]) => ({ effect: effect as 'allow' | 'deny', permissionId }));
    const response = await apiRequest(`/api/v1/users/${detail.id}/permissions`, {
      body: JSON.stringify({ overrides }),
      method: 'PUT',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage('Excepciones de permisos actualizadas.');
    await loadDetail(detail.id);
  }

  async function issueToken(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const label = formText(form, 'label').trim();
    const ttlHours = Number(formText(form, 'ttlHours'));
    const boundUserId = formText(form, 'boundUserId');
    const roleId = formText(form, 'roleId');
    if (!label || !ttlHours) return;
    setMessage('');
    const response = await apiRequest('/api/v1/access-tokens', {
      body: JSON.stringify({
        ...(boundUserId ? { boundUserId } : {}),
        kind: tokenKind,
        label,
        ...(roleId ? { roleId } : {}),
        ttlHours,
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const created = (await response.json()) as { expiresAt: string; token: string };
    setIssuedToken(created);
    event.currentTarget.reset();
    await loadTokens();
  }

  async function revokeToken(id: string) {
    const response = await apiRequest(`/api/v1/access-tokens/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await loadTokens();
  }

  if (failed) return <DashboardFailed label="los usuarios" />;
  if (!profile) return <DashboardLoading />;

  if (!profile.permissions.includes('users.read')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Usuarios</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver usuarios.</p>
        </section>
      </DashboardShell>
    );
  }

  const groupedCatalog = catalog.reduce<Map<string, PermissionCatalogEntry[]>>((groups, entry) => {
    const bucket = groups.get(entry.group) ?? [];
    bucket.push(entry);
    groups.set(entry.group, bucket);
    return groups;
  }, new Map());

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Administración</p>
          <h1 className="text-2xl font-semibold text-forest">Usuarios</h1>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="user-directory">
              <input
                aria-label="Buscar usuario"
                className="user-directory-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nombre"
                type="search"
                value={search}
              />
              <div className="user-directory-list">
                {groupedUsers.map(([roleName, groupUsers]) => {
                  const collapsed = collapsedGroups.includes(roleName);
                  return (
                    <section key={roleName}>
                      <button
                        aria-expanded={!collapsed}
                        className="user-group-header"
                        onClick={() =>
                          setCollapsedGroups((current) =>
                            current.includes(roleName)
                              ? current.filter((name) => name !== roleName)
                              : [...current, roleName],
                          )
                        }
                        type="button"
                      >
                        <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
                        {roleName}
                        <small>{groupUsers.length}</small>
                      </button>
                      {collapsed
                        ? null
                        : groupUsers.map((user) => (
                            <button
                              className={`user-row ${user.id === selectedUserId ? 'is-active' : ''}`}
                              key={user.id}
                              onClick={() => void selectUser(user.id)}
                              type="button"
                            >
                              <strong>{user.displayName}</strong>
                              <span>
                                <i
                                  className={
                                    user.status === 'active'
                                      ? 'user-status is-on'
                                      : 'user-status is-off'
                                  }
                                >
                                  {user.status === 'active' ? 'Activo' : user.status}
                                </i>
                                {' · desde '}
                                {shortDate(user.createdAt)}
                              </span>
                            </button>
                          ))}
                    </section>
                  );
                })}
                {users.length === 0 ? <p className="empty-state">Sin usuarios.</p> : null}
                {groupedUsers.length === 0 && users.length > 0 ? (
                  <p className="empty-state">Ningún usuario coincide con la búsqueda.</p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-6">
              {detail ? (
                <>
                  <article className="operation-card">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-forest">{detail.displayName}</h2>
                        <p className="text-sm text-ink-muted">
                          {detail.email ?? 'Sin email'} · {detail.status}
                        </p>
                      </div>
                      {canDisable ? (
                        <button
                          className="button button-secondary"
                          onClick={() => void toggleStatus()}
                          type="button"
                        >
                          {detail.status === 'active' ? 'Desactivar' : 'Activar'}
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm text-ink-muted">
                      Permisos efectivos: {detail.effectivePermissions.join(', ') || 'ninguno'}
                    </p>
                  </article>

                  <article className="operation-card">
                    <h3 className="font-semibold text-forest">Roles</h3>
                    <div className="mt-3 grid gap-2">
                      {roles.map((role) => (
                        <label className="flex items-center gap-2 text-sm" key={role.id}>
                          <input
                            checked={selectedRoleIds.has(role.id)}
                            disabled={!canManage}
                            onChange={(event) =>
                              setSelectedRoleIds((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(role.id);
                                else next.delete(role.id);
                                return next;
                              })
                            }
                            type="checkbox"
                          />
                          {role.name}
                        </label>
                      ))}
                    </div>
                    {canManage ? (
                      <button
                        className="button button-secondary mt-3"
                        onClick={() => void saveRoles()}
                        type="button"
                      >
                        Guardar roles
                      </button>
                    ) : null}
                  </article>

                  <article className="operation-card">
                    <h3 className="font-semibold text-forest">Excepciones de permisos</h3>
                    <div className="mt-3 grid gap-4 max-h-96 overflow-y-auto">
                      {[...groupedCatalog.entries()].map(([group, entries]) => (
                        <div key={group}>
                          <p className="text-xs font-semibold uppercase text-ink-muted">{group}</p>
                          {entries.map((entry) => (
                            <div
                              className="mt-1 flex flex-wrap items-center justify-between gap-3 text-sm"
                              key={entry.id}
                            >
                              <span className="min-w-0 flex-1 break-words">
                                {entry.description}
                              </span>
                              <select
                                className="shrink-0"
                                disabled={!canOverride}
                                onChange={(event) =>
                                  setOverrideEffects((current) => {
                                    const next = new Map(current);
                                    next.set(
                                      entry.id,
                                      event.target.value as 'allow' | 'deny' | 'none',
                                    );
                                    return next;
                                  })
                                }
                                value={overrideEffects.get(entry.id) ?? 'none'}
                              >
                                <option value="none">Sin excepción</option>
                                <option value="allow">Permitir</option>
                                <option value="deny">Denegar</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                    {canOverride ? (
                      <button
                        className="button button-secondary mt-3"
                        onClick={() => void saveOverrides()}
                        type="button"
                      >
                        Guardar excepciones
                      </button>
                    ) : null}
                  </article>
                </>
              ) : (
                <p className="empty-state">Elegí un usuario para ver sus privilegios.</p>
              )}

              {canIssueTokens ? (
                <article className="operation-card">
                  <h3 className="font-semibold text-forest">Tokens de acceso</h3>
                  <p className="mt-1 text-sm text-ink-muted">
                    Repartidor: acceso reutilizable atado a un usuario existente, sin contraseña.
                    Invitación: crea un usuario nuevo la primera vez que se usa.
                  </p>

                  {issuedToken ? (
                    <div className="mt-3 rounded-xl border border-forest/10 bg-forest/5 p-3 text-sm">
                      <p className="font-semibold text-forest">
                        Copiá este token ahora: no se puede volver a mostrar.
                      </p>
                      <code className="mt-1 block break-all">{issuedToken.token}</code>
                      <p className="mt-1 text-ink-muted">
                        Vence: {timeLabel(issuedToken.expiresAt)}
                      </p>
                    </div>
                  ) : null}

                  <form className="mt-4 grid gap-3" onSubmit={(event) => void issueToken(event)}>
                    <label className="field">
                      Tipo
                      <select
                        onChange={(event) =>
                          setTokenKind(event.target.value as 'repartidor_access' | 'user_invite')
                        }
                        value={tokenKind}
                      >
                        <option value="repartidor_access">Acceso de repartidor</option>
                        <option value="user_invite">Invitación de usuario</option>
                      </select>
                    </label>
                    <label className="field">
                      Etiqueta
                      <input name="label" placeholder="Repartidor turno tarde" required />
                    </label>
                    {tokenKind === 'repartidor_access' ? (
                      <label className="field">
                        Repartidor
                        <select name="boundUserId" required>
                          <option value="">Seleccionar</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="field">
                        Rol a asignar
                        <select name="roleId" required>
                          <option value="">Seleccionar</option>
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label className="field">
                      Duración (horas)
                      <input defaultValue={48} min="1" name="ttlHours" required type="number" />
                    </label>
                    <button className="button button-primary justify-self-start" type="submit">
                      Generar token
                    </button>
                  </form>

                  <div className="mt-5 grid gap-2">
                    {tokens.map((tokenItem) => (
                      <div
                        className="flex items-center justify-between gap-3 rounded-xl border border-forest/10 p-3 text-sm"
                        key={tokenItem.id}
                      >
                        <div>
                          <strong>{tokenItem.label}</strong>
                          <p className="text-ink-muted">
                            {tokenItem.kind === 'repartidor_access'
                              ? `Repartidor: ${tokenItem.boundUserDisplayName ?? '—'}`
                              : `Invitación · rol ${tokenItem.roleKey ?? '—'}`}{' '}
                            · vence {timeLabel(tokenItem.expiresAt)} · usos {tokenItem.useCount}
                          </p>
                        </div>
                        {tokenItem.revokedAt ? (
                          <span className="status-chip">Revocado</span>
                        ) : (
                          <button
                            className="button button-secondary"
                            onClick={() => void revokeToken(tokenItem.id)}
                            type="button"
                          >
                            Revocar
                          </button>
                        )}
                      </div>
                    ))}
                    {tokens.length === 0 ? (
                      <p className="text-sm text-ink-muted">Sin tokens generados.</p>
                    ) : null}
                  </div>
                </article>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
