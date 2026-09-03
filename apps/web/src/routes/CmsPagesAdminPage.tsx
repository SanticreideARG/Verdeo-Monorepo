import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react';

import { CmsSection } from '../components/CmsSections.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

type Section = { id: string; type: string } & Record<string, unknown>;

interface PageSummary {
  id: string;
  publishedAt: string | null;
  slug: string;
  title: string;
}

interface PageRevision {
  createdAt: string;
  createdByDisplayName: string | null;
  id: string;
  revision: number;
  sections?: Section[];
}

interface PageDetail {
  draft: PageRevision;
  id: string;
  published: PageRevision | null;
  slug: string;
  title: string;
}

const SECTION_TYPES = [
  'HERO',
  'HERO_ROTATOR',
  'TEXT',
  'IMAGE_TEXT',
  'STEPS',
  'CAROUSEL',
  'WEEKLY_MENU',
  'CTA',
  'FAQ',
  'DELIVERY_ZONES',
  'CONTACT',
  'GALLERY',
  'CUSTOM',
] as const;

function newSection(type: string): Section {
  const id = `sec-${Date.now()}-${Math.round(Math.random() * 100_000)}`;
  switch (type) {
    case 'HERO':
      return { headline: 'Título', id, type };
    case 'HERO_ROTATOR':
      return { id, kicker: '', type, words: ['cuida tu salud'] };
    case 'TEXT':
      return { body: 'Texto', id, type };
    case 'IMAGE_TEXT':
      return { body: 'Texto', id, imagePosition: 'right', imageUrl: '', type };
    case 'STEPS':
      return { id, steps: [{ body: '', number: '01', title: '' }], type };
    case 'CAROUSEL':
      return { id, slides: [{ caption: '', imageUrl: '' }], type };
    case 'CTA':
      return { buttonHref: '/pedido', buttonLabel: 'Hacer un pedido', heading: 'Título', id, type };
    case 'FAQ':
      return { id, items: [{ answer: '', question: '' }], type };
    case 'CONTACT':
      return { coverage: [], id, regions: [], type };
    case 'GALLERY':
      return { id, images: [{ url: '' }], type };
    case 'CUSTOM':
      return { html: '<p></p>', id, type };
    default:
      return { id, type };
  }
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/** "Contenidos" (Administración): typed pages for the public site, not a generic HTML editor.
 * WEEKLY_MENU and DELIVERY_ZONES sections have no fields — they render live on the landing page. */
export function CmsPagesAdminPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [pages, setPages] = useState<PageSummary[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [detail, setDetail] = useState<PageDetail | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [revisions, setRevisions] = useState<PageRevision[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [pageFormOpen, setPageFormOpen] = useState(false);
  const [addingType, setAddingType] = useState<string>('HERO');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const canEdit = profile?.permissions.includes('cms.edit') ?? false;
  const canPublish = profile?.permissions.includes('cms.publish') ?? false;

  const loadPages = useCallback(async () => {
    const response = await apiRequest('/api/v1/cms/pages');
    if (response.ok) setPages(((await response.json()) as { items: PageSummary[] }).items);
  }, []);

  useEffect(() => {
    if (!profile?.permissions.includes('cms.read')) {
      setLoading(false);
      return;
    }
    void loadPages().finally(() => setLoading(false));
  }, [loadPages, profile]);

  const loadDetail = useCallback(async (slug: string) => {
    setMessage('');
    const response = await apiRequest(`/api/v1/cms/pages/${slug}`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const loaded = (await response.json()) as PageDetail;
    setDetail(loaded);
    setSections(loaded.draft.sections ?? []);
    const revisionsResponse = await apiRequest(`/api/v1/cms/pages/${slug}/revisions`);
    if (revisionsResponse.ok) {
      setRevisions(((await revisionsResponse.json()) as { items: PageRevision[] }).items);
    }
  }, []);

  async function selectPage(slug: string) {
    setSelectedSlug(slug);
    await loadDetail(slug);
  }

  async function createPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const slug = formText(form, 'slug').trim();
    const title = formText(form, 'title').trim();
    if (!slug || !title) return;
    setMessage('');
    const response = await apiRequest('/api/v1/cms/pages', {
      body: JSON.stringify({ slug, title }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    event.currentTarget.reset();
    setPageFormOpen(false);
    await loadPages();
    await selectPage(slug);
  }

  async function saveDraft() {
    if (!selectedSlug) return;
    setMessage('');
    const response = await apiRequest(`/api/v1/cms/pages/${selectedSlug}/draft`, {
      body: JSON.stringify({ sections }),
      method: 'PUT',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage('Borrador guardado.');
    await loadDetail(selectedSlug);
  }

  async function publishRevision(revisionId: string) {
    if (!selectedSlug) return;
    setMessage('');
    const response = await apiRequest(`/api/v1/cms/pages/${selectedSlug}/publish`, {
      body: JSON.stringify({ revisionId }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage('Página publicada.');
    await loadDetail(selectedSlug);
    await loadPages();
  }

  function addSection() {
    setSections((current) => [...current, newSection(addingType)]);
  }

  function updateSection(id: string, patch: Record<string, unknown>) {
    setSections((current) =>
      current.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    );
  }

  function removeSection(id: string) {
    setSections((current) => current.filter((section) => section.id !== id));
  }

  function moveSection(id: string, direction: -1 | 1) {
    setSections((current) => {
      const index = current.findIndex((section) => section.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (!moved) return current;
      next.splice(target, 0, moved);
      return next;
    });
  }

  // Native HTML5 drag-and-drop — no library, matching how the rest of this app avoids extra
  // dependencies. The ↑/↓ buttons stay as the keyboard-accessible way to reorder; dragging is
  // additive, not a replacement.
  function reorderSection(draggedSectionId: string, overSectionId: string) {
    if (draggedSectionId === overSectionId) return;
    setSections((current) => {
      const from = current.findIndex((section) => section.id === draggedSectionId);
      const to = current.findIndex((section) => section.id === overSectionId);
      if (from === -1 || to === -1) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      if (!moved) return current;
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    const response = await apiRequest('/api/v1/cms/media', {
      body: file,
      headers: { 'content-type': file.type },
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const asset = (await response.json()) as { url: string };
    setUploadedUrl(asset.url);
    setMessage('Imagen subida. Copiá la URL para usarla en una sección.');
  }

  if (failed) return <DashboardFailed label="los contenidos" />;
  if (!profile) return <DashboardLoading />;

  if (!profile.permissions.includes('cms.read')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Contenidos</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver contenidos.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Administración</p>
          <h1 className="text-2xl font-semibold text-forest">Contenidos</h1>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)]">
            <div>
              <div className="grid gap-2">
                {pages.map((page) => (
                  <button
                    className={`operation-card text-left ${page.slug === selectedSlug ? 'border-forest' : ''}`}
                    key={page.id}
                    onClick={() => void selectPage(page.slug)}
                    type="button"
                  >
                    <strong className="block">{page.title}</strong>
                    <small className="text-ink-muted">
                      /{page.slug} · {page.publishedAt ? 'publicada' : 'sin publicar'}
                    </small>
                  </button>
                ))}
                {pages.length === 0 ? <p className="empty-state">Sin páginas todavía.</p> : null}
              </div>

              {canEdit ? (
                <>
                  <button
                    className="button button-secondary mt-4"
                    onClick={() => setPageFormOpen((current) => !current)}
                    type="button"
                  >
                    {pageFormOpen ? 'Cerrar' : '+ Nueva página'}
                  </button>
                  {pageFormOpen ? (
                    <form
                      className="mt-3 grid gap-3 rounded-xl border border-forest/15 p-4"
                      onSubmit={(event) => void createPage(event)}
                    >
                      <label className="field">
                        Título
                        <input name="title" required />
                      </label>
                      <label className="field">
                        Slug
                        <input name="slug" placeholder="home" required />
                      </label>
                      <button className="button button-primary" type="submit">
                        Crear
                      </button>
                    </form>
                  ) : null}
                </>
              ) : null}

              {canEdit ? (
                <div className="mt-6 rounded-xl border border-forest/15 p-4">
                  <p className="text-sm font-semibold text-forest">Imágenes</p>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => void uploadImage(event)}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    className="button button-secondary mt-2"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    Subir imagen
                  </button>
                  {uploadedUrl ? (
                    <input className="mt-2 w-full text-xs" readOnly value={uploadedUrl} />
                  ) : null}
                </div>
              ) : null}
            </div>

            <div>
              {!detail ? (
                <p className="empty-state">Elegí una página para editar su contenido.</p>
              ) : (
                <>
                  <div className="operation-card flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xl font-semibold text-forest">{detail.title}</h2>
                      <p className="text-sm text-ink-muted">
                        Borrador: revisión #{detail.draft.revision} · Publicado:{' '}
                        {detail.published ? `revisión #${detail.published.revision}` : 'nunca'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="button button-secondary"
                        onClick={() => setPreviewOpen((current) => !current)}
                        type="button"
                      >
                        {previewOpen ? 'Ocultar vista previa' : 'Vista previa'}
                      </button>
                      {canEdit ? (
                        <button
                          className="button button-secondary"
                          onClick={() => void saveDraft()}
                          type="button"
                        >
                          Guardar borrador
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {previewOpen ? (
                    <div className="cms-preview mt-4">
                      <p className="cms-preview-label">
                        Vista previa del borrador — así se ve con lo guardado hasta ahora en cada
                        sección, sin publicar.
                      </p>
                      <div className="cms-preview-frame">
                        {sections.map((section) => (
                          <CmsSection key={section.id} section={section} />
                        ))}
                        {sections.length === 0 ? (
                          <p className="p-8 text-center text-ink-muted">Sin secciones todavía.</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3">
                    {sections.map((section, index) => (
                      <article
                        className={`operation-card ${draggedId === section.id ? 'is-dragging' : ''}`}
                        draggable={canEdit}
                        key={section.id}
                        onDragEnd={() => setDraggedId(null)}
                        onDragOver={(event: DragEvent<HTMLElement>) => {
                          if (canEdit) event.preventDefault();
                        }}
                        onDragStart={() => setDraggedId(section.id)}
                        onDrop={(event: DragEvent<HTMLElement>) => {
                          event.preventDefault();
                          if (draggedId) reorderSection(draggedId, section.id);
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2">
                            {canEdit ? (
                              <span
                                aria-hidden="true"
                                className="cms-drag-handle"
                                title="Arrastrar"
                              >
                                ⠿
                              </span>
                            ) : null}
                            <strong>{section.type}</strong>
                          </span>
                          {canEdit ? (
                            <div className="flex gap-2">
                              <button
                                className="button button-secondary"
                                disabled={index === 0}
                                onClick={() => moveSection(section.id, -1)}
                                type="button"
                              >
                                ↑
                              </button>
                              <button
                                className="button button-secondary"
                                disabled={index === sections.length - 1}
                                onClick={() => moveSection(section.id, 1)}
                                type="button"
                              >
                                ↓
                              </button>
                              <button
                                className="button button-secondary"
                                onClick={() => removeSection(section.id)}
                                type="button"
                              >
                                Quitar
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <label className="field mt-3 text-xs">
                          Ancla para el navbar (opcional — p.ej. section-menu)
                          <input
                            disabled={!canEdit}
                            onChange={(event) =>
                              updateSection(section.id, { anchorId: event.target.value.trim() })
                            }
                            placeholder="section-nosotros"
                            value={typeof section.anchorId === 'string' ? section.anchorId : ''}
                          />
                        </label>
                        <SectionFields
                          disabled={!canEdit}
                          onChange={(patch) => updateSection(section.id, patch)}
                          section={section}
                        />
                      </article>
                    ))}
                    {sections.length === 0 ? (
                      <p className="empty-state">Sin secciones. Agregá la primera abajo.</p>
                    ) : null}
                  </div>

                  {canEdit ? (
                    <div className="mt-4 flex flex-wrap items-end gap-3">
                      <label className="field">
                        Nueva sección
                        <select
                          onChange={(event) => setAddingType(event.target.value)}
                          value={addingType}
                        >
                          {SECTION_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        className="button button-secondary"
                        onClick={addSection}
                        type="button"
                      >
                        Agregar sección
                      </button>
                    </div>
                  ) : null}

                  {canPublish ? (
                    <div className="mt-6 operation-card">
                      <h3 className="font-semibold text-forest">Historial y publicación</h3>
                      <div className="mt-3 grid gap-2">
                        {revisions.map((revision) => (
                          <div
                            className="flex items-center justify-between gap-3 rounded-xl border border-forest/10 p-3 text-sm"
                            key={revision.id}
                          >
                            <span>
                              #{revision.revision} · {timeLabel(revision.createdAt)} ·{' '}
                              {revision.createdByDisplayName ?? 'Sistema'}
                              {detail.published?.id === revision.id ? ' · publicada' : ''}
                            </span>
                            <button
                              className="button button-secondary"
                              disabled={detail.published?.id === revision.id}
                              onClick={() => void publishRevision(revision.id)}
                              type="button"
                            >
                              {detail.published?.id === revision.id ? 'Publicada' : 'Publicar'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}

function SectionFields({
  disabled,
  onChange,
  section,
}: {
  disabled: boolean;
  onChange: (patch: Record<string, unknown>) => void;
  section: Section;
}) {
  const field = (key: string) => (typeof section[key] === 'string' ? section[key] : '');

  switch (section.type) {
    case 'HERO':
      return (
        <div className="mt-3 grid gap-2">
          <input
            disabled={disabled}
            onChange={(event) => onChange({ headline: event.target.value })}
            placeholder="Título"
            value={field('headline')}
          />
          <input
            disabled={disabled}
            onChange={(event) => onChange({ subheadline: event.target.value })}
            placeholder="Subtítulo (opcional)"
            value={field('subheadline')}
          />
          <input
            disabled={disabled}
            onChange={(event) => onChange({ imageUrl: event.target.value })}
            placeholder="URL de imagen (opcional)"
            value={field('imageUrl')}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              disabled={disabled}
              onChange={(event) => onChange({ ctaLabel: event.target.value })}
              placeholder="Texto del botón (opcional)"
              value={field('ctaLabel')}
            />
            <input
              disabled={disabled}
              onChange={(event) => onChange({ ctaHref: event.target.value })}
              placeholder="Enlace del botón"
              value={field('ctaHref')}
            />
          </div>
        </div>
      );
    case 'TEXT':
      return (
        <div className="mt-3 grid gap-2">
          <input
            disabled={disabled}
            onChange={(event) => onChange({ heading: event.target.value })}
            placeholder="Título (opcional)"
            value={field('heading')}
          />
          <textarea
            disabled={disabled}
            onChange={(event) => onChange({ body: event.target.value })}
            rows={4}
            value={field('body')}
          />
        </div>
      );
    case 'IMAGE_TEXT':
      return (
        <div className="mt-3 grid gap-2">
          <input
            disabled={disabled}
            onChange={(event) => onChange({ heading: event.target.value })}
            placeholder="Título (opcional)"
            value={field('heading')}
          />
          <textarea
            disabled={disabled}
            onChange={(event) => onChange({ body: event.target.value })}
            rows={3}
            value={field('body')}
          />
          <input
            disabled={disabled}
            onChange={(event) => onChange({ imageUrl: event.target.value })}
            placeholder="URL de imagen"
            value={field('imageUrl')}
          />
          <select
            disabled={disabled}
            onChange={(event) => onChange({ imagePosition: event.target.value })}
            value={field('imagePosition') || 'right'}
          >
            <option value="left">Imagen a la izquierda</option>
            <option value="right">Imagen a la derecha</option>
          </select>
        </div>
      );
    case 'CTA':
      return (
        <div className="mt-3 grid gap-2">
          <input
            disabled={disabled}
            onChange={(event) => onChange({ heading: event.target.value })}
            placeholder="Título"
            value={field('heading')}
          />
          <textarea
            disabled={disabled}
            onChange={(event) => onChange({ body: event.target.value })}
            placeholder="Texto (opcional)"
            rows={2}
            value={field('body')}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              disabled={disabled}
              onChange={(event) => onChange({ buttonLabel: event.target.value })}
              placeholder="Texto del botón"
              value={field('buttonLabel')}
            />
            <input
              disabled={disabled}
              onChange={(event) => onChange({ buttonHref: event.target.value })}
              placeholder="Enlace"
              value={field('buttonHref')}
            />
          </div>
        </div>
      );
    case 'WEEKLY_MENU':
      return (
        <p className="mt-2 text-sm text-ink-muted">
          Sin campos: muestra el menú publicado de la semana en vivo.
        </p>
      );
    case 'DELIVERY_ZONES':
      return (
        <div className="mt-3 grid gap-2">
          <p className="text-xs text-ink-muted">
            Las ciudades en sí se muestran en vivo (activas en Ajustes → Zonas geográficas) — acá
            solo se edita el título y bajada.
          </p>
          <input
            disabled={disabled}
            onChange={(event) => onChange({ heading: event.target.value })}
            placeholder="Título (opcional, por defecto “Dónde entregamos”)"
            value={field('heading')}
          />
          <textarea
            disabled={disabled}
            onChange={(event) => onChange({ subheading: event.target.value })}
            placeholder="Bajada (opcional)"
            rows={2}
            value={field('subheading')}
          />
        </div>
      );
    case 'HERO_ROTATOR': {
      const words = Array.isArray(section.words) ? (section.words as string[]) : [];
      return (
        <div className="mt-3 grid gap-2">
          <input
            disabled={disabled}
            onChange={(event) => onChange({ kicker: event.target.value })}
            placeholder="Texto pequeño arriba (opcional, ej. “Bienvenido a nuestro mundo”)"
            value={field('kicker')}
          />
          <textarea
            disabled={disabled}
            onChange={(event) =>
              onChange({ words: event.target.value.split('\n').map((w) => w.trim()) })
            }
            placeholder={
              'Una frase por línea — rota cada 3,5s\ncuida tu salud\ndesde la alimentación'
            }
            rows={4}
            value={words.join('\n')}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              disabled={disabled}
              onChange={(event) => onChange({ ctaLabel: event.target.value })}
              placeholder="Texto del botón principal"
              value={field('ctaLabel')}
            />
            <input
              disabled={disabled}
              onChange={(event) => onChange({ ctaHref: event.target.value })}
              placeholder="Enlace (ej. /pedido)"
              value={field('ctaHref')}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              disabled={disabled}
              onChange={(event) => onChange({ secondaryLabel: event.target.value })}
              placeholder="Texto del botón secundario (opcional)"
              value={field('secondaryLabel')}
            />
            <input
              disabled={disabled}
              onChange={(event) => onChange({ secondaryHref: event.target.value })}
              placeholder="Enlace secundario"
              value={field('secondaryHref')}
            />
          </div>
        </div>
      );
    }
    case 'CAROUSEL': {
      const slides = Array.isArray(section.slides)
        ? (section.slides as { caption?: string; imageUrl?: string }[])
        : [];
      return (
        <div className="mt-3 grid gap-2">
          <input
            disabled={disabled}
            onChange={(event) => onChange({ heading: event.target.value })}
            placeholder="Título (opcional)"
            value={field('heading')}
          />
          <textarea
            className="w-full font-mono text-xs"
            disabled={disabled}
            onChange={(event) =>
              onChange({
                slides: event.target.value
                  .split('\n')
                  .filter(Boolean)
                  .map((line) => {
                    const [imageUrl, caption] = line.split('|');
                    return { caption: caption ?? '', imageUrl: imageUrl ?? '' };
                  }),
              })
            }
            placeholder="https://imagen…|Texto de la diapositiva"
            rows={5}
            value={slides
              .map((slide) => `${slide.imageUrl ?? ''}|${slide.caption ?? ''}`)
              .join('\n')}
          />
        </div>
      );
    }
    case 'CONTACT': {
      const regions = Array.isArray(section.regions)
        ? (section.regions as { label?: string; whatsapp?: string }[])
        : [];
      const coverage = Array.isArray(section.coverage)
        ? (section.coverage as { detail?: string; label?: string }[])
        : [];
      return (
        <div className="mt-3 grid gap-2">
          <input
            disabled={disabled}
            onChange={(event) => onChange({ phone: event.target.value })}
            placeholder="Teléfono"
            value={field('phone')}
          />
          <input
            disabled={disabled}
            onChange={(event) => onChange({ whatsapp: event.target.value })}
            placeholder="WhatsApp"
            value={field('whatsapp')}
          />
          <input
            disabled={disabled}
            onChange={(event) => onChange({ email: event.target.value })}
            placeholder="Email"
            value={field('email')}
          />
          <input
            disabled={disabled}
            onChange={(event) => onChange({ address: event.target.value })}
            placeholder="Dirección"
            value={field('address')}
          />
          <input
            disabled={disabled}
            onChange={(event) => onChange({ facebookUrl: event.target.value })}
            placeholder="URL de Facebook"
            value={field('facebookUrl')}
          />
          <label className="mt-1 text-xs font-semibold text-forest">Bajada del footer</label>
          <textarea
            className="w-full"
            disabled={disabled}
            onChange={(event) => onChange({ intro: event.target.value })}
            placeholder="Estamos para servirte, consultá lo que necesites."
            rows={2}
            value={field('intro')}
          />
          <label className="mt-1 text-xs font-semibold text-forest">
            Dónde entregamos — una por línea, "Zona|detalle"
          </label>
          <textarea
            className="w-full font-mono text-xs"
            disabled={disabled}
            onChange={(event) =>
              onChange({
                coverage: event.target.value
                  .split('\n')
                  .filter(Boolean)
                  .map((line) => {
                    const [label, detail] = line.split('|');
                    return { detail: detail ?? '', label: label ?? '' };
                  }),
              })
            }
            placeholder="Capital Federal, Buenos Aires|Sólo Núñez, Belgrano, Palermo y Recoleta"
            rows={5}
            value={coverage.map((item) => `${item.label ?? ''}|${item.detail ?? ''}`).join('\n')}
          />
          <label className="mt-1 text-xs font-semibold text-forest">
            WhatsApp por ciudad (opcional)
          </label>
          <textarea
            className="w-full font-mono text-xs"
            disabled={disabled}
            onChange={(event) =>
              onChange({
                regions: event.target.value
                  .split('\n')
                  .filter(Boolean)
                  .map((line) => {
                    const [label, whatsapp] = line.split('|');
                    return { label: label ?? '', whatsapp: whatsapp ?? '' };
                  }),
              })
            }
            placeholder="Ciudad de Neuquén|5492995493102"
            rows={4}
            value={regions
              .map((region) => `${region.label ?? ''}|${region.whatsapp ?? ''}`)
              .join('\n')}
          />
        </div>
      );
    }
    case 'CUSTOM':
      return (
        <textarea
          className="mt-3 w-full font-mono text-xs"
          disabled={disabled}
          onChange={(event) => onChange({ html: event.target.value })}
          rows={6}
          value={field('html')}
        />
      );
    // STEPS, FAQ, GALLERY use structured arrays; edited as line-per-item text for a fast v1
    // instead of full add/remove sub-forms.
    case 'STEPS': {
      const steps = Array.isArray(section.steps)
        ? (section.steps as { body: string; number: string; title: string }[])
        : [];
      return (
        <textarea
          className="mt-3 w-full font-mono text-xs"
          disabled={disabled}
          onChange={(event) =>
            onChange({
              steps: event.target.value
                .split('\n')
                .filter(Boolean)
                .map((line, index) => {
                  const [number, title, body] = line.split('|');
                  return {
                    body: body ?? '',
                    number: number ?? String(index + 1),
                    title: title ?? '',
                  };
                }),
            })
          }
          placeholder="01|Elegí|Encontrá tu variedad"
          rows={4}
          value={steps.map((step) => `${step.number}|${step.title}|${step.body}`).join('\n')}
        />
      );
    }
    case 'FAQ': {
      const items = Array.isArray(section.items)
        ? (section.items as { answer: string; question: string }[])
        : [];
      return (
        <textarea
          className="mt-3 w-full font-mono text-xs"
          disabled={disabled}
          onChange={(event) =>
            onChange({
              items: event.target.value
                .split('\n')
                .filter(Boolean)
                .map((line) => {
                  const [question, answer] = line.split('|');
                  return { answer: answer ?? '', question: question ?? '' };
                }),
            })
          }
          placeholder="¿Pregunta?|Respuesta"
          rows={4}
          value={items.map((item) => `${item.question}|${item.answer}`).join('\n')}
        />
      );
    }
    case 'GALLERY': {
      const images = Array.isArray(section.images)
        ? (section.images as { alt?: string; url: string }[])
        : [];
      return (
        <textarea
          className="mt-3 w-full font-mono text-xs"
          disabled={disabled}
          onChange={(event) =>
            onChange({
              images: event.target.value
                .split('\n')
                .filter(Boolean)
                .map((url) => ({ url })),
            })
          }
          placeholder="https://…"
          rows={4}
          value={images.map((image) => image.url).join('\n')}
        />
      );
    }
    default:
      return null;
  }
}
