import { describe, expect, it } from 'vitest';

import { zoneNamedInAddress } from './zone-in-address.js';

const zonas = [
  { displayName: 'Neuquén', id: 'nqn' },
  { displayName: 'General Roca', id: 'roca' },
  { displayName: 'Cipolletti', id: 'cipo' },
  { displayName: 'Sur', id: 'sur' },
];

describe('la zona que nombra una dirección', () => {
  it('no confunde la calle con la zona', () => {
    expect(zoneNamedInAddress(zonas, 'Neuquen 1466 , General roca')).toBe('roca');
  });

  it('ignora tildes, mayúsculas y letras dobles', () => {
    expect(zoneNamedInAddress(zonas, 'Mitre 10, NEUQUÉN')).toBe('nqn');
    expect(zoneNamedInAddress(zonas, 'Mitre 10, Cipolleti')).toBe('cipo');
  });

  it('la localidad manda sobre lo que viene después', () => {
    expect(zoneNamedInAddress(zonas, 'Mitre 10, General Roca, Neuquén')).toBe('roca');
  });

  it('sin coma, sólo si está al final', () => {
    expect(zoneNamedInAddress(zonas, 'Mitre 10 General Roca')).toBe('roca');
    expect(zoneNamedInAddress(zonas, 'Neuquen 1466')).toBeUndefined();
  });

  it('también mira la línea 2', () => {
    expect(zoneNamedInAddress(zonas, 'Mitre 10', 'Piso 2, Cipolletti')).toBe('cipo');
  });

  it('si no nombra una, o nombra dos en la misma parte, no adivina', () => {
    expect(zoneNamedInAddress(zonas, 'Mitre 10, Plottier')).toBeUndefined();
    expect(zoneNamedInAddress(zonas, 'Mitre 10, Neuquén General Roca')).toBeUndefined();
  });

  it('no toma nombres de zona demasiado cortos', () => {
    expect(zoneNamedInAddress(zonas, 'Mitre 10, Sur')).toBeUndefined();
  });
});
