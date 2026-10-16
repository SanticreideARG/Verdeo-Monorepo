import { describe, expect, it } from 'vitest';

import {
  isSettingsPath,
  searchSettings,
  SETTINGS_GROUPS,
  SETTINGS_HOME,
  SETTINGS_SECTIONS,
  visibleSettingsGroups,
} from './settingsCatalog.js';

describe('el catálogo del Panel de control', () => {
  it('cada sección dice qué se hace ahí y con qué palabras se la busca', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(section.description.length, section.label).toBeGreaterThan(15);
      expect(section.keywords.length, section.label).toBeGreaterThan(0);
    }
  });

  it('no repite rutas ni nombres', () => {
    expect(new Set(SETTINGS_SECTIONS.map((section) => section.href)).size).toBe(
      SETTINGS_SECTIONS.length,
    );
    expect(new Set(SETTINGS_SECTIONS.map((section) => section.label)).size).toBe(
      SETTINGS_SECTIONS.length,
    );
  });

  it('el inicio y cada sección cuentan como del panel; el resto no', () => {
    expect(isSettingsPath(SETTINGS_HOME)).toBe(true);
    expect(isSettingsPath('/app/usuarios')).toBe(true);
    expect(isSettingsPath('/app/ajustes/correo')).toBe(true);
    expect(isSettingsPath('/app/pedidos')).toBe(false);
  });
});

describe('qué ve cada persona', () => {
  it('sin la llave del panel sólo queda la apariencia propia', () => {
    const groups = visibleSettingsGroups(['sites.read', 'payments.read', 'users.read'], false);

    expect(groups.flatMap((group) => group.sections.map((section) => section.label))).toEqual([
      'Apariencia',
    ]);
  });

  it('con la llave, cada sección pide además su propio permiso', () => {
    const groups = visibleSettingsGroups(['sites.read', 'users.read'], true);
    const labels = groups.flatMap((group) => group.sections.map((section) => section.label));

    expect(labels).toContain('Zonas geográficas');
    expect(labels).toContain('Usuarios');
    expect(labels).toContain('Apariencia');
    expect(labels).not.toContain('Respaldos');
    expect(labels).not.toContain('Correo');
  });

  it('no deja un grupo vacío con su título colgado', () => {
    const groups = visibleSettingsGroups(['sites.read'], true);

    expect(groups.map((group) => group.label)).toEqual(['Operación', 'Sistema', 'Personal']);
  });
});

describe('el buscador', () => {
  const todo = visibleSettingsGroups(
    SETTINGS_SECTIONS.flatMap((section) => (section.permission ? [section.permission] : [])),
    true,
  );
  const labelsFor = (query: string) =>
    searchSettings(todo, query).flatMap((group) => group.sections.map((section) => section.label));

  it('sin nada escrito trae todo', () => {
    expect(searchSettings(todo, '  ')).toEqual(todo);
    expect(labelsFor('')).toHaveLength(SETTINGS_SECTIONS.length);
  });

  it('entiende las palabras con que se pregunta, no sólo los títulos', () => {
    expect(labelsFor('resend')).toEqual(['Correo']);
    expect(labelsFor('backup')).toEqual(['Respaldos']);
    expect(labelsFor('contraseña')).toContain('Usuarios');
  });

  it('no distingue mayúsculas ni tildes', () => {
    expect(labelsFor('AUDITORIA')).toContain('Auditoría');
    expect(labelsFor('direccion')).toContain('Direcciones');
  });

  it('todas las palabras tienen que aparecer: "correo ballena" no encuentra nada', () => {
    expect(labelsFor('correo ballena')).toEqual([]);
    expect(labelsFor('correo remitente')).toEqual(['Correo']);
  });

  it('busca también en el nombre del grupo', () => {
    const integraciones = SETTINGS_GROUPS.find((group) => group.label === 'Integraciones');

    expect(labelsFor('integraciones')).toEqual(
      integraciones?.sections.map((section) => section.label),
    );
  });
});
