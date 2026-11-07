import { describe, expect, expectTypeOf, it } from 'vitest'
import { Context, Effect, Fiber, Layer, Schema, Stream } from 'effect'
import { toolDefinition } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { chat, serverTool, toolSchema } from '../src/chat'
import type { ChatResult, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { FakeResponseStep } from '@tanstack/ai/testing'
import type { AIError } from '../src/lift'

class Db extends Context.Service<
  Db,
  { readonly cityOf: (id: string) => Effect.Effect<string> }
>()('Db') {}

const DbLive = Layer.succeed(Db, {
  cityOf: (id) => Effect.succeed(`city-of-${id}`),
})

const cityDef = toolDefinition({
  name: 'getCity',
  description: 'Get the city of a user',
  inputSchema: toolSchema(Schema.Struct({ id: Schema.String })),
  outputSchema: toolSchema(Schema.Struct({ city: Schema.String })),
})

const callGetCity: FakeResponseStep = {
  toolCalls: [{ name: 'getCity', input: { id: 'u1' } }],
}

const messages: Array<ModelMessage> = [{ role: 'user', content: 'Hi' }]

function fakeWith(responses: Array<FakeResponseStep>) {
  const adapter = fakeText()
  adapter.setResponses(responses)
  return adapter
}

/** A response step that keeps the request it answers. */
function recordRequest(text: string) {
  const seen: { messages?: Array<ModelMessage>; signal?: AbortSignal } = {}
  const step: FakeResponseStep = ({ request }) => {
    seen.messages = request.messages
    seen.signal = request.request?.signal ?? request.abortController?.signal
    return { text }
  }
  return { step, seen }
}

function textOf(chunks: ReadonlyArray<StreamChunk>) {
  return chunks
    .flatMap((chunk) =>
      chunk.type === 'TEXT_MESSAGE_CONTENT' ? [chunk.delta] : [],
    )
    .join('')
}

function toolMessageOf(sent: Array<ModelMessage> | undefined) {
  return sent?.find((message) => message.role === 'tool')?.content
}

describe('chat', () => {
  it('streams chunks from the adapter', async () => {
    const adapter = fakeWith([{ text: 'Hello world' }])

    const chunks = await Effect.runPromise(
      Stream.runCollect(chat({ adapter, messages, threadId: 't1' })),
    )

    expect(textOf(chunks)).toBe('Hello world')
    expect(chunks.at(-1)?.type).toBe('RUN_FINISHED')
  })

  it('with stream: false returns the text as an Effect', async () => {
    const adapter = fakeWith([{ text: 'Hello world' }])

    const result = await Effect.runPromise(
      chat({ adapter, messages, threadId: 't1', stream: false }),
    )

    expect(result.text).toBe('Hello world')
  })

  it('with outputSchema returns the parsed object', async () => {
    const adapter = fakeWith([{ text: '{"city":"Oslo"}' }])

    const result = await Effect.runPromise(
      chat({
        adapter,
        messages,
        threadId: 't1',
        outputSchema: Schema.toStandardJSONSchemaV1(
          Schema.Struct({ city: Schema.String }),
        ),
      }),
    )

    expect(result).toEqual({ city: 'Oslo' })
  })

  it('Effect tool reads a service provided with a Layer', async () => {
    const { step, seen } = recordRequest('done')
    const adapter = fakeWith([callGetCity, step])
    const getCity = serverTool(cityDef, ({ id }) =>
      Effect.gen(function* () {
        const db = yield* Db
        return { city: yield* db.cityOf(id) }
      }),
    )

    const chunks = await Effect.runPromise(
      Stream.runCollect(
        chat({ adapter, messages, threadId: 't1', tools: [getCity] }),
      ).pipe(Effect.provide(DbLive)),
    )

    expect(JSON.parse(String(toolMessageOf(seen.messages)))).toEqual({
      city: 'city-of-u1',
    })
    expect(textOf(chunks)).toBe('done')
  })

  it.each([
    ['a typed failure', Effect.fail(new Error('db is down'))],
    ['a defect', Effect.die(new Error('db is down'))],
  ])(
    'Effect tool failure (%s) reaches the model as a tool error and the run finishes',
    async (_name, failure) => {
      const { step, seen } = recordRequest('sorry')
      const adapter = fakeWith([callGetCity, step])
      const getCity = serverTool(cityDef, () => failure)

      const chunks = await Effect.runPromise(
        Stream.runCollect(
          chat({ adapter, messages, threadId: 't1', tools: [getCity] }),
        ),
      )

      expect(String(toolMessageOf(seen.messages))).toContain('db is down')
      expect(textOf(chunks)).toBe('sorry')
      expect(chunks.at(-1)?.type).toBe('RUN_FINISHED')
    },
  )

  it('stopping the stream early aborts the run', async () => {
    const { step, seen } = recordRequest('a long answer in many chunks')
    const adapter = fakeWith([step])

    const chunks = await Effect.runPromise(
      Stream.runCollect(
        chat({ adapter, messages, threadId: 't1' }).pipe(
          Stream.filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT'),
          Stream.take(1),
        ),
      ),
    )

    expect(textOf(chunks)).toBe('a lo')
    expect(seen.signal?.aborted).toBe(true)
  })

  it('aborting during an Effect tool interrupts the tool fiber', async () => {
    const adapter = fakeWith([callGetCity, { text: 'never sent' }])
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let markInterrupted = () => {}
    const interrupted = new Promise<void>((resolve) => {
      markInterrupted = resolve
    })
    const getCity = serverTool(cityDef, () =>
      Effect.sync(markStarted).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() => Effect.sync(markInterrupted)),
      ),
    )
    const fiber = Effect.runFork(
      Stream.runDrain(
        chat({ adapter, messages, threadId: 't1', tools: [getCity] }),
      ),
    )
    await started

    await Effect.runPromise(Fiber.interrupt(fiber))

    await expect(interrupted).resolves.toBeUndefined()
  })

  it('types: R is the services of the Effect tools, and stream: false gives an Effect', () => {
    const adapter = fakeText()
    const getCity = serverTool(cityDef, ({ id }) =>
      Effect.gen(function* () {
        const db = yield* Db
        return { city: yield* db.cityOf(id) }
      }),
    )
    const withTool = chat({
      adapter,
      messages,
      threadId: 't1',
      tools: [getCity],
    })
    const plain = chat({ adapter, messages, threadId: 't1' })
    const whole = chat({ adapter, messages, threadId: 't1', stream: false })

    expectTypeOf<Stream.Services<typeof withTool>>().toEqualTypeOf<Db>()
    expectTypeOf<Stream.Services<typeof plain>>().toEqualTypeOf<never>()
    expectTypeOf<Stream.Error<typeof plain>>().toEqualTypeOf<AIError>()
    expectTypeOf(whole).toEqualTypeOf<
      Effect.Effect<ChatResult, AIError, never>
    >()
  })
})

describe('toolSchema', () => {
  const input = toolSchema(
    Schema.Struct({
      id: Schema.String,
      address: Schema.Struct({ zip: Schema.String }),
    }),
  )

  it('closes every object in draft-07, so strict mode stays on', () => {
    expect(input['~standard'].jsonSchema.input({ target: 'draft-07' })).toEqual(
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          id: { type: 'string' },
          address: {
            type: 'object',
            properties: { zip: { type: 'string' } },
            required: ['zip'],
            additionalProperties: false,
          },
        },
        required: ['id', 'address'],
        additionalProperties: false,
      },
    )
  })

  it('closes objects in draft-2020-12 too', () => {
    expect(
      input['~standard'].jsonSchema.input({ target: 'draft-2020-12' }),
    ).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      additionalProperties: false,
    })
  })

  it('keeps the tool input typed', () => {
    serverTool(cityDef, (args) => {
      expectTypeOf(args).toEqualTypeOf<{ readonly id: string }>()
      return Effect.succeed({ city: 'Oslo' })
    })
  })
})
