/**
 * El PDF de las etiquetas, armado en el navegador (2026-10-27).
 *
 * Con "Imprimir" la hoja pasa por el diálogo del navegador, y ahí es fácil que salga achicada
 * ("Ajustar a la página", márgenes por defecto): una impresión salió entera al 87 %. El PDF ya
 * viene en A4 exacto, una hoja por página, con cada etiqueta en sus milímetros.
 *
 * Es la misma hoja que se imprime, pasada a imagen a 300 ppp (nítida para el tamaño de una
 * etiqueta). No se genera en el servidor: eso pide un Chrome dentro de la función. Las dos
 * librerías se cargan recién al apretar el botón, así no pesan en el resto del panel.
 */
import { PRODUCTION_PAPER } from '@verdeo/labels';

/** 300 ppp sobre los 96 px por pulgada de CSS. */
const PIXEL_RATIO = 300 / 96;

/** Carga la hoja en un marco oculto y espera a que ajuste los nombres y cargue las tipografías. */
function loadSheets(html: string): Promise<{ done: () => void; view: Window }> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;left:-300mm;top:0;width:210mm;height:297mm;border:0;';
    frame.srcdoc = html;
    frame.onload = () => {
      const view = frame.contentWindow;
      if (!view) {
        frame.remove();
        reject(new Error('No se pudo preparar la hoja.'));
        return;
      }
      const started = Date.now();
      const ready = () => {
        if (
          !view.document.documentElement.hasAttribute('data-fitted') &&
          Date.now() - started < 4_000
        ) {
          window.setTimeout(ready, 100);
          return;
        }
        void view.document.fonts.ready.then(() => resolve({ done: () => frame.remove(), view }));
      };
      ready();
    };
    document.body.append(frame);
  });
}

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer la tipografía.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Las tipografías de la hoja, metidas adentro. La imagen de cada hoja no puede ir a buscarlas a
 * Google, y la librería no puede leer esa hoja de estilos por ser de otro origen: sin esto, el PDF
 * sale con la letra de reemplazo. Sólo los juegos latinos: los nombres de los platos no usan otros.
 */
async function embeddedFonts(view: Window): Promise<string> {
  const link = view.document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
  if (!link) return '';
  const css = await (await fetch(link.href)).text();
  const blocks = css
    .split(/(?=\/\* [\w-]+ \*\/)/)
    .filter((block) => /^\/\* latin(-ext)? \*\//.test(block));
  const inlined = await Promise.all(
    blocks.map(async (block) => {
      const url = /url\((https:[^)]+)\)/.exec(block)?.[1];
      if (!url) return block;
      return block.replace(url, await dataUrl(await (await fetch(url)).blob()));
    }),
  );
  return inlined.join('\n');
}

export async function downloadLabelsPdf(html: string, fileName: string): Promise<void> {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const { done, view } = await loadSheets(html);
  try {
    const p = PRODUCTION_PAPER;
    const pdf = new jsPDF({ format: [p.pageWidthMm, p.pageHeightMm], unit: 'mm' });
    /*
     * Una impresión del PDF salió entera al ~95 % (2026-10-28): el visor la ajustó al área
     * imprimible. Con esto Acrobat y el visor de Chrome arrancan en "Tamaño real".
     */
    pdf.viewerPreferences({ PrintScaling: 'None' });
    const fontEmbedCSS = await embeddedFonts(view);
    const sheets = [...view.document.querySelectorAll<HTMLElement>('.sheet')];
    for (const [index, sheet] of sheets.entries()) {
      const canvas = await toCanvas(sheet, {
        backgroundColor: '#ffffff',
        fontEmbedCSS,
        pixelRatio: PIXEL_RATIO,
      });
      if (index > 0) pdf.addPage([p.pageWidthMm, p.pageHeightMm]);
      pdf.addImage(canvas, 'PNG', 0, 0, p.pageWidthMm, p.pageHeightMm, undefined, 'FAST');
    }
    pdf.save(fileName);
  } finally {
    done();
  }
}
