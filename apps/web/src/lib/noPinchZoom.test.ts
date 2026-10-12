import { afterEach, describe, expect, it } from 'vitest';

import { installNoPinchZoom } from './noPinchZoom.js';

let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
  document.body.innerHTML = '';
});

function gesture(target: Element) {
  const event = new Event('gesturestart', { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('installNoPinchZoom', () => {
  it('cancela el pellizco sobre la aplicación', () => {
    uninstall = installNoPinchZoom();
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    expect(gesture(panel)).toBe(true);
  });

  // El mapa de rutas necesita pellizcar para acercarse.
  it('no lo cancela adentro del mapa', () => {
    uninstall = installNoPinchZoom();
    const map = document.createElement('div');
    map.className = 'leaflet-container';
    const tile = document.createElement('div');
    map.appendChild(tile);
    document.body.appendChild(map);
    expect(gesture(tile)).toBe(false);
  });

  it('se puede desinstalar', () => {
    installNoPinchZoom()();
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    expect(gesture(panel)).toBe(false);
  });
});
