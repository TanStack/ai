import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

/**
 * Builds the in-page panel as a single IIFE bundle. The proxy serves it at
 * `/__coco/client.js`; the panel runs inside the host page's window but inside
 * a Shadow DOM root to keep CSS/DOM isolated from the host app.
 */
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: fileURLToPath(new URL('./src/client/index.ts', import.meta.url)),
      formats: ['iife'],
      name: 'CocoPanel',
      fileName: () => 'client.js',
    },
    rollupOptions: {
      output: {
        // Avoid creating a separate CSS file — we inline styles into the
        // Shadow DOM via a string constant.
        assetFileNames: 'client.[ext]',
      },
    },
  },
})
