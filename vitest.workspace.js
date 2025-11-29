// @ts-check

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      './packages/ai/vite.config.ts',
      './packages/ai-lite/vite.config.ts',
      './packages/react-ai/vite.config.ts',
      './packages/react-ai-devtools/vite.config.ts',
      './packages/solid-ai/vite.config.ts',
      './packages/solid-ai-devtools/vite.config.ts',
    ],
  },
})
