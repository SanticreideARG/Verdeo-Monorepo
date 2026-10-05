import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { EmptyState } from '../components/EmptyState.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface Template {
  actionKey?: string | null;
  active: boolean;
  body: string;
  channel: string;
  displayName: string;
  key: string;
  updatedAt: string;
  variables: string[];
}

/**
 * Las variables que el servidor sabe reemplazar, con un ejemplo de lo que ponen.
 *
 * Es un catálogo cerrado: una variable que no está acá queda sin reemplazar en el mensaje. Se
 * muestran con su ejemplo porque "{{ pedido.menu }}" no dice nada y "Intuitivo Grande, 2× Clásico
 * Chico" sí.
 *
 * Fuente de verdad: `templateValuesFor` en
 * `packages/db/src/repositories/postgres-operations-service.ts`.
 */
const VARIABLES: readonly { ejemplo: string; nombre: string }[] = [
  { ejemplo: 'Ana Vega', nombre: 'cliente.nombre' },
  { ejemplo: 'N00453', nombre: 'pedido.numero' },
  { ejemplo: '$ 25.000', nombre: 'pedido.total' },
  { ejemplo: 'miércoles 8 de octubre', nombre: 'pedido.fecha' },
  { ejemplo: 'Intuitivo Grande, 2× Clásico Chico', nombre: 'pedido.menu' },
  { ejemplo: 'Transferencia', nombre: 'pedido.pago' },
  { ejemplo: 'Centro', nombre: 'reparto.zona' },
  { ejemplo: 'de 18 a 20', nombre: 'reparto.ventana' },
  { ejemplo: 'Neuquén', nombre: 'ciudad' },
];

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** Mismo criterio que `extractTemplateVariables` en `@verdeo/customers`, que es la fuente. */
function variablesUsadas(body: string): string[] {
  return [
    ...new Set(
      [...body.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*}}/g)]
        .map((match) => match[1])
        .filter((name): name is string => name !== undefined),
    ),
  ].sort();
}

/** Una clave estable a partir del nombre: lo que identifica la plantilla al guardarla. */
function claveDesde(displayName: string): string {
  return displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

/**
 * Los mensajes que se mandan seguido, escritos una vez.
 *
 * Existe porque avisar es a mano: la API de Meta se cobra por conversación y la operación no la
 * paga, así que cada semana alguien manda cien mensajes desde su WhatsApp. Escribirlos uno por uno
 * es donde aparecen los errores —el precio del menú viejo, la fecha de la semana pasada—, y
 * escribirlos una vez con las variables del pedido los saca de raíz.
 *
 * Las variables se validan antes de guardar y del lado del servidor también: una plantilla que usa
 * una variable que el sistema no conoce se manda con el `{{ … }}` escrito, que es peor que no tener
 * plantilla.
 */
export function MessageTemplatesPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [draftBody, setDraftBody] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const canManage = profile?.permissions.includes('messages.templates.manage') ?? false;

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/message-templates');
    setLoading(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setTemplates(((await response.json()) as { items: Template[] }).items);
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, load]);

  function startNew() {
    setEditing({
      active: true,
      body: 'Hola {{ cliente.nombre }}, tu pedido {{ pedido.numero }} llega el {{ pedido.fecha }}.',
      channel: 'whatsapp',
      displayName: '',
      key: '',
      updatedAt: '',
      variables: [],
    });
    setDraftBody(
      'Hola {{ cliente.nombre }}, tu pedido {{ pedido.numero }} llega el {{ pedido.fecha }}.',
    );
    setMessage('');
  }

  function startEdit(template: Template) {
    setEditing(template);
    setDraftBody(template.body);
    setMessage('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const displayName = formText(form, 'displayName').trim();
    if (!displayName) {
      setMessage('Ponele un nombre para reconocerlo en la lista.');
      return;
    }

    const usadas = variablesUsadas(draftBody);
    const desconocidas = usadas.filter(
      (name) => !VARIABLES.some((variable) => variable.nombre === name),
    );
    if (desconocidas.length > 0) {
      setMessage(
        `Estas variables no existen y se mandarían escritas tal cual: ${desconocidas.join(', ')}.`,
      );
      return;
    }

    const response = await apiRequest('/api/v1/message-templates', {
      body: JSON.stringify({
        active: form.get('active') === 'on',
        body: draftBody,
        channel: 'whatsapp',
        displayName,
        // La clave de una plantilla que ya existe no se cambia: es con lo que están anotados los
        // avisos ya mandados, y cambiarla los dejaría huérfanos.
        key: editing.key || claveDesde(displayName),
        variables: usadas,
      }),
      method: 'PUT',
      notify: false,
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setEditing(null);
    await load();
    showToast('Mensaje guardado.');
  }

  if (failed) return <DashboardFailed label="los mensajes guardados" />;
  if (!profile) return <DashboardLoading />;

  if (!canManage) {
    return (
      <DashboardShell onLogout={() => void logout()} profile={profile}>
        <SettingsTabs permissions={profile.permissions} />
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Mensajes guardados</h1>
          <p className="mt-3 text-ink-muted">
            Tu usuario puede usar los mensajes guardados, pero no escribirlos ni cambiarlos.
          </p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell onLogout={() => void logout()} profile={profile}>
      <SettingsTabs permissions={profile.permissions} />
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Panel de control</p>
          <h1 className="text-2xl font-semibold text-forest">Mensajes guardados</h1>
          <p className="mt-2 max-w-3xl text-ink-muted">
            Los avisos que se mandan todas las semanas, escritos una vez. Donde va un dato del
            pedido se escribe una variable entre llaves dobles y el sistema la reemplaza por cliente
            al armar la cola de <strong>Avisos</strong>.
          </p>
        </header>

        {message ? (
          <p className="screen-notice mt-5" role="alert">
            {message}
          </p>
        ) : null}

        {editing === null ? (
          <>
            <div className="mt-6">
              <button className="button button-primary" onClick={startNew} type="button">
                + Escribir un mensaje
              </button>
            </div>

            {loading ? (
              <p className="mt-6 text-ink-muted">Cargando…</p>
            ) : templates.length === 0 ? (
              <EmptyState
                body="El primero suele ser el aviso de que el pedido ya está confirmado y qué día llega."
                title="Todavía no hay ningún mensaje escrito"
              />
            ) : (
              <ul className="templates-rows mt-5">
                {templates.map((template) => (
                  <li className={template.active ? '' : 'is-inactive'} key={template.key}>
                    <div className="templates-row-head">
                      <strong>{template.displayName}</strong>
                      {template.active ? null : <span>en desuso</span>}
                    </div>
                    <p className="templates-row-body">{template.body}</p>
                    <div className="templates-row-actions">
                      <button
                        className="button button-secondary"
                        onClick={() => startEdit(template)}
                        type="button"
                      >
                        Editar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <form className="templates-form mt-6" onSubmit={(event) => void save(event)}>
            <label className="field">
              Nombre
              <input
                defaultValue={editing.displayName}
                maxLength={160}
                name="displayName"
                placeholder="Aviso de pedido confirmado"
                required
              />
            </label>

            <label className="field">
              Mensaje
              <textarea
                name="body"
                onChange={(event) => setDraftBody(event.target.value)}
                rows={7}
                value={draftBody}
              />
            </label>

            {/* Un botón por variable y no una lista para copiar a mano: escribir
                "{{ pedido.numero }}" sin una falta de ortografía es más difícil de lo que parece. */}
            <div className="templates-variables">
              <p>Insertar un dato del pedido:</p>
              <div>
                {VARIABLES.map((variable) => (
                  <button
                    className="button button-secondary"
                    key={variable.nombre}
                    onClick={() => setDraftBody((current) => `${current}{{ ${variable.nombre} }}`)}
                    title={`Por ejemplo: ${variable.ejemplo}`}
                    type="button"
                  >
                    {variable.nombre}
                  </button>
                ))}
              </div>
            </div>

            {/* Con los valores de ejemplo: es la única forma de ver que la oración cierra antes de
                mandársela a cien personas. */}
            <div className="templates-preview">
              <p>Así se va a leer:</p>
              <blockquote>
                {draftBody.replace(
                  /{{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*}}/g,
                  (match, name: string) =>
                    VARIABLES.find((variable) => variable.nombre === name)?.ejemplo ?? match,
                )}
              </blockquote>
            </div>

            <label className="field-inline">
              <input defaultChecked={editing.active} name="active" type="checkbox" />
              En uso
            </label>

            <div className="templates-form-actions">
              <button className="button button-primary" type="submit">
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
