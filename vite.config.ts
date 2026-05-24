import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    format: 'es'
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        worldgenExplorer: resolve(__dirname, 'tools/worldgen-explorer/index.html')
      }
    }
  }
});
