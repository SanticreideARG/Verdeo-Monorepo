import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { DeskWorkNotice } from '../components/DeskWorkNotice.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface PromptSummary {
  configured: boolean;
  description: string;
  displayName: string;
  hasActiveVersion: boolean;
  taskKey: string;
}

interface PromptVersion {
  createdAt: string;
  id: string;
  maxTokens: number;
  preferredProviderKey: string | null;
  systemPrompt: string;
  temperature: number;
  version: number;
}

interface PromptDetail {
  activeVersionId: string | null;
  taskKey: string;
  versions: PromptVersion[];
}

interface RunResult {
  model: string;
  output: unknown;
  promptVersion: number;
  providerKey: string;
  usage: { inputTokens: number | null; outputTokens: number | null };
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** "Workbench" (AI_CORE.md): probar una tarea de IA, guardar una nueva versión de su prompt y
 * hacer rollback a una anterior. Sin generación de imágenes ni edición en vivo antes de guardar —
 * "probar" significa correr la versión activa; para probar un cambio hay que guardarlo primero
 * (queda una versión más en el historial, y siempre se puede volver atrás). */
export function AIWorkbenchPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [prompts, setPrompts] = useState<PromptSummary[]>([]);
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<PromptDetail | null>(null);
  const [variablesText, setVariablesText] = useState('');
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const canManage = profile?.permissions.includes('ai.prompts.manage') ?? false;

  const loadPrompts = useCallback(async () => {
    const response = await apiRequest('/api/v1/ai/prompts');
    if (response.ok) setPrompts(((await response.json()) as { items: PromptSummary[] }).items);
  }, []);

  const loadDetail = useCallback(async (taskKey: string) => {
    const response = await apiRequest(`/api/v1/ai/prompts/${taskKey}`);
    if (response.ok) setDetail((await response.json()) as PromptDetail);
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void loadPrompts().finally(() => setLoading(false));
  }, [canManage, loadPrompts]);

  function selectTask(taskKey: string) {
    setSelectedTaskKey(taskKey);
    setRunResult(null);
    setMessage('');
    void loadDetail(taskKey);
  }

  async function saveVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTaskKey) return;
    setMessage('');
    const form = new FormData(event.currentTarget);
    const preferredProviderKey = formText(form, 'preferredProviderKey').trim();
    const response = await apiRequest(`/api/v1/ai/prompts/${selectedTaskKey}/versions`, {
      body: JSON.stringify({
        maxTokens: Number(formText(form, 'maxTokens')),
        systemPrompt: formText(form, 'systemPrompt'),
        temperature: Number(formText(form, 'temperature')),
        ...(preferredProviderKey ? { preferredProviderKey } : {}),
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setDetail((await response.json()) as PromptDetail);
    await loadPrompts();
  }

  async function activate(versionId: string) {
    if (!selectedTaskKey) return;
    const response = await apiRequest(`/api/v1/ai/prompts/${selectedTaskKey}/activate`, {
      body: JSON.stringify({ versionId }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setDetail((await response.json()) as PromptDetail);
  }

  async function runTask() {
    if (!selectedTaskKey) return;
    setRunning(true);
    setMessage('');
    setRunResult(null);
    const variables: Record<string, string> = {};
    for (const line of variablesText.split('\n')) {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex < 0) continue;
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (key) variables[key] = value;
    }
    const response = await apiRequest(`/api/v1/ai/tasks/${selectedTaskKey}/run`, {
      body: JSON.stringify({ variables }),
      method: 'POST',
    });
    setRunning(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setRunResult((await response.json()) as RunResult);
  }

  if (failed) return <DashboardFailed label="el workbench de IA" />;
  if (!profile) return <DashboardLoading />;

  if (!canManage) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Workbench de IA</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para administrar esto.</p>
        </section>
      </DashboardShell>
    );
  }

  const activeVersion = detail?.versions.find((version) => version.id === detail.activeVersionId);

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <DeskWorkNotice can="podés ver la configuración; probar prompts se hace mejor sentado." />
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Inteligencia</p>
          <h1 className="text-2xl font-semibold text-forest">Workbench de IA</h1>
        </header>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[0.3fr_0.7fr]">
            <ul className="grid gap-2">
              {prompts.map((prompt) => (
                <li key={prompt.taskKey}>
                  <button
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      selectedTaskKey === prompt.taskKey
                        ? 'border-forest bg-forest/5'
                        : 'border-forest/10 bg-[var(--db-surface)]'
                    }`}
                    onClick={() => selectTask(prompt.taskKey)}
                    type="button"
                  >
                    <p className="font-semibold text-forest">{prompt.displayName}</p>
                    <p className="text-xs text-ink-muted">
                      {prompt.hasActiveVersion ? 'Configurada' : 'Sin prompt activo'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="grid gap-6">
              {!selectedTaskKey || !detail ? (
                <p className="text-ink-muted">Elegí una tarea para configurarla.</p>
              ) : (
                <>
                  <p className="text-sm text-ink-muted">
                    {prompts.find((p) => p.taskKey === selectedTaskKey)?.description}
                  </p>

                  <form
                    className="grid gap-3 rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6"
                    onSubmit={(event) => void saveVersion(event)}
                  >
                    <p className="text-sm font-semibold text-forest">Nueva versión del prompt</p>
                    <label className="field">
                      Prompt de sistema
                      <textarea
                        defaultValue={activeVersion?.systemPrompt ?? ''}
                        name="systemPrompt"
                        required
                        rows={4}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="field">
                        Temperatura
                        <input
                          defaultValue={activeVersion?.temperature ?? 0.5}
                          max="2"
                          min="0"
                          name="temperature"
                          required
                          step="0.1"
                          type="number"
                        />
                      </label>
                      <label className="field">
                        Tokens máximos
                        <input
                          defaultValue={activeVersion?.maxTokens ?? 500}
                          min="50"
                          name="maxTokens"
                          required
                          type="number"
                        />
                      </label>
                      <label className="field">
                        Proveedor preferido (opcional)
                        <input
                          defaultValue={activeVersion?.preferredProviderKey ?? ''}
                          name="preferredProviderKey"
                        />
                      </label>
                    </div>
                    <button className="button button-primary justify-self-start" type="submit">
                      Guardar versión
                    </button>
                  </form>

                  {detail.versions.length > 0 ? (
                    <div>
                      <p className="text-sm font-semibold text-forest">Historial</p>
                      <ul className="mt-2 grid gap-2">
                        {detail.versions.map((version) => (
                          <li
                            className="flex items-center justify-between rounded-xl border border-forest/10 p-3 text-sm"
                            key={version.id}
                          >
                            <span>
                              v{version.version} · temp {version.temperature} · {version.maxTokens}{' '}
                              tokens
                            </span>
                            {version.id === detail.activeVersionId ? (
                              <span className="text-xs font-semibold text-forest">Activa</span>
                            ) : (
                              <button
                                className="button button-secondary"
                                onClick={() => void activate(version.id)}
                                type="button"
                              >
                                Activar
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6">
                    <p className="text-sm font-semibold text-forest">Probar</p>
                    <p className="mt-1 text-xs text-ink-muted">
                      Una variable por línea, formato <code>nombre: valor</code>.
                    </p>
                    <textarea
                      onChange={(event) => setVariablesText(event.target.value)}
                      placeholder={'style: cordial\ntext: gracias x la compra'}
                      rows={4}
                      value={variablesText}
                    />
                    <button
                      className="button button-primary mt-3"
                      disabled={running || !detail.activeVersionId}
                      onClick={() => void runTask()}
                      type="button"
                    >
                      {running ? 'Ejecutando…' : 'Ejecutar'}
                    </button>

                    {runResult ? (
                      <div className="mt-4 rounded-xl border border-forest/10 bg-white p-4 text-sm">
                        <p className="text-ink-muted">
                          {runResult.providerKey} · {runResult.model} · v{runResult.promptVersion}
                        </p>
                        <pre className="mt-2 whitespace-pre-wrap font-sans text-forest">
                          {typeof runResult.output === 'string'
                            ? runResult.output
                            : JSON.stringify(runResult.output, null, 2)}
                        </pre>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
