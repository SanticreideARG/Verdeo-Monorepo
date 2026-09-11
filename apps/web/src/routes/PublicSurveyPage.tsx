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

/**
 * De qué clase de enlace se llegó, que cambia tres cosas y ninguna más.
 *
 * - **`envio`**: el enlace 1:1 que se le manda a un cliente. Es de un solo uso y el servidor lo
 *   sabe: ya respondida, la encuesta deja de abrirse para ese token.
 * - **`enlace`**: el enlace público compartido, anónimo. El mismo lo abren veinte personas, así que
 *   el servidor no puede saber quién ya contestó y el freno al segundo envío vive en el navegador.
 *
 * Comparten todo lo demás —la encuesta, las preguntas, el formulario— y por eso es una variante y
 * no dos páginas: dos copias de esto se separarían en un mes y una de las dos empezaría a mostrar
 * las preguntas distinto.
 */
type Variant = 'enlace' | 'envio';

/**
 * La marca de que este navegador ya respondió.
 *
 * Es honesto decir qué es y qué no: evita el doble envío por error y el "¿ya lo mandé?" cuando la
 * página se recarga, que es el problema real. No pretende impedir que alguien decidido vote dos
 * veces —vaciar el almacenamiento del sitio alcanza—, y no puede: impedirlo de verdad exige
 * identificar a quien responde, que es exactamente lo que un enlace anónimo viene a evitar.
 */
function answeredKey(token: string): string {
  return `verdeo-encuesta-${token}`;
}

function alreadyAnswered(token: string): boolean {
  try {
    return window.localStorage.getItem(answeredKey(token)) !== null;
  } catch {
    // Ventana privada o almacenamiento bloqueado: se deja responder. Perder una respuesta por no
    // poder escribir una marca sería peor que registrar una de más.
    return false;
  }
}

function rememberAnswered(token: string): void {
  try {
    window.localStorage.setItem(answeredKey(token), new Date().toISOString());
  } catch {
    // Ídem: si no se puede guardar, la encuesta igual se envió.
  }
}

/**
 * La encuesta, sin nada alrededor.
 *
 * Un minisitio: se entra por un enlace, se responde, se agradece, y ahí termina la navegación. No
 * hay menú, no hay pie, y en el enlace compartido la marca ni siquiera lleva a la home — quien
 * llegó por un mensaje de WhatsApp vino a contestar cinco preguntas, no a recorrer un sitio.
 *
 * Una pregunta sin opciones se dibuja como texto libre; una con opciones, como radio o casillas
 * según `allowMultiple`. No hay ningún catálogo de "tipos de pregunta": la forma sale del dato.
 */
export function PublicSurveyPage({ variant = 'envio' }: { variant?: Variant }) {
  const { token } = useParams<{ token: string }>();
  const [survey, setSurvey] = useState<PublicSurvey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Este navegador ya respondió: se resuelve antes de pedir nada, así no se muestra un formulario
  // que después no se va a poder enviar.
  const [answeredHere, setAnsweredHere] = useState(
    () => variant === 'enlace' && token !== undefined && alreadyAnswered(token),
  );

  const basePath = variant === 'enlace' ? '/api/v1/public/surveys/link' : '/api/v1/public/surveys';

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const response = await apiRequest(`${basePath}/${token}`);
    if (!response.ok) {
      if (response.status === 404) setNotFound(true);
      else setMessage(await errorMessage(response));
      setLoading(false);
      return;
    }
    setSurvey((await response.json()) as PublicSurvey);
    setLoading(false);
  }, [basePath, token]);

  useEffect(() => {
    if (answeredHere) {
      setLoading(false);
      return;
    }
    void load();
  }, [answeredHere, load]);

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
    const response = await apiRequest(`${basePath}/${token}/submit`, {
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
    // La marca se escribe después de que el servidor confirmó, nunca antes: si se guardara primero
    // y el envío fallara, la persona quedaría sin poder responder algo que nunca se registró.
    if (variant === 'enlace') rememberAnswered(token);
    setSubmitted(true);
  }

  const brand = (
    <>
      <img className="brand-icon" src="/brand/verdeo-icon-128.webp" alt="" width="36" height="36" />
      verdeo<span>.</span>
    </>
  );

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        {/* En el enlace compartido la marca no navega: el minisitio es sólo la encuesta. */}
        {variant === 'enlace' ? (
          <span className="brand">{brand}</span>
        ) : (
          <Link className="brand" to="/">
            {brand}
          </Link>
        )}
      </header>
      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-6 sm:px-8">
        {loading ? <p className="text-ink-muted">Cargando…</p> : null}

        {answeredHere && !submitted ? (
          <section className="rounded-[2rem] border border-forest/10 bg-white p-6 shadow-sm sm:p-8">
            <p className="eyebrow">Encuesta</p>
            <h1 className="mt-2 text-2xl font-semibold text-forest">
              Ya respondiste esta encuesta
            </h1>
            <p className="mt-3 text-ink-muted">Gracias por haber participado.</p>
            {/* Sin drama si alguien tiene que corregir algo: se dice cómo, en vez de dejarlo
                golpeando contra una puerta cerrada. */}
            <button
              className="button button-secondary mt-5"
              onClick={() => setAnsweredHere(false)}
              type="button"
            >
              Responder de nuevo
            </button>
          </section>
        ) : null}

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
            <p className="eyebrow">¡Gracias por participar!</p>
            <h1 className="mt-2 text-2xl font-semibold text-forest">Recibimos tu respuesta</h1>
            <p className="mt-3 text-ink-muted">
              Ya está: no hace falta que hagas nada más. Podés cerrar esta página.
            </p>
          </section>
        ) : null}

        {survey && !submitted && !answeredHere ? (
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
