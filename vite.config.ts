import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // The v0 preview proxies the app through a separate origin. Disabling
      // the dev websocket prevents the preview iframe from failing while the
      // Express/Vite middleware continues serving the SPA normally.
      hmr: false,
      watch: null,
    },
  };
});
