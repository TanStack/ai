import { describe, it, expectTypeOf } from 'vitest'
import type { SystemPrompt } from '@tanstack/ai'

/**
 * `@tanstack/ai-event-client/src/devtools-middleware.ts` intentionally
 * duplicates the `SystemPrompt` shape locally to avoid a circular import
 * (`@tanstack/ai-event-client` is a runtime dep of `@tanstack/ai`).
 *
 * Re-declare the mirror here and assert structural equality against the
 * canonical `SystemPrompt` from `@tanstack/ai`. If `SystemPrompt` ever
 * gains a third variant (or the existing shape changes), this guard fails
 * at type-check time — forcing the maintainer to update the mirror in
 * `devtools-middleware.ts` rather than silently emitting `undefined` from
 * the projection `typeof p === 'string' ? p : p.content`.
 */
type DevtoolsSystemPrompt = string | { content: string; metadata?: unknown }

describe('DevtoolsSystemPrompt structural mirror of SystemPrompt', () => {
  it('the local mirror is mutually assignable with @tanstack/ai SystemPrompt', () => {
    expectTypeOf<SystemPrompt>().toExtend<DevtoolsSystemPrompt>()
    expectTypeOf<DevtoolsSystemPrompt>().toExtend<SystemPrompt>()
  })
})
