import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { runLines } from '../src/lines'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

// `~types` holds types only. Its values are never read, so they are casts.
const TYPES = {
  providerOptions: {} as Record<string, unknown>,
  inputModalities: ['text'] as readonly ['text'],
  messageMetadataByModality: {
    text: undefined as unknown,
    image: undefined as unknown,
    audio: undefined as unknown,
    video: undefined as unknown,
    document: undefined as unknown,
  },
  toolCapabilities: [] as ReadonlyArray<string>,
  toolCallMetadata: undefined as unknown,
  systemPromptMetadata: undefined as never,
}

function model(turns: Array<Array<StreamChunk>>): AnyTextAdapter {
  let call = 0
  return {
    kind: 'text',
    name: 'mock',
    model: 'mock',
    '~types': TYPES,
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: () => {
      const chunks = turns[call] ?? []
      call += 1
      return (async function* () {
        yield* chunks
      })()
    },
  }
}

const say = (text: string, id: string): Array<StreamChunk> => [
  { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: 1 },
  {
    type: EventType.TEXT_MESSAGE_START,
    messageId: id,
    role: 'assistant',
    timestamp: 1,
  },
  {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: id,
    delta: text,
    timestamp: 1,
  },
  { type: EventType.TEXT_MESSAGE_END, messageId: id, timestamp: 1 },
  {
    type: EventType.RUN_FINISHED,
    runId: 'r',
    threadId: 't',
    timestamp: 1,
    metadata: { tanstack: { finishReason: 'stop' } },
  },
]

describe('line mode with a child agent', () => {
  it('prints the child once, in its finish line, and the lead answer after it', async () => {
    const helper = defineAgent({
      name: 'helper',
      description: 'Helps',
      inputSchema: z.object({ task: z.string() }),
      run: (ctx) =>
        ctx.chat({
          adapter: model([say('child says hi', 'c1')]),
          messages: [{ role: 'user', content: ctx.input.task }],
        }),
    })
    const lead = model([
      [
        {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_START,
          toolCallId: 'call-1',
          toolCallName: 'helper',
          timestamp: 1,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId: 'call-1',
          delta: '{"task":"say hi"}',
          timestamp: 1,
        },
        { type: EventType.TOOL_CALL_END, toolCallId: 'call-1', timestamp: 1 },
        {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: 1,
          metadata: { tanstack: { finishReason: 'tool_calls' } },
        },
      ],
      say('lead done', 'l1'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/child-lines',
        adapter: lead,
        subagents: { agents: [helper] },
      }),
      { threadId: 't' },
    )
    const input = new PassThrough()
    let out = ''
    const running = runLines(session, input, {
      write: (text: string) => (out += text),
    })
    input.end('go\n')
    await running
    await host.close()

    expect(out).toContain('[agent helper started]')
    expect(out).toContain('[agent helper finished: child says hi]')
    expect(out.split('child says hi')).toHaveLength(2)
    expect(out.indexOf('lead done')).toBeGreaterThan(out.indexOf('finished'))
  })
})
