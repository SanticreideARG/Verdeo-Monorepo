import { describe, expect, it } from 'vitest';

import { normalizeMenuName } from './menu-names.js';

describe('normalizeMenuName', () => {
  it('baja un nombre gritado a mayúscula inicial', () => {
    // El caso real: así están cargadas las doce variedades de la semana.
    expect(normalizeMenuName('MENÚ NUEVO KETO')).toBe('Menú Nuevo Keto');
  });

  it('capitaliza las dos mitades de un nombre con guión', () => {
    // "Anti-age" leería como una palabra compuesta; las dos mitades son la marca.
    expect(normalizeMenuName('MENÚ ANTI-AGE')).toBe('Menú Anti-Age');
  });

  it('deja en minúscula las palabras que unen', () => {
    expect(normalizeMenuName('MENÚ DE LA CASA')).toBe('Menú de la Casa');
  });

  it('no toca un nombre que alguien escribió con una caja deliberada', () => {
    /*
     * La regla es conservadora a propósito: sólo interviene si el texto está enteramente en
     * mayúsculas. Normalizar siempre sería decidir por el operador cómo se llama su producto.
     */
    expect(normalizeMenuName('Menú KETO')).toBe('Menú KETO');
    expect(normalizeMenuName('Intuitivo')).toBe('Intuitivo');
  });

  it('no toca un nombre sin letras', () => {
    // Los tamaños son "250" y "400": no hay caja que corregir.
    expect(normalizeMenuName('250')).toBe('250');
  });

  it('limpia espacios de más', () => {
    expect(normalizeMenuName('  MENÚ   REAL ')).toBe('Menú Real');
  });

  it('hace que dos escrituras del mismo menú terminen iguales', () => {
    // Que es el punto: la misma variedad cargada dos semanas seguidas no puede dar dos filas en
    // "Demanda por variedad".
    expect(normalizeMenuName('MENÚ REAL')).toBe('Menú Real');
    expect(normalizeMenuName('Menú Real')).toBe('Menú Real');
  });
});
