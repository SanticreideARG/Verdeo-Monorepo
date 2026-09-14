import { useCallback, useEffect, useState } from 'react';

import { ActionButton } from '../components/ActionButton.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { PeriodPicker } from '../components/PeriodPicker.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type WeeklyMenu } from '../lib/operations.js';
import { periodsFromMenus, type Period } from '../lib/periods.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface ScopeSite {
  displayName: string;
  id: string;
}

/**
 * Los grupos del respaldo, con lo que lleva cada uno dicho en castellano.
 *
 * El texto importa tanto como la lista: quien baja un respaldo tiene que poder decidir sin abrir el
 * archivo, y "pedidos" a secas no dice si viajan los ítems y el historial.
 */
const PARTS = [
  {
    body: 'Ciudades, zonas y la numeración de pedidos de cada una.',
    key: 'operacion',
    label: 'Operación',
  },
  {
    body: 'Fichas, contactos, domicilios, preferencias, restricciones y a qué ciudad pertenece cada cliente.',
    key: 'clientes',
    label: 'Clientes',
  },
  {
    body: 'Variedades, tamaños, motivos de cancelación y medios de pago.',
    key: 'catalogo',
    label: 'Catálogo',
  },
  {
    body: 'Períodos, menús por ciudad, precios y los platos de cada variedad.',
    key: 'semanas',
    label: 'Semanas',
  },
  {
    body: 'Pedidos con sus ítems, los platos elegidos, el historial de estados y las ediciones.',
    key: 'pedidos',
    label: 'Pedidos',
  },
  { body: 'Pagos registrados sobre esos pedidos.', key: 'cobros', label: 'Cobros' },
  {
    body: 'Consolidados tomados y producción real informada.',
    key: 'produccion',
    label: 'Producción',
  },
  { body: 'Hojas de ruta y sus paradas.', key: 'reparto', label: 'Reparto' },
  { body: 'Encuestas, preguntas y respuestas.', key: 'encuestas', label: 'Encuestas' },
  {
    body: 'Formato de etiquetas y artículos de ayuda.',
    key: 'configuracion',
    label: 'Configuración',
  },
] as const;

const ALL_PARTS = PARTS.map((part) => part.key);

/**
 * "Respaldos": bajarse los datos en un archivo del que se pueda volver.
 *
 * Las exportaciones a Excel que ya existen son informes —sirven para leer y mandar, y pierden los
 * identificadores y las relaciones—, así que con una planilla se rehace una lista de clientes pero
 * no un pedido con sus ítems y su precio congelado. Esto guarda las dos cosas.
 *
 * No reemplaza al respaldo de la base: Neon guarda su propio historial y puede volver a un momento
 * exacto, que para un desastre es mejor que cualquier archivo. Esto sirve para llevarse los datos,
 * clonar la operación en un entorno de prueba, y recuperar algo borrado sin volver atrás todo.
 */
export function BackupsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [parts, setParts] = useState<string[]>([...ALL_PARTS]);
  const [sites, setSites] = useState<ScopeSite[]>([]);
  const [siteId, setSiteId] = useState('');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const canManage = profile?.permissions.includes('backups.manage') ?? false;

  const load = useCallback(async () => {
    const [scopeResponse, menusResponse] = await Promise.all([
      apiRequest('/api/v1/scope'),
      apiRequest('/api/v1/menus'),
    ]);
    if (scopeResponse.ok) {
      setSites(((await scopeResponse.json()) as { sites: ScopeSite[] }).sites);
    }
    if (menusResponse.ok) {
      setPeriods(periodsFromMenus(((await menusResponse.json()) as { items: WeeklyMenu[] }).items));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canManage) void load();
    else setLoading(false);
  }, [canManage, load]);

  async function download() {
    setMessage('');
    const params = new URLSearchParams({ parts: parts.join(',') });
    if (siteId) params.set('operatingSiteId', siteId);
    if (cycleId) params.set('cycleId', cycleId);
    const response = await apiRequest(`/api/v1/backups/export?${params.toString()}`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `verdeo-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (failed) return <DashboardFailed label="los respaldos" />;
  if (!profile) return <DashboardLoading />;

  if (!canManage) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Respaldos</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Administración</p>
          <h1 className="text-2xl font-semibold text-forest">Respaldos</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            Un archivo con los datos y sus relaciones intactas, del que se puede volver. Las
            planillas de Excel que bajás desde cada pantalla son otra cosa: sirven para leer y
            mandar, pero no alcanzan para reconstruir un pedido.
          </p>
        </header>

        {message ? (
          <p className="screen-notice mt-5" role="alert">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="operation-card grid gap-4">
              <p className="text-sm font-semibold text-forest">Qué llevarse</p>
              <fieldset className="label-fields">
                <legend className="sr-only">Grupos del respaldo</legend>
                {PARTS.map((part) => (
                  <label key={part.key}>
                    <input
                      checked={parts.includes(part.key)}
                      onChange={() =>
                        setParts((current) =>
                          current.includes(part.key)
                            ? current.filter((item) => item !== part.key)
                            : ALL_PARTS.filter(
                                (candidate) =>
                                  candidate === part.key || current.includes(candidate),
                              ),
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      {part.label}
                      <small className="field-hint"> · {part.body}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <button
                  className="button button-secondary"
                  onClick={() => setParts([...ALL_PARTS])}
                  type="button"
                >
                  Todo
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => setParts([])}
                  type="button"
                >
                  Nada
                </button>
              </div>
            </div>

            <div className="grid gap-5 content-start">
              <div className="operation-card grid gap-4">
                <p className="text-sm font-semibold text-forest">Hasta dónde</p>
                <label className="field">
                  Ciudad
                  <select onChange={(event) => setSiteId(event.target.value)} value={siteId}>
                    <option value="">Todas las ciudades</option>
                    {sites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <PeriodPicker allowAll onChange={setCycleId} periods={periods} value={cycleId} />
                <p className="field-hint">
                  La ciudad recorta clientes, pedidos y rutas; el período recorta pedidos, semanas y
                  producción. El catálogo y la configuración van completos siempre: son chicos y sin
                  ellos lo demás no se entiende.
                </p>
                <ActionButton
                  className="button button-primary justify-self-start"
                  disabled={parts.length === 0}
                  onClick={download}
                  pendingLabel="Armando el archivo…"
                >
                  Descargar respaldo
                </ActionButton>
              </div>

              <div className="operation-card grid gap-2 text-sm text-ink-muted">
                <p className="text-sm font-semibold text-forest">Qué no lleva</p>
                <p>
                  Contraseñas, sesiones, tokens y claves de integraciones: un respaldo que las lleve
                  convierte cada descarga en una filtración.
                </p>
                <p>
                  Usuarios y roles, por decisión: restaurarlos en otra base deja a la gente sin
                  poder entrar hasta blanquear.
                </p>
                <p>
                  La auditoría, que es la tabla más grande y tiene su propia exportación. Y las
                  estadísticas, que se calculan de los pedidos: un número guardado que ya no
                  coincide con sus datos es peor que no tenerlo.
                </p>
                <p>
                  Esto no reemplaza al respaldo de la base: Neon guarda su propio historial y puede
                  volver a un momento exacto. Sirve para llevarse los datos, clonar la operación en
                  un entorno de prueba, y recuperar algo borrado sin volver atrás todo.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
