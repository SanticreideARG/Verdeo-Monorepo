import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { ActionButton } from '../components/ActionButton.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { PeriodPicker } from '../components/PeriodPicker.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type WeeklyMenu } from '../lib/operations.js';
import { periodsFromMenus, type Period } from '../lib/periods.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface Manifiesto {
  counts: Record<string, number>;
  cycleId: string | null;
  generatedAt: string;
  operatingSiteId: string | null;
  parts: string[];
  schemaVersion: string;
}

interface Paquete {
  data: Record<string, unknown[]>;
  manifest: Manifiesto;
}

interface Informe {
  dryRun: boolean;
  lineas: { actualizar: number; crear: number; tabla: string }[];
  totalActualizar: number;
  totalCrear: number;
}

/** La palabra que hay que escribir para restaurar de verdad. */
const PALABRA = 'restaurar';

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
  /*
   * La restauración, con sus frenos: el archivo cargado, el modo, la simulación hecha y la palabra
   * escrita. El botón de restaurar sólo existe cuando están las cuatro cosas, y cualquier cambio
   * —otro archivo, otro modo— tira abajo la simulación, porque ya no describe lo que va a pasar.
   */
  const [paquete, setPaquete] = useState<Paquete | null>(null);
  const [modo, setModo] = useState<'faltantes' | 'reemplazar'>('faltantes');
  const [simulacion, setSimulacion] = useState<Informe | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const archivoRef = useRef<HTMLInputElement>(null);

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

  function cargarArchivo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    setSimulacion(null);
    setConfirmacion('');
    void file
      .text()
      .then((texto) => {
        const leido = JSON.parse(texto) as Paquete;
        if (!leido.manifest?.schemaVersion || !leido.data) {
          setPaquete(null);
          setMessage('Ese archivo no parece un respaldo de Verdeo.');
          return;
        }
        setPaquete(leido);
      })
      .catch(() => {
        setPaquete(null);
        setMessage('No pude leer el archivo: tiene que ser el JSON que descargaste de acá.');
      });
  }

  async function restaurar(dryRun: boolean) {
    if (!paquete) return;
    setMessage('');
    const response = await apiRequest('/api/v1/backups/restore', {
      body: JSON.stringify({ data: paquete.data, dryRun, manifest: paquete.manifest, mode: modo }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const informe = (await response.json()) as Informe;
    setSimulacion(informe);
    if (!dryRun) {
      setConfirmacion('');
      showToast(
        `Restauración terminada: ${String(informe.totalCrear)} creadas, ${String(informe.totalActualizar)} actualizadas.`,
      );
    }
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

      {/*
       * Restaurar, en su propio panel y debajo de todo.
       *
       * Separado de la descarga a propósito: son la misma función en espejo, pero una no se puede
       * deshacer. Los cuatro pasos —cargar, elegir modo, simular, escribir la palabra— son el
       * único freno que hay entre un archivo viejo y la base de producción.
       */}
      {canManage ? (
        <section className="dashboard-panel mt-6">
          <header>
            <h2 className="text-xl font-semibold text-forest">Restaurar</h2>
            <p className="mt-2 max-w-3xl text-sm text-ink-muted">
              Escribe sobre esta base lo que traiga el archivo. Nunca borra: una fila que está acá y
              no en el archivo se queda. La simulación es obligatoria y no toca nada.
            </p>
          </header>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
            <div className="operation-card grid gap-4">
              <div>
                <input
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={cargarArchivo}
                  ref={archivoRef}
                  type="file"
                />
                <button
                  className="button button-secondary"
                  onClick={() => archivoRef.current?.click()}
                  type="button"
                >
                  Elegir el archivo
                </button>
              </div>

              {paquete ? (
                <div className="grid gap-1 text-sm text-ink-muted">
                  <p>
                    <strong className="text-forest">
                      {new Date(paquete.manifest.generatedAt).toLocaleString('es-AR')}
                    </strong>{' '}
                    · {paquete.manifest.schemaVersion}
                  </p>
                  <p>Grupos: {paquete.manifest.parts.join(', ')}</p>
                  <p>
                    {Object.values(paquete.manifest.counts).reduce(
                      (total, cantidad) => total + cantidad,
                      0,
                    )}{' '}
                    filas en {Object.keys(paquete.manifest.counts).length} tablas.
                  </p>
                </div>
              ) : (
                <p className="field-hint">Todavía no elegiste ningún archivo.</p>
              )}

              <label className="field">
                Modo
                <select
                  onChange={(event) => {
                    setModo(event.target.value === 'reemplazar' ? 'reemplazar' : 'faltantes');
                    // La simulación describía el otro modo: dejarla a la vista sería mentir.
                    setSimulacion(null);
                    setConfirmacion('');
                  }}
                  value={modo}
                >
                  <option value="faltantes">Sólo lo que falta (no pisa nada)</option>
                  <option value="reemplazar">Reemplazar (deja la base como el archivo)</option>
                </select>
              </label>

              <ActionButton
                className="button button-secondary justify-self-start"
                disabled={!paquete}
                onClick={() => restaurar(true)}
                pendingLabel="Simulando…"
              >
                Simular
              </ActionButton>
            </div>

            <div className="grid content-start gap-5">
              {simulacion ? (
                <div className="operation-card grid gap-3">
                  <p className="text-sm font-semibold text-forest">
                    {simulacion.dryRun ? 'Qué pasaría' : 'Qué pasó'}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {simulacion.totalCrear} filas nuevas ·{' '}
                    {modo === 'reemplazar'
                      ? `${String(simulacion.totalActualizar)} pisadas`
                      : 'ninguna pisada'}
                  </p>
                  <ul className="grid gap-1 text-sm">
                    {simulacion.lineas
                      .filter((linea) => linea.crear > 0 || linea.actualizar > 0)
                      .map((linea) => (
                        <li className="flex justify-between gap-3" key={linea.tabla}>
                          <span>{linea.tabla}</span>
                          <span className="text-ink-muted">
                            +{linea.crear}
                            {linea.actualizar > 0 ? ` · ~${String(linea.actualizar)}` : ''}
                          </span>
                        </li>
                      ))}
                  </ul>

                  {simulacion.dryRun ? (
                    <>
                      <label className="field">
                        Escribí «{PALABRA}» para habilitar
                        <input
                          onChange={(event) => setConfirmacion(event.target.value)}
                          value={confirmacion}
                        />
                      </label>
                      <ActionButton
                        className="button button-danger justify-self-start"
                        disabled={confirmacion.trim().toLowerCase() !== PALABRA}
                        onClick={() => restaurar(false)}
                        pendingLabel="Restaurando…"
                      >
                        Restaurar
                      </ActionButton>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="operation-card grid gap-2 text-sm text-ink-muted">
                <p className="text-sm font-semibold text-forest">Antes de restaurar</p>
                <p>
                  Bajá un respaldo de cómo está la base ahora. Es lo que te deja volver si el
                  archivo no era el que pensabas.
                </p>
                <p>
                  El archivo tiene que venir de una base con el mismo esquema. Si no, se rechaza sin
                  escribir nada: podría traer columnas que ya no existen.
                </p>
                <p>
                  Los usuarios no viajan en el respaldo, así que quién confirmó un pedido o quién
                  cobró tiene que existir en esta base. Restaurando sobre la base de la que salió el
                  archivo, eso se cumple solo.
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </DashboardShell>
  );
}
