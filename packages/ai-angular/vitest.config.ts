/// <reference types="vitest" />
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import angular from '@analogjs/vite-plugin-angular'

export default defineConfig({
  plugins: [angular({ jit: true })],
  resolve: {
    alias: {
      '@tanstack/ai-angular': fileURLToPath(
        new URL('./src/index.ts', import.meta.url),
      ),
    },
  },
  optimizeDeps: {
    exclude: [
      '@angular/core',
      '@angular/core/testing',
      '@angular/platform-browser',
      '@angular/platform-browser/testing',
      '@angular/platform-browser-dynamic',
      '@angular/platform-browser-dynamic/testing',
      '@angular/common',
      '@angular/compiler',
    ],
  },
  test: {
    name: '@tanstack/ai-angular',
    globals: true,
    environment: 'jsdom',
    setupFiles: ['vitest.setup.ts'],
    pool: 'forks',
    singleFork: true,
  },
})
