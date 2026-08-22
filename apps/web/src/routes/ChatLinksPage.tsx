import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { DashboardShell, type DashboardProfile } from '../components/DashboardShell.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';

interface ChatRole {
  id: string;
  key: string;
  name: string;
}

interface ChatLinks {
  roleLinks: { active: boolean; id: string; roleAId: string; roleBId: string }[];
  roles: ChatRole[];
  userLinks: {
    createdAt: string;
    effect: 'allow' | 'deny';
    id: string;
    reason: string | null;
    userADisplayName: string;
    userAId: string;
    userBDisplayName: string;
    userBId: string;
  }[];
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export function ChatLinksPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [links, setLinks] = useState<ChatLinks | null>(null);
  const [users, setUsers] = useState<{ displayName: string; id: string }[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/me')
      .then(async (response) => {
        if (response.status === 401) {
          await navigate('/login', { replace: true });
          return;
        }
        if (!response.ok) throw new Error('sesión');
        const body = (await response.json()) as DashboardProfile;
        if (active) setProfile(body);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const canManage = profile?.permissions.includes('chat.links.manage') ?? false;

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/chat/links');
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setLinks((await response.json()) as ChatLinks);
  }, []);

  useEffect(() => {
    if (!canManage) return;
    void load();
    void apiRequest('/api/v1/users?limit=100')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as {
          items: { displayName: string; id: string }[];
        };
        setUsers(body.items);
      })
      .catch(() => setUsers([]));
  }, [canManage, load]);

  async function logout() {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  function linkFor(roleAId: string, roleBId: string) {
    return links?.roleLinks.find(
      (link) =>
        (link.roleAId === roleAId && link.roleBId === roleBId) ||
        (link.roleAId === roleBId && link.roleBId === roleAId),
    );
  }

  async function toggleRoleLink(roleAId: string, roleBId: string, active: boolean) {
    setMessage('');
    const response = await apiRequest('/api/v1/chat/links/roles', {
      body: JSON.stringify({ active, roleAId, roleBId }),
      method: 'PUT',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setLinks((await response.json()) as ChatLinks);
  }

  async function addException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const userAId = formText(form, 'userAId');
    const userBId = formText(form, 'userBId');
    if (!userAId || !userBId || userAId === userBId) {
      setMessage('Elegí dos personas distintas.');
      return;
    }
    const response = await apiRequest('/api/v1/chat/links/users', {
      body: JSON.stringify({
        effect: formText(form, 'effect') || 'deny',
        reason: formText(form, 'reason') || undefined,
        userAId,
        userBId,
      }),
      method: 'PUT',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setLinks((await response.json()) as ChatLinks);
    event.currentTarget.reset();
  }

  async function removeException(id: string) {
    const response = await apiRequest(`/api/v1/chat/links/users/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await load();
  }

  if (failed) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream px-5 text-center">
        <div>
          <p className="eyebrow">Verdeo SCA</p>
          <h1 className="mt-4 text-3xl font-semibold text-forest">
            No pudimos cargar los enlaces.
          </h1>
          <button className="button button-primary mt-7" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="dashboard-loading" aria-live="polite">
        <img src="/brand/verdeo-icon.png" alt="" width="54" height="54" />
        <p>Cargando tu espacio…</p>
      </main>
    );
  }

  if (!canManage) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Enlaces de chat</h1>
          <p className="mt-3 text-ink-muted">
            Tu usuario no tiene permiso para configurar quién habla con quién.
          </p>
        </section>
      </DashboardShell>
    );
  }

  const roles = links?.roles ?? [];

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Ajustes</p>
          <h1 className="text-2xl font-semibold text-forest">Enlaces de chat</h1>
          <p className="mt-2 max-w-3xl text-ink-muted">
            Marcá qué roles pueden conversar entre sí. Sin ningún enlace nadie puede iniciar una
            conversación. Un rol marcado consigo mismo deja que sus integrantes se escriban entre
            ellos.
          </p>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        <div className="mt-7 overflow-x-auto">
          <table className="chat-matrix">
            <thead>
              <tr>
                <th />
                {roles.map((role) => (
                  <th key={role.id}>{role.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roles.map((rowRole, rowIndex) => (
                <tr key={rowRole.id}>
                  <th scope="row">{rowRole.name}</th>
                  {roles.map((columnRole, columnIndex) => {
                    // The matrix is symmetric, so only one half is editable.
                    if (columnIndex < rowIndex)
                      return <td className="is-mirrored" key={columnRole.id} />;
                    const link = linkFor(rowRole.id, columnRole.id);
                    return (
                      <td key={columnRole.id}>
                        <input
                          aria-label={`${rowRole.name} con ${columnRole.name}`}
                          checked={link?.active ?? false}
                          onChange={(event) =>
                            void toggleRoleLink(rowRole.id, columnRole.id, event.target.checked)
                          }
                          type="checkbox"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mt-10 text-lg font-semibold text-forest">Excepciones por persona</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Una excepción pesa más que la matriz. Un <strong>bloqueo</strong> corta la conversación
          aunque los roles estén enlazados, y siempre gana sobre una habilitación.
        </p>

        <ul className="mt-4 space-y-2">
          {links?.userLinks.map((link) => (
            <li
              className="flex items-center justify-between gap-3 rounded-xl border border-forest/15 bg-white/60 px-4 py-3"
              key={link.id}
            >
              <div>
                <strong className="text-forest">
                  {link.userADisplayName} · {link.userBDisplayName}
                </strong>
                <small className="ml-2 text-ink-muted">
                  {link.effect === 'deny' ? 'Bloqueado' : 'Habilitado'}
                  {link.reason ? ` — ${link.reason}` : ''}
                </small>
              </div>
              <button
                className="button button-secondary"
                onClick={() => void removeException(link.id)}
                type="button"
              >
                Quitar
              </button>
            </li>
          ))}
          {(links?.userLinks.length ?? 0) === 0 ? (
            <li className="rounded-xl border border-dashed border-forest/20 px-4 py-6 text-center text-ink-muted">
              No hay excepciones: sólo manda la matriz de roles.
            </li>
          ) : null}
        </ul>

        <form
          className="mt-6 space-y-3 rounded-xl border border-forest/15 bg-white/60 p-4"
          onSubmit={(event) => void addException(event)}
        >
          <h3 className="font-semibold text-forest">Nueva excepción</h3>
          <div className="form-grid">
            <label className="field">
              Persona
              <select name="userAId" required>
                <option value="">Elegí</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Persona
              <select name="userBId" required>
                <option value="">Elegí</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Efecto
              <select defaultValue="deny" name="effect">
                <option value="deny">Bloquear</option>
                <option value="allow">Habilitar</option>
              </select>
            </label>
            <label className="field">
              Motivo
              <input maxLength={500} name="reason" />
            </label>
          </div>
          <button className="button button-primary" type="submit">
            Guardar excepción
          </button>
        </form>
      </section>
    </DashboardShell>
  );
}
