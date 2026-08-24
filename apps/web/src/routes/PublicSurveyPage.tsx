import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';

interface PublicSurveyQuestion {
  allowMultiple: boolean;
  id: string;
  options: string[];
  prompt: string;
  required: boolean;
}

interface PublicSurvey {
  description: string | null;
  questions: PublicSurveyQuestion[];
  title: string;
}

/** Public, unauthenticated survey — reached only via the per-customer single-use token a
 * `surveys.manage` user sends. `public/survey/:token`, per the original request. A question with
 * no options renders as free text; one with options renders as radio (single) or checkboxes
 * (multi) — fully data-driven, there is no hardcoded question "kind". */
export function PublicSurveyPage() {
  const { token } = useParams<{ token: string }>();
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const response = await apiRequest(`/api/v1/public/surveys/${token}`);
    if (!response.ok) {
      if (response.status === 404) setNotFound(true);
      else setMessage(await errorMessage(response));
      setLoading(false);
      return;
    }
    setSurvey((await response.json()) as PublicSurvey);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function setText(questionId: string, value: string) {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  }

  function toggleChoice(questionId: string, option: string, allowMultiple: boolean) {
    setAnswers((current) => {
      if (!allowMultiple) return { ...current, [questionId]: option };
      const existing = current[questionId];
      const values = Array.isArray(existing) ? existing : [];
      const next = values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option];
      return { ...current, [questionId]: next };
    });
  }

  async function submit() {
    if (!survey || !token) return;
    const missing = survey.questions.some((question) => {
      if (!question.required) return false;
      const value = answers[question.id];
      return value === undefined || (Array.isArray(value) && value.length === 0) || value === '';
    });
    if (missing) {
      setMessage('Respondé todas las preguntas obligatorias.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    const response = await apiRequest(`/api/v1/public/surveys/${token}/submit`, {
      body: JSON.stringify({
        answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
      }),
      method: 'POST',
    });
    setSubmitting(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link className="brand" to="/">
          <img className="brand-icon" src="/brand/verdeo-icon.png" alt="" width="36" height="36" />
          verdeo<span>.</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6 sm:px-8">
        {loading ? <p className="text-ink-muted">Cargando…</p> : null}

        {notFound ? (
          <section className="rounded-[2rem] border border-forest/10 bg-white p-6 shadow-sm sm:p-8">
            <p className="eyebrow">Encuesta</p>
            <h1 className="mt-2 text-2xl font-semibold text-forest">
              Este enlace ya no está disponible
            </h1>
            <p className="mt-3 text-ink-muted">
              Puede que ya la hayas respondido o que el enlace ya no sea válido.
            </p>
          </section>
        ) : null}

        {submitted ? (
          <section className="rounded-[2rem] border border-forest/10 bg-white p-6 shadow-sm sm:p-8">
            <p className="eyebrow">¡Gracias!</p>
            <h1 className="mt-2 text-2xl font-semibold text-forest">Recibimos tu respuesta</h1>
          </section>
        ) : null}

        {survey && !submitted ? (
          <>
            <p className="eyebrow">Encuesta</p>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-forest sm:text-4xl">
              {survey.title}
            </h1>
            {survey.description ? (
              <p className="mt-3 max-w-lg leading-7 text-ink-muted">{survey.description}</p>
            ) : null}

            <div className="mt-8 grid gap-6">
              {survey.questions.map((question) => (
                <div
                  className="rounded-[2rem] border border-forest/10 bg-white p-6 shadow-sm"
                  key={question.id}
                >
                  <p className="font-semibold text-forest">
                    {question.prompt}
                    {question.required ? <span className="text-red-600"> *</span> : null}
                  </p>
                  {question.options.length === 0 ? (
                    <textarea
                      className="mt-3 w-full"
                      onChange={(event) => setText(question.id, event.target.value)}
                      rows={3}
                      value={typeof answers[question.id] === 'string' ? answers[question.id] : ''}
                    />
                  ) : (
                    <div className="mt-3 grid gap-2">
                      {question.options.map((option) => {
                        const value = answers[question.id];
                        const checked = question.allowMultiple
                          ? Array.isArray(value) && value.includes(option)
                          : value === option;
                        return (
                          <label className="flex items-center gap-2 text-sm" key={option}>
                            <input
                              checked={checked}
                              name={question.id}
                              onChange={() =>
                                toggleChoice(question.id, option, question.allowMultiple)
                              }
                              type={question.allowMultiple ? 'checkbox' : 'radio'}
                            />
                            {option}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}
            <button
              className="button button-primary button-large mt-6"
              disabled={submitting}
              onClick={() => void submit()}
              type="button"
            >
              {submitting ? 'Enviando…' : 'Enviar respuestas'}
            </button>
          </>
        ) : null}
      </main>
    </div>
  );
}
