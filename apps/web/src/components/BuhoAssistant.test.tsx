import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from '../lib/api.js';
import { BuhoAssistant, maskPersonal } from './BuhoAssistant.js';

vi.mock('../lib/api.js', () => ({ apiRequest: vi.fn() }));
vi.mock('../lib/toast.js', () => ({ showToast: vi.fn() }));

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const MODES = [
  {
    group: 'Mensajes',
    input: { label: 'El mensaje del cliente', placeholder: 'Hola…' },
    key: 'buho_analizar_mensaje',
    label: 'Analizar mensaje',
    starter: null,
    summary: 'Qué quiere el cliente.',
  },
  {
    group: 'Período',
    input: null,
    key: 'buho_analisis_periodo',
    label: 'Análisis del período',
    starter: 'Hacé el análisis de este período.',
    summary: 'Cómo viene el período.',
  },
];

const owl = () => screen.getByRole<HTMLImageElement>('img', { name: /búho/ });

beforeEach(() => {
  window.sessionStorage.clear();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiRequest).mockImplementation((path: string) => {
    if (path === '/api/v1/ai/assistant/modes') return json({ items: MODES });
    if (path === '/api/v1/ai/assistant/messages')
      return json({
        context: { cycleAlias: 'Octubre 5', omitted: [], siteName: 'Córdoba' },
        model: 'deepseek-chat',
        providerKey: 'deepseek',
        reply: 'Quiere 2 Keto 400.',
      });
    return json({ items: [] });
  });
});

describe('el búho del Workbench', () => {
  it('oculta teléfonos, correos y documentos de un texto pegado', () => {
    expect(maskPersonal('Soy Ana, 351 555-1234, ana@mail.com, DNI 30.123.456')).toBe(
      'Soy Ana, [teléfono], [correo], DNI [documento]',
    );
  });

  it('saluda, piensa con el texto pegado y responde con "Copiar"', async () => {
    render(<BuhoAssistant permissions={['ai.use']} />);
    await screen.findByRole('button', { name: 'Analizar mensaje' });
    expect(owl().src).toContain('HowlHi.png');

    fireEvent.click(screen.getByRole('button', { name: 'Pegar el texto' }));
    expect(owl().src).toContain('HowlThink.png');
    fireEvent.change(screen.getByLabelText('El mensaje del cliente'), {
      target: { value: 'Quiero 2 keto 400, mi cel 3515551234' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analizar' }));

    await screen.findByText('Quiere 2 Keto 400.');
    expect(owl().src).toContain('Howl.png');
    expect(screen.getByRole('button', { name: 'Copiar' })).toBeTruthy();
    expect(screen.getByText(/Analizar mensaje · Octubre 5 · Córdoba/)).toBeTruthy();

    const call = vi
      .mocked(apiRequest)
      .mock.calls.find(([path]) => path === '/api/v1/ai/assistant/messages');
    const body = JSON.parse(call?.[1]?.body as string) as { message: string; mode: string };
    expect(body.mode).toBe('buho_analizar_mensaje');
    expect(body.message).toContain('[teléfono]');
    expect(body.message).not.toContain('3515551234');
  });

  it('un modo sin texto se genera con un clic, y la conversación sigue', async () => {
    render(<BuhoAssistant permissions={['ai.use']} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Análisis del período' }));
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }));
    await screen.findByText('Quiere 2 Keto 400.');

    fireEvent.change(screen.getByLabelText('Tu pregunta o pedido'), {
      target: { value: 'Más corto' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));

    await waitFor(() => {
      const calls = vi
        .mocked(apiRequest)
        .mock.calls.filter(([path]) => path === '/api/v1/ai/assistant/messages');
      expect(calls).toHaveLength(2);
      const second = JSON.parse(calls[1]?.[1]?.body as string) as {
        history: { content: string; role: string }[];
      };
      expect(second.history.map((turn) => turn.role)).toEqual(['user', 'assistant']);
    });
  });
});
