import { localStoragePersistence } from '@tanstack/ai-client'
import type { GenerationPersistence } from '@tanstack/ai-client'

/**
 * Shared generation persistence for the example app.
 *
 * Every generation route wires its hooks through this adapter. The client
 * namespaces its record under `generation:<threadId>`, so one adapter serves
 * every hook as long as each passes a stable `threadId` — required whenever
 * `persistence` is set. Each hook's last run (status, result metadata, error —
 * never media bytes) then survives a full page reload.
 *
 * This is the CLIENT-driven half. `/api/generate/image` also runs the
 * server-driven half (`withGenerationPersistence` + `reconstructGeneration`);
 * see `generations.image.tsx` for a hook using `persistence: true` instead.
 */
export const generationPersistence: GenerationPersistence =
  localStoragePersistence({ keyPrefix: 'example:' })
