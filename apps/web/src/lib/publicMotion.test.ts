import { afterEach, describe, expect, it, vi } from 'vitest';

import { prefersReducedMotion, startPublicMotion } from './publicMotion.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

function page() {
  const main = document.createElement('main');
  main.innerHTML =
    '<section><h1>Comer rico</h1><a class="button" href="/pedido">Pedir</a></section>' +
    '<section><h2>Menús</h2><article class="tip-card">Elegí</article></section>';
  document.body.append(main);
  return main;
}

describe('el movimiento de la portada', () => {
  it('con "reducir movimiento" no toca nada: ni scroll suave ni elementos ocultos', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const main = page();

    const stop = startPublicMotion(main);

    expect(document.documentElement.classList.contains('lenis')).toBe(false);
    expect(main.querySelector<HTMLElement>('.tip-card')?.style.visibility).toBe('');
    stop();
  });

  it('sin forma de preguntar por la preferencia, asume que no se quiere movimiento', () => {
    // Un navegador viejo o un entorno sin matchMedia.
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(true);
  });
});
