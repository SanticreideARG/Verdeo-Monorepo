import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toDataURL } from 'qrcode';

import { DeskWorkNotice } from '../components/DeskWorkNotice.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type CustomerSummary } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface QuestionDraft {
  allowMultiple: boolean;
  options: string;
  prompt: string;
  required: boolean;
}

interface SurveySummary {
  active: boolean;
  createdAt: string;
  id: string;
  responseCount: number;
  sentCount: number;
  title: string;
}

interface SurveyDetail extends SurveySummary {
  description: string | null;
  questions: {
    allowMultiple: boolean;
    id: string;
    options: string[];
    prompt: string;
    required: boolean;
  }[];
}

const EMPTY_QUESTION: QuestionDraft = {
  allowMultiple: false,
  options: '',
  prompt: '',
  required: true,
};

function questionsToDrafts(questions: SurveyDetail['questions']): QuestionDraft[] {
  return questions.map((question) => ({
    allowMultiple: question.allowMultiple,
    options: question.options.join('\n'),
    prompt: question.prompt,
    required: question.required,
  }));
}

function draftsToPayload(drafts: QuestionDraft[]) {
  return drafts
    .filter((draft) => draft.prompt.trim())
    .map((draft) => ({
      allowMultiple: draft.allowMultiple,
      options: draft.options
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
      prompt: draft.prompt.trim(),
      required: draft.required,
    }));
}

/** "Encuestas": editor de preguntas (texto libre o de opciones), envío 1:1 por token de un solo
 * uso a un cliente puntual, y enlace a resultados agregados por pregunta. Nueva sección de
 * Fase 10 — ver IMPLEMENTATION_ROADMAP.md. */
export function SurveysPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [surveys, setSurveys] = useState<SurveySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionDraft[]>([{ ...EMPTY_QUESTION }]);
  const [active, setActive] = useState(true);

  const [sendingFor, setSendingFor] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerSummary[]>([]);
  const [sentLink, setSentLink] = useState<{ qrDataUrl: string; url: string } | null>(null);

  const canRead = profile?.permissions.includes('surveys.read') ?? false;
  const canManage = profile?.permissions.includes('surveys.manage') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest('/api/v1/surveys');
    if (response.ok) {
      setSurveys(((await response.json()) as { items: SurveySummary[] }).items);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  function startCreate() {
    setIsCreating(true);
    setEditingId(null);
    setTitle('');
    setDescription('');
    setQuestions([{ ...EMPTY_QUESTION }]);
    setActive(true);
    setMessage('');
  }

  async function startEdit(id: string) {
    setMessage('');
    const response = await apiRequest(`/api/v1/surveys/${id}`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const survey = (await response.json()) as SurveyDetail;
    setIsCreating(false);
    setEditingId(id);
    setTitle(survey.title);
    setDescription(survey.description ?? '');
    setQuestions(questionsToDrafts(survey.questions));
    setActive(survey.active);
  }

  async function save() {
    const payloadQuestions = draftsToPayload(questions);
    if (!title.trim() || payloadQuestions.length === 0) {
      setMessage('Cargá un título y al menos una pregunta.');
      return;
    }
    setMessage('');
    const body = JSON.stringify({
      active,
      description: description.trim() ? description.trim() : null,
      questions: payloadQuestions,
      title: title.trim(),
    });
    const response = isCreating
      ? await apiRequest('/api/v1/surveys', { body, method: 'POST' })
      : await apiRequest(`/api/v1/surveys/${editingId}`, { body, method: 'PATCH' });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setIsCreating(false);
    setEditingId(null);
    await load();
  }

  async function searchCustomers() {
    if (!customerQuery.trim()) {
      setCustomerResults([]);
      return;
    }
    const response = await apiRequest(
      `/api/v1/customers?search=${encodeURIComponent(customerQuery.trim())}&limit=10`,
    );
    if (response.ok) {
      setCustomerResults(((await response.json()) as { items: CustomerSummary[] }).items);
    }
  }

  async function sendTo(customerId: string) {
    if (!sendingFor) return;
    setMessage('');
    const response = await apiRequest(`/api/v1/surveys/${sendingFor}/send`, {
      body: JSON.stringify({ customerId }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const { publicUrl } = (await response.json()) as { publicUrl: string; token: string };
    const qrDataUrl = await toDataURL(publicUrl, { margin: 1, width: 220 });
    setSentLink({ qrDataUrl, url: publicUrl });
    setCustomerQuery('');
    setCustomerResults([]);
    await load();
  }

  if (failed) return <DashboardFailed label="las encuestas" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Encuestas</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <DeskWorkNotice can="podés ver resultados; armar una encuesta pide varios campos a la vez." />
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">Clientes</p>
            <h1 className="text-2xl font-semibold text-forest">Encuestas</h1>
          </div>
          {canManage ? (
            <button className="button button-primary" onClick={startCreate} type="button">
              Nueva encuesta
            </button>
          ) : null}
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {isCreating || editingId ? (
          <div className="operation-card mt-6 grid gap-4">
            <label className="field">
              Título
              <input onChange={(event) => setTitle(event.target.value)} value={title} />
            </label>
            <label className="field">
              Descripción
              <textarea
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                value={description}
              />
            </label>
            {!isCreating ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                  type="checkbox"
                />
                Activa (aceptando envíos)
              </label>
            ) : null}

            <div className="grid gap-3">
              <p className="text-sm font-semibold text-forest">Preguntas</p>
              {questions.map((question, index) => (
                <div className="rounded-xl border border-forest/10 p-3" key={index}>
                  <label className="field">
                    Pregunta
                    <input
                      onChange={(event) =>
                        setQuestions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, prompt: event.target.value } : item,
                          ),
                        )
                      }
                      value={question.prompt}
                    />
                  </label>
                  <label className="field mt-2">
                    Opciones (una por línea — vacío = respuesta de texto libre)
                    <textarea
                      onChange={(event) =>
                        setQuestions((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, options: event.target.value } : item,
                          ),
                        )
                      }
                      rows={2}
                      value={question.options}
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        checked={question.required}
                        onChange={(event) =>
                          setQuestions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, required: event.target.checked }
                                : item,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      Obligatoria
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        checked={question.allowMultiple}
                        onChange={(event) =>
                          setQuestions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, allowMultiple: event.target.checked }
                                : item,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      Permite elegir varias
                    </label>
                    {questions.length > 1 ? (
                      <button
                        className="text-red-600"
                        onClick={() =>
                          setQuestions((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          )
                        }
                        type="button"
                      >
                        Quitar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              <button
                className="button button-secondary justify-self-start"
                onClick={() => setQuestions((current) => [...current, { ...EMPTY_QUESTION }])}
                type="button"
              >
                Agregar pregunta
              </button>
            </div>

            <div className="flex gap-2">
              <button className="button button-primary" onClick={() => void save()} type="button">
                Guardar
              </button>
              <button
                className="button button-secondary"
                onClick={() => {
                  setIsCreating(false);
                  setEditingId(null);
                }}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {sendingFor ? (
          <div className="operation-card mt-6 grid gap-3">
            <p className="text-sm font-semibold text-forest">Enviar a un cliente</p>
            <div className="flex gap-2">
              <input
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Nombre o número"
                value={customerQuery}
              />
              <button
                className="button button-secondary"
                onClick={() => void searchCustomers()}
                type="button"
              >
                Buscar
              </button>
            </div>
            <div className="grid gap-2">
              {customerResults.map((customer) => (
                <button
                  className="operation-card text-left"
                  key={customer.id}
                  onClick={() => void sendTo(customer.id)}
                  type="button"
                >
                  {customer.displayName}
                </button>
              ))}
            </div>

            {sentLink ? (
              <div className="mt-2 grid gap-2 rounded-xl border border-forest/10 p-3">
                <p className="text-sm font-semibold text-forest">Enlace generado</p>
                <p className="break-all text-sm text-ink-muted">{sentLink.url}</p>
                <img
                  alt="Código QR de la encuesta"
                  className="h-40 w-40"
                  src={sentLink.qrDataUrl}
                />
              </div>
            ) : null}

            <button
              className="button button-secondary justify-self-start"
              onClick={() => {
                setSendingFor(null);
                setSentLink(null);
                setCustomerResults([]);
                setCustomerQuery('');
              }}
              type="button"
            >
              Cerrar
            </button>
          </div>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="mt-6 grid gap-3">
            {surveys.map((survey) => (
              <article className="operation-card" key={survey.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-forest">{survey.title}</p>
                    <p className="text-sm text-ink-muted">
                      {survey.active ? 'Activa' : 'Desactivada'} · {survey.sentCount} enviadas ·{' '}
                      {survey.responseCount} respondidas
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canManage ? (
                      <button
                        className="button button-secondary"
                        onClick={() => void startEdit(survey.id)}
                        type="button"
                      >
                        Editar
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        className="button button-secondary"
                        onClick={() => {
                          setSendingFor(survey.id);
                          setSentLink(null);
                        }}
                        type="button"
                      >
                        Enviar
                      </button>
                    ) : null}
                    <Link
                      className="button button-secondary"
                      to={`/app/encuestas/${survey.id}/resultados`}
                    >
                      Resultados
                    </Link>
                  </div>
                </div>
              </article>
            ))}
            {surveys.length === 0 ? <p className="empty-state">Todavía no hay encuestas.</p> : null}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
