import { defineConfig } from '@tanstack/react-start/config'
import viteTsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  vite: {
    plugins: () => [
      viteTsConfigPaths({
        projects: ['./tsconfig.json'],
      }),
    ],
  },
})
