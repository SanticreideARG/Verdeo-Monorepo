import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';

interface HelpArticle {
  body: string;
  category: string;
  id: string;
  key: string;
  ordinal: number;
  title: string;
}

interface Branch {
  articles: HelpArticle[];
  children: Map<string, Branch>;
  name: string;
}

/** El evento con el que cualquier parte del panel abre el asistente (hoy, "Ayuda" del menú lateral). */
export const OPEN_OPERATOR_ASSISTANT = 'verdeo:abrir-ayuda';

export function openOperatorAssistant(): void {
  window.dispatchEvent(new Event(OPEN_OPERATOR_ASSISTANT));
}

/** "Ciclo semanal" va primero: es lo que necesita alguien que recién entra (ver HelpPage). */
const FIRST_CATEGORY = 'Ciclo semanal';
const STORAGE_KEY = 'verdeo-ayuda';

/*
 * Una sola petición por visita, como los logos de la landing: cada pantalla del panel monta su
 * propio DashboardShell, y sin esto cada navegación volvería a pedir los artículos.
 */
let articlesRequest: Promise<HelpArticle[]> | null = null;

function loadArticles(): Promise<HelpArticle[]> {
  articlesRequest ??= apiRequest('/api/v1/help').then(async (response) => {
    if (!response.ok) {
      // Un fallo no queda guardado: la próxima vez que se abra, se vuelve a intentar.
      articlesRequest = null;
      throw new Error('No se pudo cargar la ayuda.');
    }
    return ((await response.json()) as { items: HelpArticle[] }).items;
  });
  return articlesRequest;
}

/**
 * Las ramas salen de la categoría: "Pedidos / Cobros" es la rama Cobros dentro de Pedidos.
 *
 * Así el árbol se arma con lo que ya guarda cada artículo, sin una tabla de categorías aparte que
 * mantener sincronizada, y quien escribe un artículo nuevo decide dónde cuelga escribiendo la ruta.
 */
function categoryPath(category: string): string[] {
  return category
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

function buildTree(articles: HelpArticle[]): Branch {
  const root: Branch = { articles: [], children: new Map(), name: '' };
  for (const article of articles) {
    let node = root;
    for (const part of categoryPath(article.category)) {
      let next = node.children.get(part);
      if (!next) {
        next = { articles: [], children: new Map(), name: part };
        node.children.set(part, next);
      }
      node = next;
    }
    node.articles.push(article);
  }
  return root;
}

function findBranch(root: Branch, path: string[]): Branch | null {
  let node: Branch | undefined = root;
  for (const part of path) {
    node = node.children.get(part);
    if (!node) return null;
  }
  return node;
}

function countArticles(branch: Branch): number {
  let total = branch.articles.length;
  for (const child of branch.children.values()) total += countArticles(child);
  return total;
}

function sortedChildren(branch: Branch, atRoot: boolean): Branch[] {
  return [...branch.children.values()].sort((a, b) => {
    if (atRoot && a.name === FIRST_CATEGORY) return -1;
    if (atRoot && b.name === FIRST_CATEGORY) return 1;
    return a.name.localeCompare(b.name, 'es-AR');
  });
}

function sortedArticles(branch: Branch): HelpArticle[] {
  return [...branch.articles].sort(
    (a, b) => a.ordinal - b.ordinal || a.title.localeCompare(b.title, 'es-AR'),
  );
}

/** Sin tildes ni mayúsculas: quien busca "configuracion" tiene que encontrar "Configuración". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

interface StoredState {
  articleKey: string | null;
  open: boolean;
  path: string[];
}

function readStored(): StoredState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredState>;
      return {
        articleKey: typeof parsed.articleKey === 'string' ? parsed.articleKey : null,
        open: parsed.open === true,
        path: Array.isArray(parsed.path) ? parsed.path.filter((p) => typeof p === 'string') : [],
      };
    }
  } catch {
    // Sin almacenamiento el asistente arranca cerrado, que es lo normal.
  }
  return { articleKey: null, open: false, path: [] };
}

/*
 * Enlaces dentro del texto de un artículo:
 *   [[clave]]           → otro artículo, con su título.
 *   [texto](/app/ruta)  → la pantalla de la que habla.
 * Sólo rutas internas: un artículo no puede mandar a nadie fuera de Verdeo.
 */
const INLINE_LINK = /\[\[([a-z0-9-]+)\]\]|\[([^\]]+)\]\((\/[^)\s]*)\)/g;

interface OperatorAssistantProps {
  canManage: boolean;
  displayName: string;
}

/**
 * La ayuda del panel, con la forma del asistente de la landing: la lechuza abajo a la derecha,
 * y adentro la ayuda navegable por ramas —categoría, subcategoría, artículo— o por búsqueda.
 *
 * Reemplaza la entrada y no el contenido: los artículos siguen siendo los de `help_articles`,
 * filtrados por permiso en el backend, y se siguen editando en /app/ayuda.
 */
export function OperatorAssistant({ canManage, displayName }: OperatorAssistantProps) {
  const initial = useMemo(readStored, []);
  const [open, setOpen] = useState(initial.open);
  const [path, setPath] = useState<string[]>(initial.path);
  const [articleKey, setArticleKey] = useState<string | null>(initial.articleKey);
  const [query, setQuery] = useState('');
  const [articles, setArticles] = useState<HelpArticle[] | null>(null);
  const [failed, setFailed] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_OPERATOR_ASSISTANT, show);
    return () => window.removeEventListener(OPEN_OPERATOR_ASSISTANT, show);
  }, []);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ articleKey, open, path }));
    } catch {
      // Recordar dónde quedó es una comodidad; sin almacenamiento, cada pantalla arranca de cero.
    }
  }, [articleKey, open, path]);

  useEffect(() => {
    if (!open || articles) return;
    let active = true;
    setFailed(false);
    loadArticles()
      .then((loaded) => {
        if (active) setArticles(loaded);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [open, articles]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Cada paso nuevo arranca arriba: un artículo largo no tiene que abrirse por la mitad.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: 0 });
  }, [path, articleKey, query]);

  const tree = useMemo(() => buildTree(articles ?? []), [articles]);
  const byKey = useMemo(
    () => new Map((articles ?? []).map((article) => [article.key, article])),
    [articles],
  );

  // Una rama o un artículo guardados que ya no existen (se borró, cambió de categoría, otro
  // usuario) no dejan el asistente en blanco: se vuelve al inicio.
  const branch = findBranch(tree, path) ?? tree;
  const article = articleKey ? (byKey.get(articleKey) ?? null) : null;
  const searching = query.trim().length > 0;

  const results = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return (articles ?? []).filter((candidate) => {
      const haystack = normalize(`${candidate.title} ${candidate.category} ${candidate.body}`);
      return words.every((word) => haystack.includes(word));
    });
  }, [articles, query]);

  function openArticle(target: HelpArticle) {
    setPath(categoryPath(target.category));
    setArticleKey(target.key);
    setQuery('');
  }

  function goTo(nextPath: string[]) {
    setPath(nextPath);
    setArticleKey(null);
    setQuery('');
  }

  function back() {
    if (searching) setQuery('');
    else if (article) setArticleKey(null);
    else setPath((current) => current.slice(0, -1));
  }

  function renderInline(text: string): ReactNode[] {
    const parts: ReactNode[] = [];
    let last = 0;
    for (const match of text.matchAll(INLINE_LINK)) {
      const index = match.index;
      if (index > last) parts.push(text.slice(last, index));
      const [whole, key, label, href] = match;
      if (key) {
        const target = byKey.get(key);
        // Un artículo que este usuario no puede ver no se nombra: sería un enlace a nada.
        if (target) {
          parts.push(
            <button
              className="helpbot-link"
              key={`${String(index)}-${key}`}
              onClick={() => openArticle(target)}
              type="button"
            >
              {target.title}
            </button>,
          );
        }
      } else if (label && href) {
        parts.push(
          <Link
            className="helpbot-link"
            key={`${String(index)}-${href}`}
            onClick={() => setOpen(false)}
            to={href}
          >
            {label}
          </Link>,
        );
      }
      last = index + whole.length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
  }

  function renderBody(body: string) {
    return body
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph, index) => <p key={index}>{renderInline(paragraph)}</p>);
  }

  const firstName = displayName.trim().split(/\s+/)[0] ?? '';
  const atRoot = path.length === 0 && !article && !searching;
  const children = sortedChildren(branch, path.length === 0);
  const branchArticles = sortedArticles(branch);

  return (
    <>
      <button
        aria-expanded={open}
        aria-label={open ? 'Cerrar la ayuda' : 'Abrir la ayuda'}
        className={`assistant-launcher is-operator ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? null : (
          <span aria-hidden="true" className="assistant-launcher-bubble">
            Ayuda
          </span>
        )}
        <span className="assistant-launcher-avatar">
          {open ? (
            <span aria-hidden="true" className="assistant-launcher-close">
              ×
            </span>
          ) : (
            <img alt="" height="56" src="/brand/verdeo-buho-112.webp" width="56" />
          )}
        </span>
      </button>

      {open ? (
        <div aria-label="Ayuda de Verdeo" className="assistant-panel is-operator" role="dialog">
          <header className="assistant-header">
            <div className="assistant-header-identity">
              <img alt="" height="32" src="/brand/verdeo-buho-112.webp" width="32" />
              <p>Ayuda de Verdeo</p>
            </div>
            <div className="assistant-header-actions">
              <button
                aria-label="Cerrar"
                className="assistant-plain"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
          </header>

          <div className="helpbot-search">
            <input
              aria-label="Buscar en la ayuda"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar: rutas, etiquetas, cobrado…"
              type="search"
              value={query}
            />
          </div>

          {!atRoot ? (
            <nav aria-label="Dónde estás" className="helpbot-crumbs">
              <button className="assistant-plain" onClick={back} type="button">
                ← Volver
              </button>
              {searching ? null : (
                <span>
                  <button className="helpbot-crumb" onClick={() => goTo([])} type="button">
                    Inicio
                  </button>
                  {path.map((part, index) => (
                    <span key={`${String(index)}-${part}`}>
                      {' › '}
                      <button
                        className="helpbot-crumb"
                        onClick={() => goTo(path.slice(0, index + 1))}
                        type="button"
                      >
                        {part}
                      </button>
                    </span>
                  ))}
                </span>
              )}
            </nav>
          ) : null}

          <div className="assistant-thread helpbot-thread" ref={threadRef}>
            {failed ? (
              <p className="assistant-block-empty">
                No pude cargar la ayuda. Revisá la conexión y volvé a abrirla.
              </p>
            ) : !articles ? (
              <p className="assistant-block-empty">Un momento…</p>
            ) : searching ? (
              results.length === 0 ? (
                <p className="assistant-block-empty">
                  No encontré nada con eso. Probá con otra palabra, o navegá por las ramas.
                </p>
              ) : (
                <ul className="helpbot-list">
                  {results.map((result) => (
                    <li key={result.key}>
                      <button
                        className="helpbot-row"
                        onClick={() => openArticle(result)}
                        type="button"
                      >
                        <span>
                          <strong>{result.title}</strong>
                          <small>{categoryPath(result.category).join(' › ')}</small>
                        </span>
                        <span aria-hidden="true">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : article ? (
              <article className="helpbot-article">
                <h3>{article.title}</h3>
                {renderBody(article.body)}
              </article>
            ) : (
              <>
                {atRoot ? (
                  <div className="assistant-bot-row">
                    <img alt="" height="28" src="/brand/verdeo-buho-112.webp" width="28" />
                    <p className="assistant-turn is-bot">
                      Hola{firstName ? `, ${firstName}` : ''}. ¿Con qué te doy una mano? Elegí un
                      tema o buscá arriba.
                    </p>
                  </div>
                ) : null}
                {children.length === 0 && branchArticles.length === 0 ? (
                  <p className="assistant-block-empty">
                    Todavía no hay artículos de ayuda para tu usuario.
                  </p>
                ) : (
                  <ul className="helpbot-list">
                    {children.map((child) => (
                      <li key={child.name}>
                        <button
                          className="helpbot-row is-branch"
                          onClick={() => goTo([...path, child.name])}
                          type="button"
                        >
                          <span>
                            <strong>{child.name}</strong>
                          </span>
                          <span className="helpbot-count">{countArticles(child)}</span>
                        </button>
                      </li>
                    ))}
                    {branchArticles.map((item) => (
                      <li key={item.key}>
                        <button
                          className="helpbot-row"
                          onClick={() => openArticle(item)}
                          type="button"
                        >
                          <span>
                            <strong>{item.title}</strong>
                          </span>
                          <span aria-hidden="true">›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {canManage ? (
            <footer className="helpbot-footer">
              <Link onClick={() => setOpen(false)} to="/app/ayuda">
                Editar los artículos
              </Link>
            </footer>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
