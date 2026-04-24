import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type PluginOption } from 'vite';

const target = process.env.LELE_TARGET === 'firefox' ? 'firefox' : 'chrome';

const manifestPlugin = (): PluginOption => ({
  name: 'lele-tab-manifest',
  generateBundle() {
    const manifestPath = resolve(__dirname, `manifest.${target}.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    this.emitFile({
      type: 'asset',
      fileName: 'manifest.json',
      source: JSON.stringify(manifest, null, 2)
    });
  }
});

export default defineConfig({
  plugins: [react(), manifestPlugin()],
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        newtab: resolve(__dirname, 'newtab.html'),
        options: resolve(__dirname, 'options.html'),
        sw: resolve(__dirname, 'src/background/sw.ts')
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts']
  }
});
