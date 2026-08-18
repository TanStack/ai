import { inMemory } from '@tanstack/ai-memory/in-memory'
import type { MemoryScope, RecallResult } from '@tanstack/ai-memory'

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
 * Server-trusted demo identity. Never accept `userId` / `tenantId` from the
 * client — the panel is a local demo without real auth, so these constants are
 * the isolation dims. Production apps must derive every Scope field from a
 * validated session.
 */
export const PANEL_MEMORY_USER = 'panel-demo-user'
export const PANEL_MEMORY_TENANT = 'panel-demo'

/**
 * Build the middleware/inspect scope for a client-chosen thread. User and
 * tenant come only from the server constants above.
 */
export function panelMemoryScope(threadId: string): MemoryScope {
  return {
    threadId,
    userId: PANEL_MEMORY_USER,
    tenantId: PANEL_MEMORY_TENANT,
  }
}

/** Composite key matching built-in adapter isolation dims (not threadId alone). */
export function panelScopeKey(scope: MemoryScope): string {
  return `${scope.tenantId ?? '_'}|${scope.userId ?? '_'}|${scope.threadId}`
}

/**
 * Records what the last `recall` injected for each composite scope, so the
 * page can show "what memory fed into this turn". Populated from the
 * middleware's `onRecall` callback in the chat route; read by the inspect
 * route.
 */
export const lastRecallByThread = new Map<string, RecallResult>()
