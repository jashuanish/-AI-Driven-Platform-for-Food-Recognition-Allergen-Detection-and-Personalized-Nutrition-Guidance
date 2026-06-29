import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // NutriVision Flask backend (Bio1). The meal-analysis mode calls
        // /nutri-api/* which is rewritten to /api/* on the Flask server,
        // keeping it clear of the AddiSafe gateway's own /api routes.
        '/nutri-api': {
          target: `http://127.0.0.1:${env.NUTRI_API_PORT || 5000}`,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/nutri-api/, '/api'),
        },
        // AddiSafe gateway (server.js). The frontend probes /api/health and
        // falls back to direct upstream calls when the gateway is offline.
        '/api': {
          // GATEWAY_PORT, not PORT: dev runners inject PORT for the Vite
          // process itself, which would make the proxy loop back to Vite.
          target: `http://localhost:${env.GATEWAY_PORT || 8787}`,
          changeOrigin: true,
        },
      },
    },
  };
});
