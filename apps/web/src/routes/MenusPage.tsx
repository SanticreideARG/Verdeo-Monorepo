import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { DataTable, type DataColumn } from '../components/DataTable.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type WeeklyMenu } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

type DistributionMode = 'CREATE_MISSING' | 'UPDATE_UNCUSTOMIZED' | 'REPLACE';

interface OperatingSite {
  displayName: string;
  id: string;
}

/**
 * Una semana, con sus localidades adentro.
 *
 * La base guarda una fila por ciudad (ADR-028: un pedido apunta a una revisión concreta y nunca
 * compone global más regional al momento de pedir). Eso está bien para el motor y es lo que
 * permite que cada ciudad tenga su precio, pero listarlo tal cual convertía una semana con tres
 * ciudades en cuatro tarjetas iguales, con el mismo nombre y la misma fecha, imposibles de
 * distinguir de un vistazo. Acá se agrupa: una fila por semana, y las ciudades pasan a ser un
 * detalle de esa fila.
 */
interface WeekRow {
  alias: string;
  closeAt: string;
  cycleId: string;
  master: WeeklyMenu | null;
  offerings: number;
  openAt: string;
  sites: WeeklyMenu[];
}

function groupByWeek(menus: readonly WeeklyMenu[]): WeekRow[] {
  const weeks = new Map<string, WeekRow>();
  for (const menu of menus) {
    const row = weeks.get(menu.cycle.id) ?? {
      alias: menu.cycle.alias,
      closeAt: menu.cycle.closeAt,
      cycleId: menu.cycle.id,
      master: null,
      offerings: 0,
      openAt: menu.cycle.openAt,
      sites: [],
    };
    if (menu.operatingSiteId === null) row.master = menu;
    else row.sites.push(menu);
    // La cantidad de opciones se toma de la maestra; si la semana sólo existe distribuida, de la
    // primera ciudad, que es lo mismo salvo que alguien la haya personalizado.
    row.offerings = row.master?.offerings.length ?? row.sites[0]?.offerings.length ?? 0;
    weeks.set(menu.cycle.id, row);
  }
  return [...weeks.values()].sort((left, right) => right.openAt.localeCompare(left.openAt));
}

function dayMonth(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short' }).format(new Date(iso));
}

const STATUS_LABELS: Record<string, string> = {
  ARCHIVED: 'Archivada',
  DRAFT: 'Borrador',
  PUBLISHED: 'Publicada',
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/**
 * En qué estado está la semana para quien la vende.
 *
 * No es el estado de la fila maestra: esa puede quedar en borrador para siempre y aun así la semana
 * estar publicada en las tres ciudades, que es lo que un cliente ve. Lo que importa acá es dónde se
 * puede pedir, así que cuenta localidades publicadas y sólo cae al estado de la maestra cuando
 * todavía no llegó a ninguna.
 */
function weekStatus(week: WeekRow, siteCount: number): string {
  const published = week.sites.filter((menu) => menu.status === 'PUBLISHED').length;
  if (published === 0) return statusLabel(week.master?.status ?? 'DRAFT');
  if (siteCount > 0 && published >= siteCount) return 'Publicada';
  return `Publicada en ${published} de ${siteCount || week.sites.length}`;
}

/**
 * "Periodos": una fila por semana, con publicación y alcance por localidad.
 *
 * Crear una semana nueva es "Configurar la semana"; los precios de cada ciudad viven en "Precios
 * por ubicación".
 */
export function MenusPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const permissions = profile?.permissions ?? [];
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [sites, setSites] = useState<OperatingSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [openWeek, setOpenWeek] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!profile) return;
    const [menuResponse, siteResponse] = await Promise.all([
      profile.permissions.some((permission) =>
        ['orders.read', 'production.read'].includes(permission),
      )
        ? apiRequest('/api/v1/menus')
        : null,
      profile.permissions.includes('sites.read') ? apiRequest('/api/v1/operating-sites') : null,
    ]);
    if (menuResponse?.ok) {
      setMenus(((await menuResponse.json()) as { items: WeeklyMenu[] }).items);
    }
    if (siteResponse?.ok) {
      const loadedSites = (
        (await siteResponse.json()) as {
          items: { active: boolean; displayName: string; id: string }[];
        }
      ).items;
      setSites(loadedSites.filter((site) => site.active));
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadData().catch((error: unknown) => {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar los menús.');
    });
  }, [loadData]);

  async function publish(menuId: string) {
    setMessage('');
    const response = await apiRequest(`/api/v1/menus/${menuId}/publish`, { method: 'POST' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    showToast('Semana publicada.');
    await loadData();
  }

  async function deleteMenu(menuId: string, label: string) {
    if (!window.confirm(`¿Eliminar ${label}? Solo funciona si no tiene pedidos cargados.`)) return;
    setMessage('');
    const response = await apiRequest(`/api/v1/menus/${menuId}`, { method: 'DELETE' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    showToast('Menú eliminado.');
    await loadData();
  }

  /**
   * Llevar la semana a todas las localidades de una vez.
   *
   * Antes había que tildar ciudad por ciudad. Una semana se ofrece en toda la operación salvo
   * excepción, así que el trabajo por defecto es "en todas": el modo por defecto sólo crea lo que
   * falta y no pisa nada de lo que cada ciudad haya personalizado.
   */
  async function distribute(menuId: string, mode: DistributionMode) {
    if (
      mode === 'REPLACE' &&
      !window.confirm(
        'Reemplazar sobrescribe los precios y platos que cada ciudad haya personalizado. ¿Continuar?',
      )
    )
      return;

    setMessage('');
    const response = await apiRequest(`/api/v1/menus/${menuId}/distribute`, {
      body: JSON.stringify({
        confirmedReplace: mode === 'REPLACE',
        mode,
        operatingSiteIds: sites.map((site) => site.id),
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const results = (await response.json()) as { results: { outcome: string }[] };
    const created = results.results.filter((result) => result.outcome === 'CREATED').length;
    const skipped = results.results.filter((result) => result.outcome.startsWith('SKIPPED')).length;
    showToast(
      `Alcance actualizado: ${created} localidad(es) nueva(s), ${results.results.length - created - skipped} actualizada(s), ${skipped} sin cambios.`,
    );
    await loadData();
  }

  if (failed) return <DashboardFailed label="los menús" />;
  if (!profile) return <DashboardLoading />;

  const canEdit = permissions.includes('production.generate');
  const canDistribute = permissions.includes('menus.distribute');
  const weeks = groupByWeek(menus);

  const columns: readonly DataColumn<WeekRow>[] = [
    {
      key: 'semana',
      label: 'Semana',
      primary: true,
      render: (week) =>
        week.master && canEdit ? (
          <Link className="order-name" to={`/app/menus/${week.master.id}/editar`}>
            {week.alias}
          </Link>
        ) : (
          <span className="order-name">{week.alias}</span>
        ),
      sortValue: (week) => week.alias,
    },
    {
      key: 'apertura',
      label: 'Apertura',
      render: (week) => dayMonth(week.openAt),
      sortValue: (week) => week.openAt,
    },
    {
      key: 'cierre',
      label: 'Cierre',
      render: (week) => dayMonth(week.closeAt),
      sortValue: (week) => week.closeAt,
    },
    {
      key: 'estado',
      label: 'Estado',
      render: (week) => <span className="status-chip">{weekStatus(week, sites.length)}</span>,
      sortValue: (week) => weekStatus(week, sites.length),
    },
    {
      key: 'opciones',
      label: 'Opciones',
      render: (week) => week.offerings,
      sortValue: (week) => week.offerings,
    },
    {
      emphasis: true,
      key: 'localidades',
      label: 'Localidades',
      /*
       * El alcance es lo que esta pantalla vino a resolver, así que se dice con números y no con
       * un tilde: "2 de 3" es accionable, "distribuida" no.
       */
      render: (week) =>
        sites.length === 0
          ? 'Sin ciudades configuradas'
          : `${week.sites.length} de ${sites.length}`,
      sortValue: (week) => week.sites.length,
    },
    {
      key: 'detalle',
      label: 'Detalle',
      render: (week) => (
        <button
          className="button button-secondary"
          onClick={() => setOpenWeek((current) => (current === week.cycleId ? null : week.cycleId))}
          type="button"
        >
          {openWeek === week.cycleId ? 'Cerrar' : 'Ver'}
        </button>
      ),
    },
  ];

  const detail = weeks.find((week) => week.cycleId === openWeek) ?? null;
  const detailMaster = detail?.master ?? null;

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Menús</p>
            <h1 className="text-2xl font-semibold text-forest">Periodos</h1>
          </div>
          {canEdit ? (
            <Link className="button button-primary" to="/app/menus/nuevo">
              Configurar la semana
            </Link>
          ) : null}
        </header>

        {canEdit ? (
          <p className="mt-3">
            <Link className="text-sm underline" to="/app/menus/precios">
              Precios por ubicación →
            </Link>
          </p>
        ) : null}

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando menús…</p>
        ) : (
          <div className="mt-6">
            <DataTable
              caption="Semanas"
              columns={columns}
              empty="Todavía no hay semanas cargadas."
              rowKey={(week) => week.cycleId}
              rows={weeks}
            />
          </div>
        )}

        {detail ? (
          <article className="operation-card mt-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-forest">{detail.alias}</h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {dayMonth(detail.openAt)} al {dayMonth(detail.closeAt)} · {detail.offerings}{' '}
                  opciones
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {detailMaster && canEdit ? (
                  <>
                    <Link
                      className="button button-secondary"
                      to={`/app/menus/${detailMaster.id}/editar`}
                    >
                      Editar la semana
                    </Link>
                    {detailMaster.status === 'DRAFT' ? (
                      <button
                        className="button button-primary"
                        onClick={() => void publish(detailMaster.id)}
                        type="button"
                      >
                        Publicar
                      </button>
                    ) : null}
                    <button
                      className="button button-secondary"
                      onClick={() => void deleteMenu(detailMaster.id, `la semana ${detail.alias}`)}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {detailMaster ? null : (
              /* Sin fila maestra no hay nada que editar una vez y repartir: la semana sólo existe
                 dentro de cada ciudad, así que se ajusta ahí. Decirlo evita buscar un botón que no
                 está. */
              <p className="mt-4 text-sm text-ink-muted">
                Esta semana no tiene una versión general: existe sólo dentro de cada localidad, así
                que se edita en cada una.
              </p>
            )}

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              Localidades
            </h3>
            <ul className="mt-2 grid gap-2">
              {sites.map((site) => {
                const distributed = detail.sites.find((menu) => menu.operatingSiteId === site.id);
                return (
                  <li className="week-site" key={site.id}>
                    <span>{site.displayName}</span>
                    {distributed ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="status-chip">{statusLabel(distributed.status)}</span>
                        {canEdit ? (
                          <Link
                            className="button button-secondary"
                            to={`/app/menus/${distributed.id}/editar`}
                          >
                            Ajustar
                          </Link>
                        ) : null}
                        {distributed.status === 'DRAFT' && canEdit ? (
                          <button
                            className="button button-secondary"
                            onClick={() => void publish(distributed.id)}
                            type="button"
                          >
                            Publicar
                          </button>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-sm text-ink-muted">Todavía no llegó acá</span>
                    )}
                  </li>
                );
              })}
              {sites.length === 0 ? (
                <li className="text-sm text-ink-muted">Todavía no hay ciudades configuradas.</li>
              ) : null}
            </ul>

            {detailMaster && canDistribute && sites.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <button
                  className="button button-primary"
                  onClick={() => void distribute(detailMaster.id, 'CREATE_MISSING')}
                  type="button"
                >
                  Llevar a todas las localidades
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => void distribute(detailMaster.id, 'UPDATE_UNCUSTOMIZED')}
                  type="button"
                >
                  Actualizar lo no personalizado
                </button>
                {permissions.includes('menus.distribute_replace') ? (
                  <button
                    className="button button-secondary"
                    onClick={() => void distribute(detailMaster.id, 'REPLACE')}
                    type="button"
                  >
                    Reemplazar personalizaciones
                  </button>
                ) : null}
                <p className="w-full text-sm text-ink-muted">
                  Lo que una ciudad ya personalizó se conserva, salvo que elijas reemplazar. Los
                  precios de cada una siguen en “Precios por ubicación”.
                </p>
              </div>
            ) : null}
          </article>
        ) : null}
      </section>
    </DashboardShell>
  );
}
