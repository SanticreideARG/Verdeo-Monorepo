/**
 * La versión liviana de cada imagen de marca que tiene una.
 *
 * Los originales son PNG de 1254 px y hasta 1,7 MB, pensados para imprimir; en pantalla se ven a
 * 36–220 px. Las versiones livianas son WebP al doble del tamaño en que se muestran (para pantallas
 * de alta densidad) y pesan entre 2 y 50 KB.
 *
 * Los originales se quedan en `public/`: el CMS guarda sus rutas y alguien puede querer bajarlos.
 * La traducción se hace al pintar, así el CMS sigue guardando la ruta del original y una imagen
 * que alguien suba después —y que no está en esta lista— se muestra tal cual, sin romperse.
 */
const LIGHT_VERSIONS: Record<string, string> = {
  '/brand/verdeo-logo.png': '/brand/verdeo-logo-440.webp',
  '/brand/verdeo-icon.png': '/brand/verdeo-icon-128.webp',
  '/menus/antiage.png': '/menus/thumbs/antiage.webp',
  '/menus/Keto.png': '/menus/thumbs/Keto.webp',
  '/menus/real.png': '/menus/thumbs/real.webp',
  '/menus/vegetariano.png': '/menus/thumbs/vegetariano.webp',
  '/menus/intuitivo.png': '/menus/thumbs/intuitivo.webp',
};

/** La ruta liviana si la imagen tiene una; si no, la misma que llegó. */
export function lightImage(url: string): string {
  return LIGHT_VERSIONS[url] ?? url;
}
