/**
 * Public StreamChunk is AG-UI spec-only. TanStack extras live on
 * AdapterYieldChunk until normalize, then in metadata.tanstack / UIMessage parts.
 */

import { describe, expectTypeOf, it } from 'vitest'
import type { TextActivityResult } from '../src/activities/chat'
import type {
  ChatStream,
  RunFinishedEvent,
  ToolCallEndEvent,
} from '../src/types'

type HasKey<T, K extends string> = K extends keyof T ? true : false

describe('public StreamChunk is spec-only', () => {
  it('RunFinishedEvent has no model/finishReason', () => {
    // AG-UI BaseEvent has `[k: string]: unknown`, so after extras are
    // dropped these keys type as `unknown`, not `string` / finishReason.
    expectTypeOf<RunFinishedEvent['model']>().toEqualTypeOf<unknown>()
    expectTypeOf<RunFinishedEvent['finishReason']>().toEqualTypeOf<unknown>()
  })

  it('ToolCallEndEvent has no input/output/result/toolName', () => {
    expectTypeOf<HasKey<ToolCallEndEvent, 'input'>>().toEqualTypeOf<false>()
    expectTypeOf<HasKey<ToolCallEndEvent, 'output'>>().toEqualTypeOf<false>()
    expectTypeOf<HasKey<ToolCallEndEvent, 'result'>>().toEqualTypeOf<false>()
    expectTypeOf<HasKey<ToolCallEndEvent, 'toolName'>>().toEqualTypeOf<false>()
  })

  it('TextActivityResult<undefined, true> equals ChatStream', () => {
    expectTypeOf<
      TextActivityResult<undefined, true>
    >().toEqualTypeOf<ChatStream>()
  })
})
