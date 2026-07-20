import { describe, expectTypeOf, it } from 'vitest'
import type { SystemPrompt } from '../src/system-prompts'

// Mirror of `DevtoolsSystemPrompt` from
// `@tanstack/ai-event-client/src/devtools-middleware.ts`; the test lives here
// (in `@tanstack/ai`) because letting that package import `@tanstack/ai`
// would create a circular workspace dep. If `SystemPrompt` changes shape,
// the mutual-assignability assertion below fails — forcing both mirrors to
// be updated in lockstep.
type DevtoolsSystemPrompt = string | { content: string; metadata?: unknown }

describe('DevtoolsSystemPrompt structural mirror of SystemPrompt', () => {
  it('the local devtools mirror is mutually assignable with SystemPrompt', () => {
    expectTypeOf<SystemPrompt>().toExtend<DevtoolsSystemPrompt>()
    expectTypeOf<DevtoolsSystemPrompt>().toExtend<SystemPrompt>()
  })
})
