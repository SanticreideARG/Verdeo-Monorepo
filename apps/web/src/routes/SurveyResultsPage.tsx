import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface SurveyResults {
  questions: {
    answerCounts: { count: number; value: string }[];
    prompt: string;
    questionId: string;
  }[];
  responseCount: number;
  sentCount: number;
  title: string;
}

/** Resultados agregados por pregunta — un conteo por valor de respuesta, sin exponer qué cliente
 * dijo qué (aunque el token internamente sí queda ligado a un cliente, para poder cruzar
 * historial si hiciera falta desde el propio registro de auditoría). */
export function SurveyResultsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const { id } = useParams<{ id: string }>();
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const canRead = profile?.permissions.includes('surveys.read') ?? false;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const response = await apiRequest(`/api/v1/surveys/${id}/results`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      setLoading(false);
      return;
    }
    setResults((await response.json()) as SurveyResults);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  if (failed) return <DashboardFailed label="los resultados" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Resultados</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Encuestas</p>
            <h1 className="text-2xl font-semibold text-forest">
              {results ? results.title : 'Resultados'}
            </h1>
          </div>
          <Link className="button button-secondary" to="/app/encuestas">
            Volver a Encuestas
          </Link>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : results ? (
          <>
            <p className="mt-4 text-sm text-ink-muted">
              {results.sentCount} enviadas · {results.responseCount} respondidas
              {results.sentCount > 0
                ? ` (${Math.round((results.responseCount / results.sentCount) * 100)}%)`
                : ''}
            </p>
            <div className="mt-6 grid gap-4">
              {results.questions.map((question) => (
                <article className="operation-card" key={question.questionId}>
                  <p className="font-semibold text-forest">{question.prompt}</p>
                  {question.answerCounts.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-muted">Sin respuestas todavía.</p>
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {question.answerCounts.map((answer) => (
                        <div className="flex items-center justify-between gap-3" key={answer.value}>
                          <span className="text-sm">{answer.value}</span>
                          <strong>{answer.count}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </DashboardShell>
  );
}
