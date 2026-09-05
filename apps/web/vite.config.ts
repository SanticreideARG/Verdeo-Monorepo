import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const environment = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL ?? environment.VITE_SUPABASE_URL;
  const supabasePublishableKey =
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    environment.VITE_SUPABASE_PUBLISHABLE_KEY;
  const define: Record<string, string> = {};

  if (supabaseUrl) {
    define['import.meta.env.VITE_SUPABASE_URL'] = JSON.stringify(supabaseUrl);
  }
  if (supabasePublishableKey) {
    define['import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY'] =
      JSON.stringify(supabasePublishableKey);
  }

  return {
    define,
    plugins: [
      react(),
      tailwindcss(),
      /*
       * El service worker, que es lo único que separaba a Verdeo de ser instalable: Android Chrome
       * no ofrece instalar una app que no tenga uno con manejo de red.
       *
       * `manifest: false` a propósito. El manifiesto sigue siendo `public/site.webmanifest`, escrito
       * a mano y enlazado desde el HTML: dejar que el plugin genere otro daría dos manifiestos
       * compitiendo por el mismo `<link>`, y el que gana depende del orden de inyección.
       *
       * No se cachea NADA de la API. Guardar respuestas acá serviría un pedido cancelado como si
       * siguiera activo, y quién ve qué dato viejo es una decisión de negocio, no una opción de
       * build. El offline real —la hoja de ruta del repartidor— va aparte y con su fecha a la vista.
       */
      VitePWA({
        manifest: false,
        registerType: 'autoUpdate',
        // En desarrollo estorba: cachea y después no se entiende por qué no se ve un cambio.
        devOptions: { enabled: false },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
          navigateFallback: '/index.html',
          // Una ruta de API que caiga en el fallback devolvería el HTML de la app como si fuera
          // una respuesta JSON, y el error resultante no se parece en nada a la causa.
          navigateFallbackDenylist: [/^\/api\//],
        },
      }),
    ],
    server: { port: 5173 },
  };
});
