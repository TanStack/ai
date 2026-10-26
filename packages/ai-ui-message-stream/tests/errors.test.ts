import { describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { toolDefinition } from '@tanstack/ai/client'
import { readUIMessageStream } from 'ai'
import { z } from 'zod'
import { fromUIMessageStream, toUIMessageStream } from '../src'
import type { StreamChunk } from '@tanstack/ai'
import type { UIMessageChunk } from 'ai'

async function chunksOf(
  stream: ReadableStream<UIMessageChunk>,
): Promise<Array<UIMessageChunk>> {
  const out: Array<UIMessageChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

async function eventsOf(
  list: Array<UIMessageChunk>,
): Promise<Array<StreamChunk>> {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of list) controller.enqueue(chunk)
      controller.close()
    },
  })
  const out: Array<StreamChunk> = []
  for await (const event of fromUIMessageStream(stream, {
    threadId: 't',
    runId: 'r',
  }))
    out.push(event)
  return out
}

describe('TanStack server, AI SDK client: errors', () => {
  it('sends a thrown chat() error as an error chunk', async () => {
    async function* failing(): AsyncGenerator<StreamChunk> {
      yield { type: EventType.RUN_STARTED, threadId: 't', runId: 'r' }
      throw new Error('401 Unauthorized')
    }
    const chunks = await chunksOf(toUIMessageStream(failing()))
    expect(chunks.at(-1)).toEqual({
      type: 'error',
      errorText: '401 Unauthorized',
    })
  })

  it('sends RUN_ERROR as an error chunk with no finish', async () => {
    const fake = fakeText()
    fake.setResponses([{ error: 'Overloaded' }])
    const chunks = await chunksOf(
      toUIMessageStream(chat({ adapter: fake, threadId: 't', messages: [] })),
    )
    expect(chunks).toContainEqual({ type: 'error', errorText: 'Overloaded' })
    expect(chunks.some((c) => c.type === 'finish')).toBe(false)
  })

  it('shows a thrown server tool as an output error', async () => {
    const fake = fakeText()
    fake.setResponses([
      { toolCalls: [{ name: 'lookup', input: { id: 1 } }] },
      { text: 'Sorry.' },
    ])
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look up a record',
      inputSchema: z.object({ id: z.number() }),
    }).server(() => {
      throw new Error('Database down')
    })
    let last
    for await (const message of readUIMessageStream({
      stream: toUIMessageStream(
        chat({ adapter: fake, threadId: 't', messages: [], tools: [lookup] }),
      ),
    }))
      last = message
    expect(last?.parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-lookup',
        state: 'output-error',
        errorText: expect.stringContaining('Database down'),
      }),
    )
  })

  it('sends broken tool arguments as an input error', async () => {
    const chunks = await chunksOf(
      toUIMessageStream(
        (async function* (): AsyncGenerator<StreamChunk> {
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'c-1',
            toolCallName: 'ask',
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'c-1',
            delta: '{"q":',
          }
          yield { type: EventType.TOOL_CALL_END, toolCallId: 'c-1' }
        })(),
      ),
    )
    expect(chunks).toContainEqual(
      expect.objectContaining({
        type: 'tool-input-error',
        toolCallId: 'c-1',
        input: '{"q":',
      }),
    )
    expect(chunks.some((c) => c.type === 'tool-input-available')).toBe(false)
  })

  it('stops chat() when the AI SDK client goes away', async () => {
    let closed = false
    async function* endless(): AsyncGenerator<StreamChunk> {
      try {
        for (;;) {
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'm',
            delta: 'x',
          }
        }
      } finally {
        closed = true
      }
    }
    const reader = toUIMessageStream(endless()).getReader()
    await reader.read()
    await reader.cancel()
    expect(closed).toBe(true)
  })
})

describe('AI SDK server, TanStack client: errors', () => {
  it('ends with RUN_ERROR and no RUN_FINISHED on an error chunk', async () => {
    const events = await eventsOf([
      { type: 'start' },
      { type: 'error', errorText: 'Rate limited' },
      { type: 'finish' },
    ])
    expect(events.at(-1)).toEqual({
      type: EventType.RUN_ERROR,
      message: 'Rate limited',
    })
    expect(events.some((e) => e.type === EventType.RUN_FINISHED)).toBe(false)
  })

  it('ends a cancelled run on an abort chunk', async () => {
    const events = await eventsOf([{ type: 'start' }, { type: 'abort' }])
    expect(events.at(-1)).toMatchObject({
      type: EventType.RUN_FINISHED,
      outcome: { type: 'cancelled' },
    })
  })

  it('sends tool input and output errors as error results', async () => {
    const events = await eventsOf([
      { type: 'start' },
      {
        type: 'tool-input-error',
        toolCallId: 'c-1',
        toolName: 'ask',
        input: '{"q":',
        errorText: 'Invalid input',
      },
      {
        type: 'tool-input-available',
        toolCallId: 'c-2',
        toolName: 'lookup',
        input: { id: 1 },
      },
      { type: 'tool-output-error', toolCallId: 'c-2', errorText: 'Not found' },
      { type: 'finish' },
    ])
    const results = events.filter((e) => e.type === EventType.TOOL_CALL_RESULT)
    expect(results).toMatchObject([
      {
        toolCallId: 'c-1',
        content: 'Invalid input',
        metadata: { tanstack: { state: 'output-error' } },
      },
      {
        toolCallId: 'c-2',
        content: 'Not found',
        metadata: { tanstack: { state: 'output-error' } },
      },
    ])
  })
})
