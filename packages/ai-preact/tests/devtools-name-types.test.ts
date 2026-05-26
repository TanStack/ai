import { describe, expectTypeOf, it } from 'vitest'
import type { AnyClientTool } from '@tanstack/ai'
import type { AIDevtoolsDisplayOptions } from '@tanstack/ai-client'
import type { UseChatOptions } from '../src/types'

type NoTools = ReadonlyArray<AnyClientTool>
type DevtoolsOf<T extends { devtools?: unknown }> = NonNullable<T['devtools']>

describe('Preact devtools display options', () => {
  it('limits hook config to the public display-name shape', () => {
    expectTypeOf<
      DevtoolsOf<UseChatOptions<NoTools>>
    >().toEqualTypeOf<AIDevtoolsDisplayOptions>()
  })
})
