import { inMemory } from '@tanstack/ai-memory/in-memory'
import type { RecallResult } from '@tanstack/ai-memory'

/**
 * Process-local memory backing the `/memory` demo page.
 *
 * `inMemory()` stores everything in an in-process `Map`, so the chat route
 * (which writes via `memoryMiddleware`) and the inspect route (which reads via
 * `inspect`/`listFacts`) MUST share this exact singleton — a second
 * `inMemory()` call would have its own, empty store.
 *
 * Defaults are deliberate: no `embedder`/`extract`, so `save` just stores the
 * raw user/assistant turn (kind `message`). That keeps the demo zero-dep and
 * makes the stored content legible in the panel. To demo derived facts or
 * semantic recall, pass `{ extract, embedder }` to `inMemory()` here.
 */
export const memoryAdapter = inMemory()

/**
 * Records what the last `recall` injected for each session, so the page can
 * show "what memory fed into this turn". Populated from the middleware's
 * `onRecall` callback in the chat route; read by the inspect route.
 */
export const lastRecallBySession = new Map<string, RecallResult>()
