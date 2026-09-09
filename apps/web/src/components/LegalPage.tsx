import { Link } from 'react-router-dom';

export interface LegalSection {
  /** Ancla estable para poder enlazar un punto concreto desde afuera. */
  id: string;
  /** Párrafos y listas. Una cadena es un párrafo; un arreglo, una lista con viñetas. */
  body: (string | string[])[];
  title: string;
}

/**
 * El armazón de un documento legal público.
 *
 * Los dos documentos —privacidad y condiciones— comparten forma, y comparten dos requisitos que no
 * son de diseño sino de función:
 *
 * - **Se llega sin sesión.** Un revisor de Google abre la URL desde otra computadora, sin cuenta, y
 *   tiene que ver el texto. Por eso son rutas propias de la aplicación y no páginas del CMS: una
 *   página despublicada por accidente rompe la verificación de OAuth, y el CMS no guarda historial.
 * - **Se sabe desde cuándo rigen.** La fecha de vigencia arriba, visible, porque lo primero que se
 *   pregunta de un texto legal es qué versión aceptó alguien. El texto vive en el repositorio, así
 *   que el historial de git dice qué decía cada día.
 *
 * El índice no es decorativo: son documentos largos y quien los abre casi siempre viene a buscar un
 * punto —cuánto se guarda, cómo se borra, quién más ve los datos— y no a leerlos de arriba abajo.
 */
export function LegalPage({
  intro,
  sections,
  subtitle,
  title,
  updatedAt,
}: {
  intro: string[];
  sections: readonly LegalSection[];
  subtitle: string;
  title: string;
  /** Fecha de vigencia, en formato ISO. */
  updatedAt: string;
}) {
  return (
    <div className="legal-page">
      <header className="legal-page-header">
        <Link className="brand" to="/" aria-label="Verdeo, inicio">
          <img className="brand-icon" src="/brand/verdeo-icon.png" alt="" width="36" height="36" />
          verdeo<span>.</span>
        </Link>
      </header>

      <main className="legal-page-body">
        <p className="legal-page-kicker">{subtitle}</p>
        <h1>{title}</h1>
        <p className="legal-page-updated">
          Vigente desde el{' '}
          {new Intl.DateTimeFormat('es-AR', { dateStyle: 'long', timeZone: 'UTC' }).format(
            new Date(`${updatedAt}T00:00:00Z`),
          )}
          .
        </p>

        {intro.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}

        <nav aria-label="Contenido" className="legal-page-index">
          <p>Contenido</p>
          <ol>
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`}>{section.title}</a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((section, index) => (
          <section id={section.id} key={section.id}>
            <h2>
              {index + 1}. {section.title}
            </h2>
            {section.body.map((block, blockIndex) =>
              Array.isArray(block) ? (
                <ul key={`${section.id}-${String(blockIndex)}`}>
                  {block.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p key={`${section.id}-${String(blockIndex)}`}>{block}</p>
              ),
            )}
          </section>
        ))}

        <nav aria-label="Otros documentos" className="legal-page-footer-nav">
          <Link to="/privacidad">Política de privacidad</Link>
          <Link to="/terminos">Términos y condiciones</Link>
          <Link to="/">Volver al inicio</Link>
        </nav>
      </main>
    </div>
  );
}
