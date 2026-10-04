import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AIWorkbenchPage } from './AIWorkbenchPage.js';

vi.mock('../components/DashboardShell.js', () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/DeskWorkNotice.js', () => ({ DeskWorkNotice: () => null }));
vi.mock('../lib/useDashboardProfile.js', () => ({
  useDashboardProfile: () => ({
    failed: false,
    logout: vi.fn(),
    profile: { permissions: ['ai.prompts.manage', 'ai.use'], user: { displayName: 'Santiago' } },
  }),
}));

const PROMPTS = [
  {
    description: 'Reescribe un mensaje.',
    displayName: 'Reescribir mensaje',
    hasActiveVersion: true,
    taskKey: 'rewrite_message',
  },
  {
    description: 'Convierte el resumen de cocina en texto.',
    displayName: 'Resumen de cocina',
    hasActiveVersion: true,
    taskKey: 'kitchen_summary',
  },
];

function detailFor(taskKey: string) {
  const version = {
    createdAt: '2026-10-04T10:00:00.000Z',
    id: `${taskKey}-v1`,
    maxTokens: 500,
    preferredProviderKey: null,
    systemPrompt: `PROMPT DE ${taskKey}`,
    temperature: 0.5,
    version: 1,
  };
  return { activeVersionId: version.id, taskKey, versions: [version] };
}

const apiRequest = vi.fn();
vi.mock('../lib/api.js', () => ({
  apiRequest: (path: string, init?: RequestInit) => apiRequest(path, init) as unknown,
}));

beforeEach(() => {
  apiRequest.mockImplementation((path: string) => {
    if (path === '/api/v1/ai/prompts') {
      return Promise.resolve({ json: () => Promise.resolve({ items: PROMPTS }), ok: true });
    }
    const match = /\/api\/v1\/ai\/prompts\/([a-z_]+)$/.exec(path);
    if (match) {
      return Promise.resolve({ json: () => Promise.resolve(detailFor(match[1]!)), ok: true });
    }
    return Promise.resolve({ json: () => Promise.resolve({}), ok: true });
  });
});

afterEach(() => {
  apiRequest.mockReset();
});

/** El textarea del prompt. No hay matchers de jest-dom en este proyecto: se compara el valor. */
function promptField(): HTMLTextAreaElement {
  return screen.getByLabelText<HTMLTextAreaElement>(/Prompt de sistema/);
}

describe('workbench de IA', () => {
  /*
   * El formulario usa campos no controlados, así que cambiar de tarea no bastaba para refrescarlos:
   * React reutilizaba el mismo textarea y las tres tareas mostraban el prompt de la primera que se
   * hubiera abierto. Y como se guarda contra la tarea seleccionada, apretar "Guardar versión"
   * después de cambiar escribía ese texto en la tarea equivocada — que es por qué esto tiene un
   * test y no sólo un arreglo.
   */
  it('muestra el prompt de la tarea elegida y no el de la anterior', async () => {
    render(
      <MemoryRouter>
        <AIWorkbenchPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: /Reescribir mensaje/ }));
    await waitFor(() => {
      expect(promptField().value).toBe('PROMPT DE rewrite_message');
    });

    fireEvent.click(screen.getByRole('button', { name: /Resumen de cocina/ }));

    await waitFor(() => {
      expect(promptField().value).toBe('PROMPT DE kitchen_summary');
    });
  });
});
