import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

const INTEGRATION_KEY = 'email';

/** FormData.get returns string | File | null; only a string is ever meaningful here. */
function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

interface IntegrationCredential {
  apiKeyMask: string | null;
  displayName: string;
  enabled: boolean;
  id: string;
  key: string;
  keyConfigured: boolean;
  provider: string;
  settings: Record<string, string>;
}

/**
 * "Ajustes → Correo": the Resend key plus who mail comes from.
 *
 * The key follows the same one-way rule as every other credential — it goes in, and only ever comes
 * back as a masked last-four. The sender address is not a secret and does round-trip, because an
 * operator has to be able to see and change it.
 */
export function EmailSettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [credential, setCredential] = useState<IntegrationCredential | null>(null);
  const [encryptionConfigured, setEncryptionConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ reason: string | null; sent: boolean } | null>(
    null,
  );
  const testEmailRef = useRef<HTMLInputElement>(null);

  const canManage = profile?.permissions.includes('ai.providers.manage') ?? false;

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/integrations/credentials');
    if (!response.ok) throw new Error(await errorMessage(response));
    const body = (await response.json()) as {
      encryptionConfigured: boolean;
      items: IntegrationCredential[];
    };
    setEncryptionConfigured(body.encryptionConfigured);
    setCredential(body.items.find((item) => item.key === INTEGRATION_KEY) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!profile?.permissions.includes('ai.providers.manage')) {
      setLoading(false);
      return;
    }
    void load().catch((error: unknown) => {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar la configuración.');
    });
  }, [load, profile]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const apiKey = formText(form, 'apiKey');
    const fromEmail = formText(form, 'fromEmail');
    const enabled = form.get('enabled') === 'on';

    if (enabled && !fromEmail) {
      setMessage('Para activar el envío hace falta una dirección remitente.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const response = await apiRequest('/api/v1/integrations/credentials', {
        body: JSON.stringify({
          // Omitted rather than sent empty: an empty key would read as "clear it", and the point of
          // leaving the field blank is to keep the key already on file.
          ...(apiKey ? { apiKey } : {}),
          displayName: 'Resend',
          enabled,
          key: INTEGRATION_KEY,
          provider: 'resend',
          settings: {
            fromEmail,
            fromName: formText(form, 'fromName'),
            replyTo: formText(form, 'replyTo'),
          },
        }),
        method: 'PUT',
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await load();
      showToast('Configuración de correo guardada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos guardar la configuración.');
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    const to = testEmailRef.current?.value.trim();
    if (!to) {
      setMessage('Ingresá una dirección para la prueba.');
      return;
    }
    setTesting(true);
    setTestResult(null);
    setMessage('');
    try {
      const response = await apiRequest('/api/v1/integrations/email/test', {
        body: JSON.stringify({ to }),
        method: 'POST',
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = (await response.json()) as { reason: string | null; sent: boolean };
      setTestResult(result);
      if (result.sent) showToast('Correo de prueba enviado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos enviar la prueba.');
    } finally {
      setTesting(false);
    }
  }

  if (failed) return <DashboardFailed label="la configuración de correo" />;
  if (!profile) return <DashboardLoading />;

  if (!canManage) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <SettingsTabs permissions={profile.permissions} />
          <h1 className="mt-6 text-2xl font-semibold text-forest">Correo</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <SettingsTabs permissions={profile.permissions} />

        <header className="mt-6">
          <p className="dashboard-kicker">Ajustes</p>
          <h1 className="text-2xl font-semibold text-forest">Correo</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-muted">
            Verdeo manda correo a través de Resend: confirmaciones de acceso, avisos de pedido y
            recordatorios. La dirección remitente tiene que pertenecer a un dominio verificado en
            Resend — si no, cada envío se rechaza.
          </p>
        </header>

        {!encryptionConfigured ? (
          <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            Falta configurar la clave de cifrado del servidor. Sin ella no se puede guardar ninguna
            credencial.
          </p>
        ) : null}

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="alert">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <>
            <form className="operation-card mt-6 max-w-2xl" onSubmit={(event) => void save(event)}>
              <div className="form-grid">
                <label className="field field-wide">
                  Clave de API de Resend
                  <input
                    autoComplete="off"
                    name="apiKey"
                    placeholder={
                      credential?.keyConfigured
                        ? `Guardada (${credential.apiKeyMask ?? '····'}) — dejala vacía para conservarla`
                        : 're_...'
                    }
                    type="password"
                  />
                </label>
                <label className="field">
                  Dirección remitente
                  <input
                    defaultValue={credential?.settings.fromEmail ?? ''}
                    name="fromEmail"
                    placeholder="hola@verdeo.com.ar"
                    type="email"
                  />
                </label>
                <label className="field">
                  Nombre remitente
                  <input
                    defaultValue={credential?.settings.fromName ?? ''}
                    name="fromName"
                    placeholder="Verdeo"
                  />
                </label>
                <label className="field field-wide">
                  Responder a (opcional)
                  <input
                    defaultValue={credential?.settings.replyTo ?? ''}
                    name="replyTo"
                    placeholder="info@verdeo.com.ar"
                    type="email"
                  />
                </label>
                <label className="field field-wide flex-row items-center gap-2">
                  <input
                    defaultChecked={credential?.enabled ?? false}
                    disabled={!encryptionConfigured}
                    name="enabled"
                    type="checkbox"
                  />
                  <span>Activar el envío de correo</span>
                </label>
              </div>
              <button
                className="button button-primary mt-4"
                disabled={saving || !encryptionConfigured}
                type="submit"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </form>

            <section className="operation-card mt-4 max-w-2xl">
              <h2 className="text-lg font-semibold text-forest">Probar el envío</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Manda un correo real. Es la forma de descubrir un dominio sin verificar acá y no
                cuando un cliente espera un enlace que nunca llega.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="field flex-1">
                  Enviar a
                  <input placeholder="vos@ejemplo.com" ref={testEmailRef} type="email" />
                </label>
                <button
                  className="button button-secondary"
                  disabled={testing || !credential?.enabled}
                  onClick={() => void sendTest()}
                  type="button"
                >
                  {testing ? 'Enviando…' : 'Enviar prueba'}
                </button>
              </div>
              {!credential?.enabled ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Guardá la clave y activá el envío para poder probar.
                </p>
              ) : null}
              {testResult ? (
                <p
                  className={`mt-3 rounded-xl px-4 py-3 text-sm ${
                    testResult.sent ? 'bg-forest/5 text-forest' : 'bg-red-50 text-red-800'
                  }`}
                  role="status"
                >
                  {testResult.sent
                    ? 'Enviado. Revisá la bandeja de entrada (y el spam).'
                    : (testResult.reason ?? 'No se pudo enviar.')}
                </p>
              ) : null}
            </section>
          </>
        )}
      </section>
    </DashboardShell>
  );
}
