import { describe, expect, it } from 'vitest';

import { clockPlus, mapsLinks, minutesLabel, routeTiming } from './routeTiming.js';

const stop = (index: number, latitude: number | null = -32.88 + index * 0.01) => ({
  deliveryLatitude: latitude,
  deliveryLongitude: latitude === null ? null : -68.84,
  id: `s${String(index)}`,
  sequence: index,
});

describe('routeTiming', () => {
  it('minutos por tramo y desde la salida, y el total con la vuelta', () => {
    const start = { latitude: -32.89, longitude: -68.84 };
    const timing = routeTiming(start, start, [stop(0), stop(1)]);
    expect(timing.byStop.get('s0')).toEqual({ fromStart: 4, leg: 4 });
    // 4 + ~4 de viaje + 5 en la parada anterior.
    expect(timing.byStop.get('s1')).toEqual({ fromStart: 12, leg: 8 });
    // Más 5 en la última y la vuelta (~7).
    expect(timing.totalMinutes).toBeGreaterThan(12 + 5);
  });

  it('una parada sin ubicación no tiene tiempo', () => {
    const timing = routeTiming(null, null, [stop(0), stop(1, null)]);
    expect(timing.byStop.has('s1')).toBe(false);
  });
});

describe('clockPlus y minutesLabel', () => {
  it('suma minutos a la hora de salida', () => {
    expect(clockPlus('10:00', 40)).toBe('10:40');
    expect(clockPlus('9:30', 95)).toBe('11:05');
    expect(clockPlus('', 10)).toBeNull();
    expect(minutesLabel(70)).toBe('1 h 10');
    expect(minutesLabel(25)).toBe('25 min');
  });
});

describe('mapsLinks', () => {
  it('una ruta corta: un solo link con salida, paradas y llegada', () => {
    const start = { latitude: -32.89, longitude: -68.84 };
    const links = mapsLinks(start, start, [stop(1), stop(2)]);
    expect(links).toHaveLength(1);
    const url = new URL(links[0]?.url ?? '');
    expect(url.searchParams.get('origin')).toBe('-32.89,-68.84');
    expect(url.searchParams.get('destination')).toBe('-32.89,-68.84');
    expect(url.searchParams.get('waypoints')?.split('|')).toHaveLength(2);
  });

  it('una ruta larga se parte en tramos que empiezan donde termina el anterior', () => {
    const start = { latitude: -32.89, longitude: -68.84 };
    const stops = Array.from({ length: 15 }, (_, index) => stop(index + 1));
    const links = mapsLinks(start, null, stops);
    expect(links.length).toBe(2);
    expect(links[0]?.label).toBe('Tramo 1: paradas 1 a 10');
    const first = new URL(links[0]?.url ?? '');
    const second = new URL(links[1]?.url ?? '');
    expect(second.searchParams.get('origin')).toBe(first.searchParams.get('destination'));
    expect(links[1]?.label).toBe('Tramo 2: paradas 11 a 15');
  });
});
