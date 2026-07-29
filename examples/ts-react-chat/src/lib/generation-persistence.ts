import { localStoragePersistence } from '@tanstack/ai-client'
import type { GenerationPersistence } from '@tanstack/ai-client'

/**
 * Shared generation persistence for the example app.
 *
 * Every generation route wires its hooks through this adapter. The client
 * namespaces its record under `generation:<hook id>`, so one adapter serves
 * every hook as long as each hook passes a stable `id` — each hook's last
 * run (status, result metadata, error — never media bytes) then survives a
 * full page reload exactly as the library intends.
 */
export const generationPersistence: GenerationPersistence =
  localStoragePersistence({ keyPrefix: 'example:' })
