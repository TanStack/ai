import { memoryPersistence } from '@tanstack/ai-persistence'

/**
 * Server persistence for the generation demo. `memoryPersistence()` ships the
 * three stores generation persistence uses — `generationRuns` (run lifecycle +
 * result metadata), plus `artifacts` and `blobs` for durable byte storage — so a
 * reload restores the actual generated image, not just its status. The generate
 * route and the artifact serve route both import this module so they share one
 * store. Point it at a durable backend for production.
 */
export const generationServerPersistence = memoryPersistence()
