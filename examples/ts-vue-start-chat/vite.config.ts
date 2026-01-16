import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/vue-start/plugin/vite'
import { devtools } from '@tanstack/devtools-vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    devtools({
      // Vue warns if arbitrary attributes are passed to components that render
      // fragments/teleports (like `Html`/`HeadContent`). Ignore those components
      // so `data-tsd-source` injection doesn't flood the dev server output.
      injectSource: {
        ignore: {
          components: ['Html', 'HeadContent', 'Body', 'Outlet', 'Scripts'],
        },
      },
    }),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    vue(),
    vueJsx(),
  ],
})
