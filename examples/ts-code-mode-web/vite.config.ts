import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { nitroV2Plugin } from '@tanstack/nitro-v2-vite-plugin'
import { devtools } from '@tanstack/devtools-vite'

const config = defineConfig({
  plugins: [
    devtools(),
    nitroV2Plugin(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  // Mark native Node.js addons as external - they can't be bundled by esbuild
  // isolated-vm is used by @tanstack/ai-isolate-node for secure code execution
  ssr: {
    external: [
      'isolated-vm',
      'quickjs-emscripten',
      'quickjs-emscripten-core',
      '@jitl/quickjs-wasmfile-release-asyncify',
      '@jitl/quickjs-wasmfile-release-sync',
      '@jitl/quickjs-wasmfile-debug-asyncify',
      '@jitl/quickjs-wasmfile-debug-sync',
      'esbuild',
      // Google/Gemini related CJS packages
      'google-auth-library',
      'jws',
      'gaxios',
      'gcp-metadata',
      'google-logging-utils',
      // WebSocket and network packages
      'ws',
      'node-fetch',
      // OpenAI packages
      'openai',
      // Puppeteer/PDF packages
      'puppeteer',
    ],
  },
  optimizeDeps: {
    exclude: ['isolated-vm', 'quickjs-emscripten'],
  },
})

export default config
