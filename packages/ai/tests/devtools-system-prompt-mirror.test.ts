import { describe, it, expectTypeOf } from 'vitest'
import type { SystemPrompt } from '../src/system-prompts'

/**
 * `@tanstack/ai-event-client/src/devtools-middleware.ts` intentionally
 * duplicates the `SystemPrompt` shape locally as `DevtoolsSystemPrompt` to
 * avoid a circular import (`@tanstack/ai-event-client` is a runtime dep of
 * `@tanstack/ai`, so the devtools middleware can't depend back on
 * `@tanstack/ai`'s types directly).
 *
 * Re-declare the mirror here and assert structural equality against the
 * canonical `SystemPrompt`. The test lives in `@tanstack/ai` rather than
 * `@tanstack/ai-event-client` because the Nx project graph would resolve
 * a `@tanstack/ai`-importing test in `ai-event-client` only via a circular
 * `workspace:*` dev-dep, which we deliberately avoid.
 *
 * If `SystemPrompt` ever gains a third variant (or the existing shape
 * changes), this guard fails at type-check time — forcing the maintainer
 * to update both the source mirror in `devtools-middleware.ts` and this
 * test mirror, rather than silently emitting `undefined` from the wire
 * projection `typeof p === 'string' ? p : p.content`.
 */
type DevtoolsSystemPrompt = string | { content: string; metadata?: unknown }

describe('DevtoolsSystemPrompt structural mirror of SystemPrompt', () => {
  it('the local devtools mirror is mutually assignable with SystemPrompt', () => {
    expectTypeOf<SystemPrompt>().toExtend<DevtoolsSystemPrompt>()
    expectTypeOf<DevtoolsSystemPrompt>().toExtend<SystemPrompt>()
  })
})
