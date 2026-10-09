import { defineConfig } from '@playwright/test'
import config from './playwright.config'

export default defineConfig(config, {
  fullyParallel: false,
  // This measures browser long tasks and needs an agent without other browsers.
  testIgnore: '**/chat-client-stream-processing.spec.ts',
})
