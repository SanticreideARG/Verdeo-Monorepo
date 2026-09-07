import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type LabelSettings } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

const LABELS_PER_PAGE_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Familias de sistema: la etiqueta se imprime sin depender de descargar una fuente. */
const FONT_OPTIONS = [
  { key: 'system', label: 'Del sistema' },
  { key: 'rounded', label: 'Redondeada' },
  { key: 'serif', label: 'Con serifa' },
  { key: 'condensed', label: 'Condensada' },
  { key: 'mono', label: 'Monoespaciada' },
] as const;

/**
 * Qué puede llevar una etiqueta además del nombre.
 *
 * El nombre no está en la lista y no se puede apagar: es lo único que responde de quién es la
 * vianda, que es la pregunta que la etiqueta existe para contestar.
 */
const FIELD_OPTIONS = [
  { key: 'tamano', label: 'Tamaño (250 / 400)' },
  { key: 'variedad', label: 'Variedad' },
  { key: 'unidad', label: 'Unidad (1 de 3)' },
  { key: 'numero', label: 'N° de pedido' },
  { key: 'zona', label: 'Zona de entrega' },
  { key: 'entrega', label: 'Fecha de entrega' },
  { key: 'restricciones', label: 'Indicaciones alimentarias' },
] as const;

type LabelField = (typeof FIELD_OPTIONS)[number]['key'];

/** El renglón que se ve grande junto al nombre; el resto va chico, igual que al imprimir. */
const EMPHASISED = new Set<LabelField>(['tamano', 'variedad', 'restricciones']);

const SAMPLE: Record<LabelField, string> = {
  entrega: '28/08',
  numero: 'NQN-00090',
  restricciones: 'Sin cebolla',
  tamano: '250',
  unidad: '1 de 3',
  variedad: 'Keto',
  zona: 'Centro',
};

/** Ajustes → Etiquetas: one global row (not per-zona, unlike Intuitivo), editable by
 * superusuarios/operadores — how many labels print per page and the optional background image
 * every label carries. Sent to `PATCH /api/v1/label-settings`; the background image is uploaded
 * separately (same content-type/size checked upload as CMS media) and referenced by URL. */
export function LabelSettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [settings, setSettings] = useState<LabelSettings | null>(null);
  const [labelsPerPage, setLabelsPerPage] = useState(8);
  const [fontFamily, setFontFamily] = useState<LabelSettings['fontFamily']>('system');
  const [fontScale, setFontScale] = useState(100);
  const [fields, setFields] = useState<LabelField[]>(['tamano', 'numero']);
  const [alignment, setAlignment] = useState<'center' | 'left'>('center');
  const [uppercaseName, setUppercaseName] = useState(false);
  const [showBorders, setShowBorders] = useState(true);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canRead = profile?.permissions.includes('production.read') ?? false;
  const canWrite = profile?.permissions.includes('production.generate') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest('/api/v1/label-settings');
    if (response.ok) {
      const body = (await response.json()) as LabelSettings;
      setSettings(body);
      setLabelsPerPage(body.labelsPerPage);
      setFontFamily(body.fontFamily);
      setFontScale(body.fontScale);
      setFields(body.fields);
      setAlignment(body.alignment);
      setUppercaseName(body.uppercaseName);
      setShowBorders(body.showBorders);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  async function save(backgroundImageUrl?: string | null) {
    setMessage('');
    const response = await apiRequest('/api/v1/label-settings', {
      body: JSON.stringify({
        ...(backgroundImageUrl !== undefined ? { backgroundImageUrl } : {}),
        alignment,
        fields,
        fontFamily,
        fontScale,
        labelsPerPage,
        showBorders,
        uppercaseName,
      }),
      method: 'PATCH',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSettings((await response.json()) as LabelSettings);
    setMessage('Configuración guardada.');
  }

  async function uploadBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    const response = await apiRequest('/api/v1/label-settings/background', {
      body: file,
      headers: { 'content-type': file.type },
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const { url } = (await response.json()) as { url: string };
    await save(url);
  }

  async function removeBackground() {
    await save(null);
  }

  if (failed) return <DashboardFailed label="los ajustes de etiquetas" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Etiquetas</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <SettingsTabs permissions={profile.permissions} />
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Ajustes</p>
          <h1 className="text-2xl font-semibold text-forest">Etiquetas</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Formato de las etiquetas de cocina: cuántas salen por hoja, la tipografía y el fondo que
            llevan impreso. Cada etiqueta muestra el nombre del cliente y el tamaño; la variedad no,
            porque lo que hace falta para repartir es saber de quién es. Es una configuración única
            para toda la operación, no por zona.
          </p>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="operation-card mt-6 grid gap-5 max-w-md">
            <label className="field">
              Etiquetas por hoja
              <select
                disabled={!canWrite}
                onChange={(event) => setLabelsPerPage(Number(event.target.value))}
                value={labelsPerPage}
              >
                {LABELS_PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <fieldset className="label-fields">
              <legend>Qué muestra cada etiqueta</legend>
              {/* El nombre encabeza siempre: se enuncia acá para que no parezca un olvido. */}
              <p className="text-sm text-ink-muted">
                El nombre del cliente va siempre y no se puede quitar. Los campos se imprimen en
                este orden.
              </p>
              {FIELD_OPTIONS.map((option) => (
                <label key={option.key}>
                  <input
                    checked={fields.includes(option.key)}
                    disabled={!canWrite}
                    onChange={() =>
                      // Se guarda en el orden del catálogo y no en el de los clics: si no, los
                      // renglones bailan de lugar cada vez que se apaga y se enciende uno.
                      setFields((current) =>
                        current.includes(option.key)
                          ? current.filter((field) => field !== option.key)
                          : FIELD_OPTIONS.filter(
                              (candidate) =>
                                candidate.key === option.key || current.includes(candidate.key),
                            ).map((candidate) => candidate.key),
                      )
                    }
                    type="checkbox"
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>

            <label className="field">
              Alineación
              <select
                disabled={!canWrite}
                onChange={(event) => setAlignment(event.target.value as 'center' | 'left')}
                value={alignment}
              >
                <option value="center">Centrada</option>
                <option value="left">A la izquierda</option>
              </select>
            </label>

            <label className="label-switch">
              <input
                checked={uppercaseName}
                disabled={!canWrite}
                onChange={(event) => setUppercaseName(event.target.checked)}
                type="checkbox"
              />
              Nombre en mayúsculas
            </label>

            <label className="label-switch">
              <input
                checked={showBorders}
                disabled={!canWrite}
                onChange={(event) => setShowBorders(event.target.checked)}
                type="checkbox"
              />
              Recuadro de corte
            </label>

            <label className="field">
              Tipografía
              <select
                disabled={!canWrite}
                onChange={(event) =>
                  setFontFamily(event.target.value as LabelSettings['fontFamily'])
                }
                value={fontFamily}
              >
                {FONT_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              Tamaño de letra — {fontScale}%
              {/* Un rango y no un número escrito: lo que importa es "un poco más grande", y el
                  resultado se ve recién al imprimir. */}
              <input
                disabled={!canWrite}
                max={200}
                min={60}
                onChange={(event) => setFontScale(Number(event.target.value))}
                step={10}
                type="range"
                value={fontScale}
              />
            </label>

            {/* La misma jerarquía que la etiqueta impresa, para no tener que gastar una hoja. */}
            <div
              className="label-preview"
              style={{
                fontFamily: {
                  condensed: '"Arial Narrow", sans-serif',
                  mono: 'ui-monospace, monospace',
                  rounded: '"Nunito", system-ui, sans-serif',
                  serif: 'Georgia, serif',
                  system: 'system-ui, sans-serif',
                }[fontFamily],
                alignItems: alignment === 'left' ? 'flex-start' : 'center',
                border: showBorders ? '1px dashed #999' : '1px solid transparent',
                textAlign: alignment,
                ...(settings?.backgroundImageUrl
                  ? { backgroundImage: `url(${settings.backgroundImageUrl})` }
                  : {}),
              }}
            >
              <p
                style={{
                  fontSize: `${String(20 * (fontScale / 100))}px`,
                  fontWeight: 700,
                  textTransform: uppercaseName ? 'uppercase' : 'none',
                }}
              >
                Ana Isabella Vega
              </p>
              {fields.map((field) => (
                <p
                  key={field}
                  style={
                    EMPHASISED.has(field)
                      ? { fontSize: `${String(15 * (fontScale / 100))}px`, fontWeight: 600 }
                      : { color: '#555', fontSize: `${String(10 * (fontScale / 100))}px` }
                  }
                >
                  {SAMPLE[field]}
                </p>
              ))}
            </div>

            {canWrite ? (
              <button
                className="button button-primary justify-self-start"
                onClick={() => void save()}
              >
                Guardar
              </button>
            ) : null}

            <div>
              <p className="text-sm font-semibold text-forest">Fondo de etiqueta</p>
              {settings?.backgroundImageUrl ? (
                <img
                  alt="Fondo actual de la etiqueta"
                  className="mt-2 h-32 w-32 rounded-lg border border-forest/10 object-cover"
                  src={settings.backgroundImageUrl}
                />
              ) : (
                <p className="mt-2 text-sm text-ink-muted">
                  Sin fondo configurado (etiqueta lisa).
                </p>
              )}
              {canWrite ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    onChange={(event) => void uploadBackground(event)}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    className="button button-secondary"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    Subir fondo (PNG o JPG)
                  </button>
                  {settings?.backgroundImageUrl ? (
                    <button
                      className="button button-secondary"
                      onClick={() => void removeBackground()}
                      type="button"
                    >
                      Quitar fondo
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
