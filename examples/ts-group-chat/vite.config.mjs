import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { websocketRpcPlugin } from './chat-server/vite-plugin.js'
import { devtools } from '@tanstack/devtools-vite'

const config = defineConfig({
  plugins: [
    devtools(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    websocketRpcPlugin(),
  ],
  server: {
    port: 3000,
    host: true,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        format: 'es',
      },
    },
  },
  esbuild: {
    target: 'es2022',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2022',
    },
  },
  ssr: {
    noExternal: [
      '@tanstack/ai',
      '@tanstack/ai-anthropic',
      '@tanstack/ai-client',
      '@tanstack/ai-react',
    ],
  },
})

export default config
