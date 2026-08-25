import { useCallback, useEffect, useState } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface HelpArticle {
  active: boolean;
  body: string;
  category: string;
  id: string;
  key: string;
  ordinal: number;
  requiredPermission: string | null;
  title: string;
}

const EMPTY_DRAFT = {
  active: true,
  body: '',
  category: '',
  key: '',
  ordinal: 0,
  requiredPermission: '',
  title: '',
};

function groupByCategory(articles: HelpArticle[]): [string, HelpArticle[]][] {
  const groups = new Map<string, HelpArticle[]>();
  for (const article of articles) {
    const list = groups.get(article.category) ?? [];
    list.push(article);
    groups.set(article.category, list);
  }
  return [...groups.entries()];
}

/** "Ayuda modularizada": lista solo los artículos relevantes para el viewer — el propio backend
 * filtra por permiso (`GET /api/v1/help`), esta pantalla nunca decide qué mostrar. Quien tiene
 * `help.manage` además puede editar el catálogo completo desde acá mismo. */
export function HelpPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const [editing, setEditing] = useState(false);
  const [allArticles, setAllArticles] = useState<HelpArticle[]>([]);
  const [draft, setDraft] = useState<typeof EMPTY_DRAFT & { id?: string }>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const canManage = profile?.permissions.includes('help.manage') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest('/api/v1/help');
    if (response.ok) {
      setArticles(((await response.json()) as { items: HelpArticle[] }).items);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadAll = useCallback(async () => {
    const response = await apiRequest('/api/v1/help/all');
    if (response.ok) {
      setAllArticles(((await response.json()) as { items: HelpArticle[] }).items);
    }
  }, []);

  useEffect(() => {
    if (editing) void loadAll();
  }, [editing, loadAll]);

  function startCreate() {
    setIsCreating(true);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setMessage('');
  }

  function startEditArticle(article: HelpArticle) {
    setIsCreating(false);
    setEditingId(article.id);
    setDraft({
      active: article.active,
      body: article.body,
      category: article.category,
      key: article.key,
      ordinal: article.ordinal,
      requiredPermission: article.requiredPermission ?? '',
      title: article.title,
    });
    setMessage('');
  }

  async function saveDraft() {
    if (!draft.key.trim() || !draft.title.trim() || !draft.body.trim() || !draft.category.trim()) {
      setMessage('Completá clave, título, categoría y contenido.');
      return;
    }
    setMessage('');
    const body = JSON.stringify({
      active: draft.active,
      body: draft.body.trim(),
      category: draft.category.trim(),
      key: draft.key.trim(),
      ordinal: draft.ordinal,
      requiredPermission: draft.requiredPermission.trim() ? draft.requiredPermission.trim() : null,
      title: draft.title.trim(),
    });
    const response = isCreating
      ? await apiRequest('/api/v1/help', { body, method: 'POST' })
      : await apiRequest(`/api/v1/help/${editingId}`, { body, method: 'PATCH' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setIsCreating(false);
    setEditingId(null);
    await Promise.all([loadAll(), load()]);
  }

  async function removeArticle(id: string) {
    setMessage('');
    const response = await apiRequest(`/api/v1/help/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await Promise.all([loadAll(), load()]);
  }

  if (failed) return <DashboardFailed label="la ayuda" />;
  if (!profile) return <DashboardLoading />;

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Verdeo</p>
            <h1 className="text-2xl font-semibold text-forest">Ayuda</h1>
          </div>
          {canManage ? (
            <button
              className="button button-secondary"
              onClick={() => setEditing((current) => !current)}
              type="button"
            >
              {editing ? 'Salir de edición' : 'Editar ayuda'}
            </button>
          ) : null}
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {editing ? (
          <div className="operation-card mt-6 grid gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-forest">Artículos</p>
              <button className="button button-primary" onClick={startCreate} type="button">
                Nuevo artículo
              </button>
            </div>

            {isCreating || editingId ? (
              <div className="rounded-xl border border-forest/10 p-3 grid gap-3">
                <div className="form-grid">
                  <label className="field">
                    Clave (única, sin espacios)
                    <input
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, key: event.target.value }))
                      }
                      value={draft.key}
                    />
                  </label>
                  <label className="field">
                    Categoría
                    <input
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, category: event.target.value }))
                      }
                      value={draft.category}
                    />
                  </label>
                  <label className="field field-wide">
                    Título
                    <input
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, title: event.target.value }))
                      }
                      value={draft.title}
                    />
                  </label>
                  <label className="field">
                    Permiso requerido (vacío = visible para todos)
                    <input
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          requiredPermission: event.target.value,
                        }))
                      }
                      placeholder="ej. orders.read"
                      value={draft.requiredPermission}
                    />
                  </label>
                  <label className="field">
                    Orden
                    <input
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          ordinal: Number(event.target.value) || 0,
                        }))
                      }
                      type="number"
                      value={draft.ordinal}
                    />
                  </label>
                </div>
                <label className="field">
                  Contenido
                  <textarea
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, body: event.target.value }))
                    }
                    rows={5}
                    value={draft.body}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={draft.active}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, active: event.target.checked }))
                    }
                    type="checkbox"
                  />
                  Activo
                </label>
                <div className="flex gap-2">
                  <button
                    className="button button-primary"
                    onClick={() => void saveDraft()}
                    type="button"
                  >
                    Guardar
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setIsCreating(false);
                      setEditingId(null);
                    }}
                    type="button"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-2">
              {allArticles.map((article) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-xl border border-forest/10 p-3"
                  key={article.id}
                >
                  <div>
                    <p className="font-semibold text-forest">
                      {article.title} {article.active ? '' : '(inactivo)'}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {article.category} · {article.requiredPermission ?? 'visible para todos'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="button button-secondary"
                      onClick={() => startEditArticle(article)}
                      type="button"
                    >
                      Editar
                    </button>
                    <button
                      className="text-red-600"
                      onClick={() => void removeArticle(article.id)}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="mt-6 grid gap-6">
            {groupByCategory(articles).map(([category, items]) => (
              <div key={category}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
                  {category}
                </h2>
                <div className="mt-3 grid gap-2">
                  {items.map((article) => (
                    <div
                      className="rounded-xl border border-forest/10 bg-[var(--db-surface)] p-4"
                      key={article.id}
                    >
                      <button
                        className="flex w-full items-center justify-between gap-3 text-left"
                        onClick={() =>
                          setExpandedId((current) => (current === article.id ? null : article.id))
                        }
                        type="button"
                      >
                        <p className="font-semibold text-forest">{article.title}</p>
                        <span className="status-chip">{expandedId === article.id ? '−' : '+'}</span>
                      </button>
                      {expandedId === article.id ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm text-ink-muted">
                          {article.body}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {articles.length === 0 ? (
              <p className="empty-state">Todavía no hay artículos de ayuda para tu usuario.</p>
            ) : null}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
