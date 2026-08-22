import { useEffect, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type AIProviderConfig } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export function AIProvidersPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [encryptionConfigured, setEncryptionConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!profile?.permissions.includes('ai.providers.manage')) {
      setLoading(false);
      return;
    }
    void apiRequest('/api/v1/ai/providers')
      .then(async (response) => {
        if (!response.ok) return;
        const result = (await response.json()) as {
          encryptionConfigured: boolean;
          items: AIProviderConfig[];
        };
        setEncryptionConfigured(result.encryptionConfigured);
        setProviders(result.items);
      })
      .finally(() => setLoading(false));
  }, [profile]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await apiRequest('/api/v1/ai/providers', {
        body: JSON.stringify({
          adapterType: formText(form, 'adapterType'),
          apiKey: formText(form, 'apiKey') || undefined,
          baseUrl: formText(form, 'baseUrl'),
          defaultModel: formText(form, 'defaultModel'),
          displayName: formText(form, 'displayName'),
          enabled: form.get('enabled') === 'on',
          key: formText(form, 'key'),
        }),
        method: 'PUT',
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = (await response.json()) as {
        encryptionConfigured: boolean;
        items: AIProviderConfig[];
      };
      setEncryptionConfigured(result.encryptionConfigured);
      setProviders(result.items);
      event.currentTarget.reset();
      setMessage('Proveedor de IA guardado sin exponer la clave.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos guardar el proveedor.');
    }
  }

  if (failed) return <DashboardFailed label="la configuración de IA" />;
  if (!profile) return <DashboardLoading />;

  if (!profile.permissions.includes('ai.providers.manage')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">IA y plantillas</h1>
          <p className="mt-3 text-ink-muted">
            Tu usuario no tiene permiso para administrar proveedores de IA.
          </p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Inteligencia</p>
          <h1 className="text-2xl font-semibold text-forest">Configuración segura del motor</h1>
          <p className="mt-3 max-w-3xl leading-7 text-ink-muted">
            La clave se cifra en el servidor y nunca vuelve al navegador. Este corte prepara el
            registro de proveedores y modelos para el generador de plantillas; la generación queda
            desacoplada del motor determinista de pedidos.
          </p>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {!encryptionConfigured ? (
          <p className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Falta AI_CONFIG_ENCRYPTION_KEY en el servidor. Podés revisar proveedores, pero no
            guardar una API key hasta configurarla.
          </p>
        ) : null}

        <form className="operation-card mt-6 max-w-2xl" onSubmit={(event) => void save(event)}>
          <div className="form-grid">
            <label className="field">
              Clave interna
              <input
                name="key"
                pattern="[a-z0-9][a-z0-9_-]{1,79}"
                placeholder="proveedor-principal"
                required
              />
            </label>
            <label className="field">
              Nombre visible
              <input name="displayName" required />
            </label>
            <label className="field">
              Tipo de adaptador
              <input name="adapterType" placeholder="openai-compatible" required />
            </label>
            <label className="field">
              Modelo por defecto
              <input name="defaultModel" required />
            </label>
            <label className="field field-wide">
              URL base de API
              <input name="baseUrl" placeholder="https://api.example.com/v1" required type="url" />
            </label>
            <label className="field field-wide">
              API key
              <input
                autoComplete="new-password"
                disabled={!encryptionConfigured}
                minLength={8}
                name="apiKey"
                type="password"
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-forest">
              <input disabled={!encryptionConfigured} name="enabled" type="checkbox" />
              Habilitar proveedor
            </label>
          </div>
          <button className="button button-primary mt-4" type="submit">
            Guardar configuración
          </button>
        </form>

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando proveedores…</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {providers.map((provider) => (
              <article className="operation-card" key={provider.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-forest">{provider.displayName}</h3>
                    <p className="mt-1 text-sm text-ink-muted">
                      {provider.defaultModel} · {provider.adapterType}
                    </p>
                  </div>
                  <span className="status-chip">{provider.enabled ? 'ACTIVO' : 'INACTIVO'}</span>
                </div>
                <p className="mt-4 font-mono text-sm">
                  {provider.apiKeyMask ?? 'Sin clave configurada'}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
