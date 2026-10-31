import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';

/**
 * El movimiento de la portada pública (MOVIMIENTO_PLAN.md): scroll suave con Lenis y entradas con
 * GSAP. Vive en su propio archivo porque se importa con `import()` desde la portada: el panel, el
 * pedido web y el teléfono que entra directo a `/pedido` no bajan ni un byte de esto.
 *
 * Tres reglas:
 * - Con "reducir movimiento" no se hace nada: ni scroll suave ni entradas.
 * - El estado oculto lo pone este código, nunca el CSS. Si esto no carga, la página se ve completa.
 * - En el teléfono el scroll es el nativo (Lenis sólo suaviza la rueda), y las zonas con scroll
 *   propio —el asistente, el menú— siguen scrolleando solas.
 */

/** Lo que entra al aparecer en pantalla. El CMS arma la página, así que se busca por clase. */
const REVEAL_SELECTOR = [
  '.step-card',
  '.menu-families-head',
  '.menu-families-grid > article',
  '.menu-families-footnote',
  '.tips-head',
  '.tip-card',
  '.status-chip',
  '.cms-carousel',
  '.cms-footer-title',
  '.cms-footer-intro',
  '.cms-footer-panel',
  'main section h2',
  'main section > div > p',
  'main details',
  'main section img',
].join(',');

/** Lo primero que se ve: entra al cargar, sin esperar al scroll. */
const HERO_SELECTOR = '.eyebrow, .hero-logo, h1, h1 + p, .button, .food-card';

const BOUND = 'motionBound';

export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia !== 'function' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function startPublicMotion(root: HTMLElement): () => void {
  if (prefersReducedMotion()) return () => undefined;

  gsap.registerPlugin(ScrollTrigger);

  const lenis = new Lenis({ allowNestedScroll: true, autoRaf: false });
  lenis.on('scroll', () => ScrollTrigger.update());
  const tick = (time: number) => lenis.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  const headerOffset = () =>
    -((document.querySelector('.public-header')?.getBoundingClientRect().height ?? 0) + 12);

  /*
   * Los enlaces del menú son "/#section-menu". Sin esto el navegador salta de golpe y Lenis
   * arranca su animación desde otro lado; acá se hace una sola cosa: deslizar hasta la sección,
   * dejando lugar para la barra fija, y anotar el ancla en la dirección.
   */
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
    const link = (event.target as Element | null)?.closest?.('a[href*="#"]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const url = new URL(link.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
    const target = url.hash ? document.getElementById(decodeURIComponent(url.hash.slice(1))) : null;
    if (!target) return;
    event.preventDefault();
    lenis.scrollTo(target, { offset: headerOffset() });
    window.history.pushState(null, '', url.hash);
  };
  document.addEventListener('click', onClick);

  const context = gsap.context(() => {
    const hero = root.querySelector(':scope > section:first-child');
    if (hero) {
      const items = hero.querySelectorAll<HTMLElement>(HERO_SELECTOR);
      items.forEach((item) => (item.dataset[BOUND] = '1'));
      gsap.from(items, {
        autoAlpha: 0,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.09,
        y: 28,
      });
    }
  }, root);

  /*
   * Las secciones llegan de a poco: el menú de la semana y las ciudades se piden aparte y aparecen
   * después. Cada vez que cambia la página se enganchan sólo los elementos nuevos.
   */
  const bindReveals = () => {
    const fresh = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)).filter(
      (element) => !element.dataset[BOUND],
    );
    fresh.forEach((element) => (element.dataset[BOUND] = '1'));
    // Si un elemento está dentro de otro que ya entra, entra con él: animarlo dos veces tiembla.
    const outer = fresh.filter(
      (element) => !fresh.some((other) => other !== element && other.contains(element)),
    );
    if (outer.length === 0) return;
    context.add(() => {
      gsap.set(outer, { autoAlpha: 0, y: 28 });
      ScrollTrigger.batch(outer, {
        once: true,
        onEnter: (batch) =>
          gsap.to(batch, {
            autoAlpha: 1,
            duration: 0.75,
            ease: 'power3.out',
            overwrite: true,
            stagger: 0.08,
            y: 0,
          }),
        start: 'top 88%',
      });
    });
    ScrollTrigger.refresh();
  };

  let frame = 0;
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(bindReveals);
  });
  observer.observe(root, { childList: true, subtree: true });
  bindReveals();

  // Quien llega de otra página con "/#section-precios": la sección recién existe ahora.
  const initial = window.location.hash
    ? document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
    : null;
  if (initial) lenis.scrollTo(initial, { immediate: true, offset: headerOffset() });

  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
    document.removeEventListener('click', onClick);
    context.revert();
    gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(500, 33);
    lenis.destroy();
  };
}
