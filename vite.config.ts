import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Ignore database files and tests from triggering HMR / full reload
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: [
          '**/arez_data.json',
          '**/arez_data.json.bak',
          '**/*.log',
          '**/tests/**',
          '**/*.png',
          '**/*.jpg',
          '**/.user_uploaded/**',
          '**/scratch/**',
        ],
      },
    },
  };
});
