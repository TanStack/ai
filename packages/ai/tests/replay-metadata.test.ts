import { EventType } from '../src/types'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import type { AdapterYieldChunk } from '../src/utilities/adapter-yield-chunk'
import type { ModelMessage, Tool } from '../src/types'

const source = { provider: 'custom', api: 'custom-chat', model: 'requested' }

async function capture(adapter: AnyTextAdapter, tools: Array<Tool> = []) {
  let saved: ReadonlyArray<ModelMessage> = []
  const chunks = await collectChunks(
    chat({
      adapter,
      messages: [],
      tools,
      middleware: [
        defineChatMiddleware({
          name: 'save',
          onFinish(ctx) {
            saved = ctx.messages
          },
        }),
      ],
    }),
  )
  const processor = new StreamProcessor()
  for (const chunk of chunks) processor.processChunk(chunk)
  return { saved, chunks, ui: processor.getMessages() }
}

describe('replay metadata', () => {
  it('keeps source and response identity in model history and streamed UI', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('Hello'),
          ev.textEnd(),
          { ...ev.runFinished(), model: 'resolved', responseId: 'response-1' },
        ],
      ],
    })
    const { saved, ui } = await capture({
      ...adapter,
      provider: source.provider,
      api: source.api,
      model: source.model,
    })
    expect(saved[0]?.metadata?.tanstack).toMatchObject({
      source,
      responseId: 'response-1',
      model: 'resolved',
    })
    expect(ui[0]?.metadata?.tanstack).toMatchObject({
      source,
      responseId: 'response-1',
      model: 'resolved',
    })
  })

  it('uses the adapter name and kind when source identity is missing', async () => {
    const { adapter } = createMockAdapter({
      iterations: [[ev.textContent('Hello'), ev.runFinished()]],
    })
    const { saved } = await capture(adapter)
    expect(saved[0]?.metadata?.tanstack?.source).toEqual({
      provider: adapter.name,
      api: 'text',
      model: adapter.model,
    })
    expect(saved[0]?.metadata?.tanstack?.responseId).toBeUndefined()
    expect(saved[0]?.metadata?.tanstack?.stopReason).toBeUndefined()
  })

  it('keeps an explicit event source for the selected wire API', async () => {
    const selected = {
      provider: 'gemini',
      api: 'google-interactions',
      model: 'requested',
    }
    const { adapter } = createMockAdapter({
      iterations: [
        [
          { ...ev.runStarted(), metadata: { tanstack: { source: selected } } },
          ev.textContent('Hello'),
          ev.runFinished(),
        ],
      ],
    })
    const { saved, ui } = await capture({
      ...adapter,
      provider: 'gemini',
      api: 'google-generative-ai',
      model: 'requested',
    })
    expect(saved[0]?.metadata?.tanstack?.source).toEqual(selected)
    expect(ui[0]?.metadata?.tanstack?.source).toEqual(selected)
  })

  it('tags thinking-only assistant history', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.stepStarted(),
          {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: 'reasoning-1',
            delta: 'Thought',
          },
          ev.runFinished(),
        ],
      ],
    })
    const { saved, ui } = await capture({
      ...adapter,
      ...source,
      name: source.provider,
    })
    expect(saved[0]).toMatchObject({
      thinking: [{ content: 'Thought' }],
      metadata: { tanstack: { source } },
    })
    expect(ui[0]?.metadata?.tanstack?.source).toEqual(source)
  })

  it.each([true, false])(
    'tags tool-only turns separately from the later answer with start: %s',
    async (started) => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ...(started ? [ev.runStarted()] : []),
            ev.toolStart('call-1', 'inspect'),
            ev.toolArgs('call-1', '{}'),
            ev.toolEnd('call-1'),
            { ...ev.runFinished('tool_calls'), responseId: 'response-tools' },
          ],
          [
            ...(started ? [ev.runStarted()] : []),
            ev.textContent('Done', 'answer'),
            { ...ev.runFinished(), responseId: 'response-answer' },
          ],
        ],
      })
      const { saved, ui } = await capture(
        { ...adapter, ...source, name: source.provider },
        [serverTool('inspect', () => 'ok')],
      )
      const assistants = saved.filter((message) => message.role === 'assistant')
      expect(
        assistants.map((message) => message.metadata?.tanstack?.source),
      ).toEqual([source, source])
      expect(
        assistants.map((message) => message.metadata?.tanstack?.responseId),
      ).toEqual(['response-tools', 'response-answer'])
      expect(
        ui.map((message) => message.metadata?.tanstack?.responseId),
      ).toEqual(['response-tools', 'response-answer'])
    },
  )

  it('tags each ordered segment from one provider-executed tool call', async () => {
    const chunks: Array<AdapterYieldChunk> = [
      ev.runStarted(),
      ev.textContent('before'),
      {
        ...ev.toolStart('provider-call', 'search'),
        metadata: { providerExecuted: true },
      },
      ev.toolArgs('provider-call', '{}'),
      ev.toolEnd('provider-call'),
      ev.stepStarted('after'),
      {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'reasoning',
        delta: 'Thought',
      },
      ev.textContent('after'),
      { ...ev.runFinished(), responseId: 'response-segments' },
    ]
    const { adapter } = createMockAdapter({ iterations: [chunks] })
    const { saved } = await capture({
      ...adapter,
      ...source,
      name: source.provider,
    })
    const assistants = saved.filter((message) => message.role === 'assistant')
    expect(assistants.length).toBeGreaterThan(1)
    expect(assistants.map((message) => message.metadata?.tanstack)).toEqual([
      { source, runId: 'run-1', responseId: 'response-segments' },
      { source, runId: 'run-1', responseId: 'response-segments' },
    ])
  })

  it('preserves native non-stream structured response identity', async () => {
    const { adapter } = createMockAdapter({
      structuredOutput: async () => ({
        data: { answer: 'yes' },
        rawText: '{"answer":"yes"}',
        responseId: 'response-json',
        model: 'resolved-json',
      }),
    })
    let saved: ReadonlyArray<ModelMessage> = []
    const chunks = await collectChunks(
      chat({
        adapter: { ...adapter, ...source, name: source.provider },
        messages: [],
        stream: true,
        outputSchema: z.object({ answer: z.string() }),
        middleware: [
          defineChatMiddleware({
            name: 'save',
            onFinish(ctx) {
              saved = ctx.messages
            },
          }),
        ],
      }),
    )
    const finish = chunks.find((chunk) => chunk.type === 'RUN_FINISHED')
    expect(finish?.metadata?.tanstack).toMatchObject({
      responseId: 'response-json',
      model: 'resolved-json',
      source,
    })
    expect(saved.at(-1)?.metadata?.tanstack).toMatchObject({
      responseId: 'response-json',
      model: 'resolved-json',
      source,
    })
  })
})
