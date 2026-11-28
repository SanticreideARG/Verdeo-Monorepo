import { useEffect, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { TagPill } from '../components/TagPills.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import {
  TAG_COLOR_OPTIONS,
  TAG_SHEET_MODE_LABELS,
  TAG_TARGET_LABELS,
  type Tag,
  type TagSheetMode,
  type TagTarget,
  useTags,
} from '../lib/tags.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface Site {
  displayName: string;
  id: string;
}

type Draft = Omit<Tag, 'id' | 'sortOrder'>;

const EMPTY: Draft = {
  active: true,
  appliesTo: 'BOTH',
  color: 'green',
  deliverySheet: 'NAME',
  name: '',
  ordersSheet: 'NAME',
  productionSheet: 'NAME',
  siteIds: [],
};

const SHEETS: readonly {
  hint: string;
  key: 'deliverySheet' | 'ordersSheet' | 'productionSheet';
  label: string;
}[] = [
  {
    hint: 'La de cocina, en Excel, PDF y WhatsApp.',
    key: 'productionSheet',
    label: 'Planilla de producción',
  },
  { hint: 'La que se imprime para cada reparto.', key: 'deliverySheet', label: 'Hoja de reparto' },
  { hint: 'El Excel de pedidos del período.', key: 'ordersSheet', label: 'Planilla de pedidos' },
];

/**
 * Ajustes → Tags (TAGS_Y_STOCK_CON_NOMBRE_PLAN.md, 2026-11-28): las aclaraciones con nombre y
 * color —"Sin semillas"— que se ponen a clientes o a pedidos. Cada una dice a qué se aplica, en qué
 * ciudades vale y cómo sale en cada planilla.
 */
export function TagsSettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const canManage = profile?.permissions.includes('settings.access') ?? false;
  const { reload, tags } = useTags(canManage);
  const [sites, setSites] = useState<Site[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile?.permissions.includes('sites.read')) return;
    void apiRequest('/api/v1/operating-sites', { notify: false }).then(async (response) => {
      if (response.ok) setSites(((await response.json()) as { items: Site[] }).items);
    });
  }, [profile]);

  function edit(tag: Tag | null) {
    setEditing(tag ? tag.id : 'new');
    setDraft(tag ? { ...tag } : EMPTY);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    const response = await apiRequest(
      editing === 'new' ? '/api/v1/tags' : `/api/v1/tags/${editing}`,
      { body: JSON.stringify(draft), method: editing === 'new' ? 'POST' : 'PATCH' },
    );
    setSaving(false);
    if (!response.ok) {
      showToast(await errorMessage(response), 'error');
      return;
    }
    showToast(editing === 'new' ? `Creado "${draft.name}".` : `Guardado "${draft.name}".`);
    setEditing(null);
    reload();
  }

  if (failed) return <DashboardFailed label="los tags" />;
  if (!profile) return <DashboardLoading />;

  const siteName = (id: string) => sites.find((site) => site.id === id)?.displayName ?? '…';

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <SettingsTabs permissions={profile.permissions} />
        <header className="mt-4">
          <p className="dashboard-kicker">Panel de control</p>
          <h1 className="text-2xl font-semibold text-forest">Tags</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Aclaraciones como «Sin semillas», en pills de color. El tag de un cliente marca todos
            sus pedidos. Uno archivado no se ofrece más, pero lo que ya lo tiene lo sigue mostrando.
          </p>
        </header>

        <ul className="tags-settings-list mt-6">
          {tags.map((tag) => (
            <li className={tag.active ? '' : 'is-archived'} key={tag.id}>
              <TagPill
                tag={{ color: tag.color, fromCustomer: false, id: tag.id, name: tag.name }}
              />
              <span className="text-sm text-ink-muted">
                {TAG_TARGET_LABELS[tag.appliesTo]} ·{' '}
                {tag.siteIds.length === 0
                  ? 'Todas las ciudades'
                  : tag.siteIds.map(siteName).join(', ')}
                {tag.active ? '' : ' · archivado'}
              </span>
              <button className="link-button" onClick={() => edit(tag)} type="button">
                Editar
              </button>
            </li>
          ))}
        </ul>
        {editing === null ? (
          <button className="button button-secondary mt-4" onClick={() => edit(null)} type="button">
            Nuevo tag
          </button>
        ) : (
          <form
            className="settings-form operation-card mt-6 grid gap-5"
            onSubmit={(event) => void save(event)}
          >
            <h2 className="text-sm font-bold text-forest">
              {editing === 'new' ? 'Nuevo tag' : `Editar «${draft.name}»`}
            </h2>
            <label className="field">
              Nombre
              <input
                maxLength={40}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                required
                value={draft.name}
              />
            </label>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold">Color</legend>
              <div className="flex flex-wrap gap-2">
                {TAG_COLOR_OPTIONS.map((option) => (
                  <label className="tag-color-option" key={option.value}>
                    <input
                      checked={draft.color === option.value}
                      name="tag-color"
                      onChange={() => setDraft({ ...draft, color: option.value })}
                      type="radio"
                    />
                    <span className="tag-pill" data-color={option.value}>
                      {draft.name.trim() || option.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="field">
              Se aplica a
              <select
                onChange={(event) =>
                  setDraft({ ...draft, appliesTo: event.target.value as TagTarget })
                }
                value={draft.appliesTo}
              >
                {(Object.keys(TAG_TARGET_LABELS) as TagTarget[]).map((target) => (
                  <option key={target} value={target}>
                    {TAG_TARGET_LABELS[target]}
                  </option>
                ))}
              </select>
              <span className="field-hint">El de un cliente marca todos sus pedidos.</span>
            </label>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-semibold">Ciudades</legend>
              <p className="field-hint">Sin ninguna marcada, vale en todas.</p>
              <div className="flex flex-wrap gap-3">
                {sites.map((site) => (
                  <label className="label-switch" key={site.id}>
                    <input
                      checked={draft.siteIds.includes(site.id)}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          siteIds: event.target.checked
                            ? [...draft.siteIds, site.id]
                            : draft.siteIds.filter((id) => id !== site.id),
                        })
                      }
                      type="checkbox"
                    />
                    {site.displayName}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-3">
              <legend className="text-sm font-semibold">En las planillas</legend>
              {SHEETS.map((sheet) => (
                <label className="field" key={sheet.key}>
                  {sheet.label}
                  <select
                    onChange={(event) =>
                      setDraft({ ...draft, [sheet.key]: event.target.value as TagSheetMode })
                    }
                    value={draft[sheet.key]}
                  >
                    {(Object.keys(TAG_SHEET_MODE_LABELS) as TagSheetMode[]).map((mode) => (
                      <option key={mode} value={mode}>
                        {TAG_SHEET_MODE_LABELS[mode]}
                      </option>
                    ))}
                  </select>
                  <span className="field-hint">{sheet.hint}</span>
                </label>
              ))}
            </fieldset>

            {editing !== 'new' ? (
              <label className="label-switch">
                <input
                  checked={!draft.active}
                  onChange={(event) => setDraft({ ...draft, active: !event.target.checked })}
                  type="checkbox"
                />
                Archivado
              </label>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <button className="button button-primary" disabled={saving} type="submit">
                Guardar
              </button>
              <button
                className="button button-secondary"
                onClick={() => setEditing(null)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </section>
    </DashboardShell>
  );
}
