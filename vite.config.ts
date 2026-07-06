import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {spawn} from 'child_process';
import type {Plugin} from 'vite';

function expressServerPlugin(): Plugin {
  return {
    name: 'express-server',
    configureServer(server) {
      console.log('Starting background Express API server on port 3001...');
      const proc = spawn('npx', ['tsx', 'server.ts'], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, PORT: '3001' }
      });
      server.httpServer?.on('close', () => {
        proc.kill();
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), expressServerPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        }
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
