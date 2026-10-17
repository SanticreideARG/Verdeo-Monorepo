/**
 * Abre en otra pestaña un documento que se pide al servidor, sin que el bloqueador de ventanas lo
 * frene: la pestaña se abre en el mismo instante del clic (cuando el navegador la permite) y recién
 * después se le carga el documento. Abrirla después de esperar la respuesta se tomaba por una
 * ventana emergente no pedida y no pasaba nada.
 *
 * Devuelve `null` si salió bien o el mensaje para mostrar si no.
 */
export async function openPrintable(load: () => Promise<Response>): Promise<string | null> {
  const tab = window.open('', '_blank');
  try {
    const response = await load();
    if (!response.ok) {
      tab?.close();
      return await readError(response);
    }
    const url = URL.createObjectURL(await response.blob());
    if (tab) {
      tab.location.href = url;
    } else if (!window.open(url, '_blank')) {
      URL.revokeObjectURL(url);
      return 'El navegador bloqueó la ventana. Permití las ventanas emergentes de este sitio y volvé a probar.';
    }
    // Revocar en el mismo turno corre carrera con la pestaña que recién carga.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return null;
  } catch {
    tab?.close();
    return 'No se pudo preparar la hoja. Revisá la conexión y volvé a probar.';
  }
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // Sin cuerpo legible: va el mensaje general.
  }
  return `No se pudo preparar la hoja (error ${response.status}).`;
}
