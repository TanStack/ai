import { defineConfig } from 'vitest/config'
import solid from 'vite-plugin-solid'
import packageJson from './package.json'

export default defineConfig({
  plugins: [solid() as any],
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    coverage: { enabled: true, include: ['src/**/*'] },
    typecheck: { enabled: true },
  },
})
