import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { EventType } from '../src/types'
import { fakeText } from '../src/testing'
import { resolveDebugOption } from '../src/logger/resolve'
import { collectChunks, serverTool } from './test-utils'
import type { AdapterYieldChunk } from '../src/utilities/adapter-yield-chunk'
import type { ModelMessage, StreamChunk, TextOptions } from '../src/types'

function textOf(chunks: Array<StreamChunk>) {
  return chunks
    .flatMap((chunk) =>
      chunk.type === EventType.TEXT_MESSAGE_CONTENT ? [chunk.delta] : [],
    )
    .join('')
}

function runError(chunks: Array<StreamChunk>) {
  return chunks.find((chunk) => chunk.type === EventType.RUN_ERROR)
}

const logger = resolveDebugOption(false)

function request(
  messages: Array<ModelMessage>,
  extra: Omit<TextOptions, 'model' | 'messages' | 'logger'> = {},
) {
  const options: TextOptions = {
    model: 'fake-model',
    messages,
    logger,
    ...extra,
  }
  return options
}

/** The adapter's own events, before `chat()` normalizes them. */
async function adapterEvents(
  fake: ReturnType<typeof fakeText>,
  options: TextOptions,
) {
  const events: Array<AdapterYieldChunk> = []
  for await (const event of fake.chatStream(options)) events.push(event)
  return events
}

function finished(events: Array<AdapterYieldChunk>) {
  return events.find((event) => event.type === EventType.RUN_FINISHED)
}

const hi: Array<ModelMessage> = [{ role: 'user', content: 'Hi' }]

describe('fakeText', () => {
  it('answers chat() from the queue', async () => {
    const fake = fakeText()
    fake.setResponses([{ text: 'Hello there' }])

    const chunks = await collectChunks(chat({ adapter: fake, messages: hi }))

    expect(textOf(chunks)).toBe('Hello there')
    expect(fake.state.callCount).toBe(1)
    expect(fake.pendingResponses()).toBe(0)
  })

  it('builds an answer with a factory that gets the request and the state', async () => {
    const fake = fakeText()
    fake.setResponses([
      ({ request, state }) => ({
        text: `${request.messages.length} messages, call ${state.callCount}`,
      }),
    ])

    const chunks = await collectChunks(chat({ adapter: fake, messages: hi }))

    expect(textOf(chunks)).toBe('1 messages, call 1')
  })

  it('calls tools, then answers with the next response', async () => {
    const fake = fakeText()
    let seen: unknown
    const weather = serverTool('weather', (input) => {
      seen = input
      return 'sunny'
    })
    fake.setResponses([
      { toolCalls: [{ name: 'weather', input: { city: 'Oslo' } }] },
      { text: 'It is sunny.' },
    ])

    const chunks = await collectChunks(
      chat({ adapter: fake, messages: hi, tools: [weather] }),
    )

    expect(seen).toEqual({ city: 'Oslo' })
    expect(textOf(chunks)).toBe('It is sunny.')
    expect(fake.state.callCount).toBe(2)
  })

  it('fails with a RUN_ERROR when the queue is empty or a response is an error', async () => {
    const empty = fakeText()
    const failing = fakeText()
    failing.setResponses([{ error: 'prompt is too long' }])

    const emptyChunks = await collectChunks(
      chat({ adapter: empty, messages: hi }),
    )
    const failingChunks = await collectChunks(
      chat({ adapter: failing, messages: hi }),
    )

    expect(runError(emptyChunks)).toMatchObject({
      message: 'No more fake responses queued',
    })
    expect(runError(failingChunks)).toMatchObject({
      message: 'prompt is too long',
    })
  })

  it('replaces the queue with setResponses and extends it with appendResponses', () => {
    const fake = fakeText()
    fake.setResponses([{ text: 'a' }, { text: 'b' }])
    fake.setResponses([{ text: 'c' }])
    fake.appendResponses([{ text: 'd' }])

    expect(fake.pendingResponses()).toBe(2)
  })

  it('estimates usage as ceil(characters / 4) over the request and the answer', async () => {
    const fake = fakeText()
    fake.setResponses([{ text: 'Hello' }])

    const events = await adapterEvents(
      fake,
      request([{ role: 'user', content: 'abcd' }], {
        systemPrompts: ['Be brief.'],
      }),
    )

    // "system:Be brief.\nuser:abcd" is 26 characters, "Hello" is 5.
    expect(finished(events)).toMatchObject({
      finishReason: 'stop',
      usage: { promptTokens: 7, completionTokens: 2, totalTokens: 9 },
    })
  })

  it('counts an image by its kind, type, and size', async () => {
    const fake = fakeText()
    fake.setResponses([{ text: 'A cat.' }])

    const events = await adapterEvents(
      fake,
      request([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'data',
                value: 'aGVsbG8=',
                mimeType: 'image/png',
              },
            },
          ],
        },
      ]),
    )

    // "user:[image:image/png:8]" is 24 characters.
    expect(finished(events)).toMatchObject({ usage: { promptTokens: 6 } })
  })

  it('sets inputModalities from the input option', () => {
    expect(fakeText({ input: ['text', 'image'] }).inputModalities).toEqual([
      'text',
      'image',
    ])
    expect(fakeText().inputModalities).toBeUndefined()
  })

  it('estimates cache reads from the previous request of the same thread', async () => {
    const fake = fakeText({ cache: true })
    fake.setResponses([{ text: 'One' }, { text: 'Two' }])
    const first: Array<ModelMessage> = [{ role: 'user', content: 'abcdefgh' }]
    const second: Array<ModelMessage> = [
      ...first,
      { role: 'assistant', content: 'One' },
      { role: 'user', content: 'ijkl' },
    ]

    const firstRun = await adapterEvents(
      fake,
      request(first, { threadId: 't' }),
    )
    const secondRun = await adapterEvents(
      fake,
      request(second, { threadId: 't' }),
    )

    // The second request is 37 characters (10 tokens). Its first 13
    // characters, "user:abcdefgh", match the first request: 3 cached tokens.
    expect(finished(firstRun)).toMatchObject({
      usage: { promptTokensDetails: { cachedTokens: 0, cacheWriteTokens: 4 } },
    })
    expect(finished(secondRun)).toMatchObject({
      usage: {
        promptTokens: 10,
        promptTokensDetails: { cachedTokens: 3, cacheWriteTokens: 7 },
      },
    })
  })

  it('streams text in 4-character chunks, at tokensPerSecond', async () => {
    const fake = fakeText({ tokensPerSecond: 50 })
    fake.setResponses([{ text: 'abcdefgh' }])

    const started = Date.now()
    const events = await adapterEvents(fake, request(hi))

    const deltas = events.flatMap((event) =>
      event.type === EventType.TEXT_MESSAGE_CONTENT ? [event.delta] : [],
    )
    expect(deltas).toEqual(['abcd', 'efgh'])
    expect(Date.now() - started).toBeGreaterThanOrEqual(35)
  })

  it('stops streaming when the request aborts', async () => {
    const fake = fakeText({ tokensPerSecond: 100 })
    fake.setResponses([{ text: 'abcdefghijkl' }])
    const abortController = new AbortController()

    const deltas: Array<string> = []
    for await (const event of fake.chatStream(
      request(hi, { abortController }),
    )) {
      if (event.type === EventType.TEXT_MESSAGE_CONTENT) {
        deltas.push(event.delta)
        abortController.abort()
      }
    }

    expect(deltas).toEqual(['abcd'])
  })

  it('answers structured output with the next response as JSON', async () => {
    const fake = fakeText()
    fake.setResponses([{ text: '{"city":"Oslo"}' }])

    const result = await fake.structuredOutput({
      chatOptions: request(hi),
      outputSchema: { type: 'object' },
    })

    expect(result.data).toEqual({ city: 'Oslo' })
  })

  it('stamps parentRunId on RUN_STARTED when the call has one', async () => {
    const fake = fakeText()
    fake.setResponses([{ text: 'One' }, { text: 'Two' }])

    const child = await adapterEvents(
      fake,
      request(hi, { runId: 'run-2', parentRunId: 'run-1' }),
    )
    const top = await adapterEvents(fake, request(hi, { runId: 'run-3' }))

    expect(child[0]).toMatchObject({
      type: EventType.RUN_STARTED,
      runId: 'run-2',
      parentRunId: 'run-1',
    })
    expect(top[0]).not.toHaveProperty('parentRunId')
  })

  it('gives tool calls ids that differ between two fakes', async () => {
    const first = fakeText()
    const second = fakeText()
    const call = { toolCalls: [{ name: 'weather', input: {} }] }
    first.setResponses([call])
    second.setResponses([call])

    const ids = [
      ...(await adapterEvents(first, request(hi))),
      ...(await adapterEvents(second, request(hi))),
    ].flatMap((event) =>
      event.type === EventType.TOOL_CALL_START ? [event.toolCallId] : [],
    )

    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })

  it('keeps the model id and the context window', () => {
    const fake = fakeText({ model: 'tiny', contextWindow: 8_000 })

    expect(fake.model).toBe('tiny')
    expect(fake.contextWindow).toBe(8_000)
  })
})
