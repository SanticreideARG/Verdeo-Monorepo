import { describe, expect, it } from 'vitest';

import { describeResponse, describeThrown, errorText } from './errors.js';

function apiResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

describe('describeResponse', () => {
  it('separa "no tenés permiso" de "no anduvo"', async () => {
    /*
     * Las tres situaciones que se veían iguales tienen salidas opuestas: sin permiso no hay nada
     * que reintentar, sin conexión reintentar es exactamente lo que hay que hacer. Mezclarlas deja
     * a todo el mundo reintentando lo que nunca va a funcionar.
     */
    const forbidden = await describeResponse(
      apiResponse(403, { error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'r1' } }),
    );

    expect(forbidden.kind).toBe('permiso');
    // "Forbidden" no le dice nada a nadie: se reemplaza.
    expect(forbidden.message).not.toContain('Forbidden');
    expect(forbidden.hint).toContain('administrador');
  });

  it('conserva el mensaje de la API cuando es un rechazo por una regla', async () => {
    // Acá el servidor entendió y dijo que no: su mensaje es lo más útil que hay.
    const rejected = await describeResponse(
      apiResponse(409, { error: { code: 'CONFLICT', message: 'La semana ya está cerrada.' } }),
    );

    expect(rejected).toMatchObject({ kind: 'regla', message: 'La semana ya está cerrada.' });
  });

  it('trata un 502 como falta de conexión y no como un error de la aplicación', async () => {
    const gateway = await describeResponse(apiResponse(502));

    // No pasó nada del lado del servidor: la salida es reintentar, igual que sin señal.
    expect(gateway.kind).toBe('conexion');
  });

  it('ofrece el número de solicitud sólo cuando falló algo nuestro', async () => {
    const server = await describeResponse(
      apiResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'boom', requestId: 'r9' } }),
    );
    const forbidden = await describeResponse(
      apiResponse(403, { error: { code: 'FORBIDDEN', message: 'Forbidden', requestId: 'r9' } }),
    );

    expect(server.requestId).toBe('r9');
    expect(server.kind).toBe('servidor');
    // Un 403 también trae requestId, pero mostrárselo a quien no tiene permiso no ayuda en nada.
    expect(forbidden.kind).toBe('permiso');
  });

  it('sobrevive a una respuesta que no es JSON', async () => {
    const broken = new Response('<html>502</html>', { status: 503 });

    await expect(describeResponse(broken)).resolves.toMatchObject({ kind: 'conexion' });
  });

  it('dice que la sesión venció, que es lo único que explica un 401', async () => {
    const expired = await describeResponse(apiResponse(401));

    expect(expired.kind).toBe('sesion');
  });
});

describe('describeThrown', () => {
  it('convierte el rechazo de fetch en algo que se puede leer', () => {
    // `fetch` rechaza con "Failed to fetch", que caía en el genérico junto con todo lo demás.
    const offline = describeThrown(new TypeError('Failed to fetch'));

    expect(offline.kind).toBe('conexion');
    expect(offline.message).not.toContain('fetch');
    expect(offline.hint).toContain('No se guardó nada');
  });
});

describe('errorText', () => {
  it('junta qué pasó y qué hacer, para las pantallas que muestran una línea', () => {
    expect(errorText({ hint: 'Volvé a intentar.', kind: 'conexion', message: 'Se cortó.' })).toBe(
      'Se cortó. Volvé a intentar.',
    );
  });

  it('no agrega nada cuando no hay nada que sugerir', () => {
    expect(errorText({ kind: 'regla', message: 'La semana ya está cerrada.' })).toBe(
      'La semana ya está cerrada.',
    );
  });
});
