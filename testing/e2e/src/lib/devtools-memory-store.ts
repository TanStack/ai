import { inMemory } from '@tanstack/ai-memory/in-memory'

/**
 * Shared process-local memory adapter for the `/devtools-memory` E2E route.
 * The default `inMemory()` stores raw user/assistant turns (kind `message`)
 * with zero deps — legible for asserting "what's in memory" in the devtools
 * panel. Scope is keyed per-test by `sessionId` (the Playwright `testId`).
 */
export const devtoolsMemoryAdapter = inMemory()
