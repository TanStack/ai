import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2020',
    sourcemap: true,
    lib: {
      entry: './src/index.ts',
      formats: ['es'],
      fileName: () => 'index.qwik.mjs',
    },
    rollupOptions: {
      external: [
        /^@qwik\.dev\/core/,
        /^@tanstack\/ai-client/,
        /^@tanstack\/ai(\/.*)?$/,
      ],
    },
  },
})
