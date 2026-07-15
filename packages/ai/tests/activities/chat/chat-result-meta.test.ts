/**
 * Type-only tests for the `chat()` result phantom (`ChatResultMeta`).
 *
 * `chat()` returns `TextActivityResult<TSchema, TStream> &
 * ChatResultMeta<TTools, TSchema, TStream>` — an optional, runtime-absent
 * carrier that lets downstream consumers (e.g. `useAssistant`) recover the
 * tool set + structured-output schema that would otherwise be erased by the
 * time the caller only has `ReturnType<typeof someChatCallback>`.
 *
 * The phantom is optional (`'~chatMeta'?:`), so it must not change
 * assignability of `chat()`'s return to its pre-existing consumers (see
 * `chat-result-types.test.ts` and `activities/transaction/index.test.ts` for
 * the pinned pre-phantom shapes).
 */
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../../../src/activities/chat/index.js'
import { toolDefinition } from '../../../src/activities/chat/tools/tool-definition.js'
import { createMockAdapter } from '../../test-utils.js'
import type {
  ChatStream,
  InferChatSchema,
  InferChatTools,
  StreamChunk,
} from '../../../src/types.js'

describe('chat() result phantom (~chatMeta)', () => {
  const { adapter } = createMockAdapter({ iterations: [[]] })

  it('InferChatTools recovers the tool tuple passed to `tools`', () => {
    const weatherTool = toolDefinition({
      name: 'get_weather',
      description: 'Get the weather for a city',
      inputSchema: z.object({ city: z.string() }),
    }).server(() => ({ tempC: 20 }))

    const result = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      tools: [weatherTool],
    })

    type R = typeof result
    type Tools = InferChatTools<R>

    // The captured tool set includes the tool passed to `tools`.
    expectTypeOf<Tools[0]>().toEqualTypeOf<typeof weatherTool>()
    expectTypeOf<Tools[0]['name']>().toEqualTypeOf<'get_weather'>()
  })

  it('InferChatSchema recovers the `outputSchema` passed to chat()', () => {
    const schema = z.object({ greeting: z.string() })

    const result = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      outputSchema: schema,
      stream: true,
    })

    type R = typeof result
    type Schema = InferChatSchema<R>

    expectTypeOf<Schema>().toEqualTypeOf<typeof schema>()
  })

  it('InferChatSchema is `undefined` when no outputSchema is passed', () => {
    const result = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
    })

    type R = typeof result
    type Schema = InferChatSchema<R>

    expectTypeOf<Schema>().toEqualTypeOf<undefined>()
  })

  it('the phantom does not break assignability to ChatStream / AsyncIterable<StreamChunk>', () => {
    const result = chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
    })

    type R = typeof result

    expectTypeOf<R>().toMatchTypeOf<ChatStream>()
    expectTypeOf<R>().toMatchTypeOf<AsyncIterable<StreamChunk>>()

    // Regression guard: existing consumers that assign `chat()`'s return
    // directly to `AsyncIterable<StreamChunk>` (e.g.
    // `toServerSentEventsResponse`) must still compile with the phantom
    // present.
    const _assignable: AsyncIterable<StreamChunk> = result
    void _assignable
  })
})
