/**
 * Qué salió mal y qué hacer al respecto.
 *
 * Antes cada pantalla mostraba el mensaje que devolvía la API, tal cual, en un renglón rojo. Los
 * mensajes de la API están bien escritos —"La exportación supera los 5000 pedidos"— pero están
 * escritos para explicar, no para resolver, y hay tres situaciones que se veían exactamente iguales
 * aunque no tienen nada que ver entre sí:
 *
 * - **No tenés permiso.** No hay nada que reintentar; hay que pedirlo.
 * - **No hay conexión.** No pasó nada del lado del servidor; se reintenta y listo.
 * - **Una regla lo rechazó.** El servidor entendió y dijo que no: ahí el mensaje de la API es lo
 *   más útil que hay, y lo que falta es qué corregir.
 *
 * Distinguirlas cambia lo que hace la persona. Un "No pudimos completar la operación" las mezcla y
 * deja a todo el mundo reintentando lo que nunca va a funcionar.
 */

export type ErrorKind =
  'conexion' | 'no-encontrado' | 'permiso' | 'regla' | 'servidor' | 'sesion' | 'volumen';

export interface AppError {
  /** Qué hacer. Vacío cuando de verdad no hay nada que sugerir. */
  hint?: string;
  kind: ErrorKind;
  /** Qué pasó, en una frase. */
  message: string;
  /** El identificador de la solicitud, para poder buscarla en los registros si hace falta. */
  requestId?: string;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string };
}

/**
 * Un fallo de red no llega como respuesta: `fetch` rechaza la promesa. Es el caso más común fuera
 * de la oficina y el que peor se veía, porque caía en el genérico junto con todo lo demás.
 */
export function describeThrown(error: unknown): AppError {
  return {
    hint: 'Revisá tu conexión y volvé a intentar. No se guardó nada.',
    kind: 'conexion',
    message:
      error instanceof Error && error.message && !/fetch/i.test(error.message)
        ? error.message
        : 'No pudimos comunicarnos con el servidor.',
  };
}

/**
 * Lee una respuesta fallida y arma el error que se le muestra a una persona.
 *
 * El `message` de la API se usa cuando aporta —en los rechazos por regla es lo mejor que hay— y se
 * reemplaza cuando no: "Forbidden" no le dice nada a nadie.
 */
export async function describeResponse(response: Response): Promise<AppError> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  const fromApi = body?.error?.message?.trim();
  const requestId = body?.error?.requestId;
  const withId = (error: Omit<AppError, 'requestId'>): AppError => ({
    ...error,
    ...(requestId ? { requestId } : {}),
  });

  if (response.status === 401) {
    return withId({
      hint: 'Volvé a iniciar sesión para seguir.',
      kind: 'sesion',
      message: 'Tu sesión venció.',
    });
  }

  if (response.status === 403) {
    return withId({
      hint: 'Pedile a un administrador que te habilite este permiso.',
      kind: 'permiso',
      message: 'Tu usuario no tiene permiso para hacer esto.',
    });
  }

  if (response.status === 404) {
    return withId({
      hint: 'Puede que se haya borrado, o que el enlace esté viejo.',
      kind: 'no-encontrado',
      message: fromApi ?? 'No encontramos lo que buscabas.',
    });
  }

  if (response.status === 429) {
    return withId({
      hint: 'Esperá unos segundos antes de volver a intentar.',
      kind: 'volumen',
      message: 'Demasiados intentos seguidos.',
    });
  }

  /*
   * 502, 503 y 504 no son un error de la aplicación: es que la petición no llegó a destino o el
   * servidor no contestó a tiempo. Para quien está del otro lado es lo mismo que quedarse sin
   * conexión, y la salida es la misma: reintentar.
   */
  if (response.status >= 502) {
    return withId({
      hint: 'Probá de nuevo en un momento.',
      kind: 'conexion',
      message: 'El servidor no respondió.',
    });
  }

  if (response.status >= 500) {
    return withId({
      hint: 'Si vuelve a pasar, avisanos con el número de la solicitud.',
      kind: 'servidor',
      message: 'Algo falló de nuestro lado.',
    });
  }

  // 400 y 409: el servidor entendió y dijo que no. Su mensaje es lo más útil que hay.
  return withId({
    kind: 'regla',
    message: fromApi ?? 'No pudimos completar la operación.',
  });
}

/** El error como una sola línea, para las pantallas que todavía muestran un texto suelto. */
export function errorText(error: AppError): string {
  return error.hint ? `${error.message} ${error.hint}` : error.message;
}
