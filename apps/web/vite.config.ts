import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

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
    plugins: [react(), tailwindcss()],
    server: { port: 5173 },
  };
});
