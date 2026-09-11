import { useCallback, useEffect, useState } from 'react';

import { ActionButton } from '../components/ActionButton.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

type Behaviour = 'responder' | 'preguntar' | 'llevar' | 'salir';
type Block = 'MENU_SEMANA' | 'PRECIOS' | 'ZONAS' | 'MEDIOS_DE_PAGO';

interface Option {
  behaviour: Behaviour;
  block?: Block;
  href?: string;
  key: string;
  label: string;
  needsCity: boolean;
  options?: Option[];
  reply?: string;
  whatsappMessage?: string;
  whatsappNumber?: string;
}

interface Flow {
  greeting: string;
  options: Option[];
  revision: number;
  unpublishedChanges: boolean;
}

const BEHAVIOUR_LABELS: Record<Behaviour, string> = {
  llevar: 'Llevar a una página',
  preguntar: 'Abrir más opciones',
  responder: 'Responder',
  salir: 'Abrir WhatsApp',
};

const BLOCK_LABELS: Record<Block, string> = {
  MEDIOS_DE_PAGO: 'Medios de pago',
  MENU_SEMANA: 'Menú de la semana',
  PRECIOS: 'Precios por tamaño',
  ZONAS: 'Zonas de entrega',
};

/** Una clave a partir de la etiqueta, para no obligar a inventarla al agregar una opción. */
function keyFrom(label: string, taken: readonly string[]): string {
  const base =
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'opcion';
  if (!taken.includes(base)) return base;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${base}-${String(index)}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}-${String(Date.now())}`;
}

/**
 * "Ajustes → Asistente": qué contesta el asistente de la landing.
 *
 * Se guarda un borrador y se publica aparte, igual que una página del CMS: la landing lee sólo lo
 * publicado, así que un árbol a medio armar nunca llega a un visitante. Cada guardado escribe una
 * revisión nueva en lugar de pisar la anterior, que es lo que permite volver atrás.
 *
 * Las respuestas se escriben acá; los datos —menú, precios, zonas— los trae el asistente en vivo de
 * la misma fuente que la web pública. Por eso el texto conviene que diga el sentido y no el dato: un
 * texto que enumere los menús queda escrito y en seis semanas miente.
 */
export function AssistantSettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [stats, setStats] = useState<{ hits: number; optionKey: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const canRead = profile?.permissions.includes('cms.read') ?? false;
  const canEdit = profile?.permissions.includes('cms.edit') ?? false;
  const canPublish = profile?.permissions.includes('cms.publish') ?? false;

  const load = useCallback(async () => {
    const [flowResponse, statsResponse] = await Promise.all([
      apiRequest('/api/v1/assistant'),
      apiRequest('/api/v1/assistant/stats'),
    ]);
    if (flowResponse.ok) setFlow((await flowResponse.json()) as Flow);
    if (statsResponse.ok) {
      setStats(((await statsResponse.json()) as { items: typeof stats }).items);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load().finally(() => setLoading(false));
    else setLoading(false);
  }, [canRead, load]);

  /** Quitar un campo opcional es sacar la clave, no ponerla en `undefined`. */
  function clearBlock(index: number) {
    setFlow((current) =>
      current
        ? {
            ...current,
            options: current.options.map((option, position) => {
              if (position !== index) return option;
              const rest = { ...option };
              delete rest.block;
              return rest;
            }),
          }
        : current,
    );
  }

  function patchOption(index: number, changes: Partial<Option>) {
    setFlow((current) =>
      current
        ? {
            ...current,
            options: current.options.map((option, position) =>
              position === index ? { ...option, ...changes } : option,
            ),
          }
        : current,
    );
  }

  function addOption() {
    setFlow((current) =>
      current
        ? {
            ...current,
            options: [
              ...current.options,
              {
                behaviour: 'responder',
                key: keyFrom(
                  'Opción nueva',
                  current.options.map((option) => option.key),
                ),
                label: 'Opción nueva',
                needsCity: false,
                options: [],
                reply: '',
              },
            ],
          }
        : current,
    );
  }

  function move(index: number, direction: -1 | 1) {
    setFlow((current) => {
      if (!current) return current;
      const target = index + direction;
      if (target < 0 || target >= current.options.length) return current;
      const options = [...current.options];
      [options[index], options[target]] = [options[target]!, options[index]!];
      return { ...current, options };
    });
  }

  async function save() {
    if (!flow) return;
    setMessage('');
    const response = await apiRequest('/api/v1/assistant', {
      body: JSON.stringify({ greeting: flow.greeting, options: flow.options }),
      method: 'PUT',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setFlow((await response.json()) as Flow);
    showToast('Borrador guardado. Todavía no lo ve nadie: falta publicar.');
  }

  async function publish() {
    setMessage('');
    const response = await apiRequest('/api/v1/assistant/publish', { method: 'POST' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setFlow((await response.json()) as Flow);
    showToast('Publicado. Ya está en la landing.');
  }

  if (failed) return <DashboardFailed label="el asistente" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Asistente</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <SettingsTabs permissions={profile.permissions} />
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Administración</p>
            <h1 className="text-2xl font-semibold text-forest">Asistente de la landing</h1>
          </div>
          {canEdit && flow ? (
            <div className="flex flex-wrap gap-2">
              <ActionButton
                className="button button-secondary"
                onClick={save}
                pendingLabel="Guardando…"
              >
                Guardar borrador
              </ActionButton>
              {canPublish ? (
                <ActionButton onClick={publish} pendingLabel="Publicando…">
                  Publicar
                </ActionButton>
              ) : null}
            </div>
          ) : null}
        </header>

        <p className="mt-3 max-w-2xl text-sm text-ink-muted">
          El asistente no conversa: ofrece opciones. Acá se escribe qué dice cada una. Los datos
          —menú, precios y zonas— los trae en vivo del mismo lugar que la web pública, así que
          conviene que el texto explique el sentido y no enumere el dato: un texto que liste los
          menús queda escrito y en seis semanas deja de ser cierto.
        </p>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        {flow?.unpublishedChanges ? (
          <p className="mt-4 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            Hay cambios guardados que todavía no se publicaron. La landing sigue mostrando la
            versión anterior.
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : !flow ? (
          <p className="mt-6 text-ink-muted">No pudimos cargar el asistente.</p>
        ) : (
          <>
            <label className="field field-wide mt-6 max-w-2xl">
              Saludo
              <input
                disabled={!canEdit}
                onChange={(event) =>
                  setFlow((current) =>
                    current ? { ...current, greeting: event.target.value } : current,
                  )
                }
                value={flow.greeting}
              />
            </label>

            <div className="mt-6 grid gap-3">
              {flow.options.map((option, index) => (
                <article className="operation-card" key={option.key}>
                  <div className="form-grid">
                    <label className="field">
                      Qué dice el botón
                      <input
                        disabled={!canEdit}
                        onChange={(event) => patchOption(index, { label: event.target.value })}
                        value={option.label}
                      />
                    </label>
                    <label className="field">
                      Qué hace
                      <select
                        disabled={!canEdit}
                        onChange={(event) =>
                          patchOption(index, { behaviour: event.target.value as Behaviour })
                        }
                        value={option.behaviour}
                      >
                        {Object.entries(BEHAVIOUR_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field field-wide">
                      Respuesta
                      <textarea
                        disabled={!canEdit}
                        onChange={(event) => patchOption(index, { reply: event.target.value })}
                        rows={2}
                        value={option.reply ?? ''}
                      />
                    </label>

                    {option.behaviour === 'responder' ? (
                      <label className="field">
                        Datos que muestra
                        <select
                          disabled={!canEdit}
                          onChange={(event) => {
                            if (event.target.value)
                              patchOption(index, { block: event.target.value as Block });
                            else clearBlock(index);
                          }}
                          value={option.block ?? ''}
                        >
                          <option value="">Sólo el texto</option>
                          {Object.entries(BLOCK_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {option.behaviour === 'llevar' ? (
                      <label className="field">
                        A qué página
                        <input
                          disabled={!canEdit}
                          onChange={(event) => patchOption(index, { href: event.target.value })}
                          placeholder="/pedido"
                          value={option.href ?? ''}
                        />
                      </label>
                    ) : null}

                    {option.behaviour === 'salir' ? (
                      <>
                        <label className="field">
                          A qué WhatsApp
                          <input
                            disabled={!canEdit}
                            onChange={(event) =>
                              patchOption(index, { whatsappNumber: event.target.value })
                            }
                            placeholder="+54 9 299 123 4567"
                            value={option.whatsappNumber ?? ''}
                          />
                        </label>
                        <label className="field field-wide">
                          Mensaje con el que se abre
                          <input
                            disabled={!canEdit}
                            onChange={(event) =>
                              patchOption(index, { whatsappMessage: event.target.value })
                            }
                            value={option.whatsappMessage ?? ''}
                          />
                        </label>
                      </>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <label className="field-inline">
                      <input
                        checked={option.needsCity}
                        disabled={!canEdit}
                        onChange={(event) =>
                          patchOption(index, { needsCity: event.target.checked })
                        }
                        type="checkbox"
                      />
                      Preguntar la ciudad primero
                    </label>
                    <span className="text-xs text-ink-muted">
                      clave <code>{option.key}</code> ·{' '}
                      {stats.find((row) => row.optionKey === option.key)?.hits ?? 0} toques
                    </span>
                    {canEdit ? (
                      <div className="ml-auto flex gap-1">
                        <button
                          className="button button-secondary"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          className="button button-secondary"
                          disabled={index === flow.options.length - 1}
                          onClick={() => move(index, 1)}
                          type="button"
                        >
                          ↓
                        </button>
                        <button
                          className="button button-danger"
                          onClick={() =>
                            setFlow((current) =>
                              current
                                ? {
                                    ...current,
                                    options: current.options.filter(
                                      (_, position) => position !== index,
                                    ),
                                  }
                                : current,
                            )
                          }
                          type="button"
                        >
                          Quitar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            {canEdit ? (
              <button className="button button-secondary mt-4" onClick={addOption} type="button">
                + Agregar opción
              </button>
            ) : null}
          </>
        )}
      </section>
    </DashboardShell>
  );
}
