import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { runLines } from '../src/lines'
import { applyEvent } from '../src/session-view'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { SessionEvent } from '@tanstack/ai-harness'
import type { ViewEntry } from '../src/session-view'

const at = (event: StreamChunk): SessionEvent => ({
  cursor: '1',
  operationId: 'op',
  event,
})
const child = (event: Record<string, unknown>): StreamChunk =>
  ({ subagentRunId: 'child-1', timestamp: 1, ...event }) as StreamChunk

function fold(events: Array<StreamChunk>): Array<ViewEntry> {
  return events.reduce(
    (entries, event) => applyEvent(entries, at(event)),
    [] as Array<ViewEntry>,
  )
}

describe('child agent entries', () => {
  it('shows the start, tool calls, and a finish line with the answer', () => {
    const entries = fold([
      child({ type: EventType.SUBAGENT_STARTED, name: 'claude_code' }),
      child({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: 'Added a\n',
      }),
      child({
        type: EventType.TOOL_CALL_START,
        toolCallId: 't',
        toolCallName: 'Edit',
      }),
      child({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: '  test.',
      }),
      child({ type: EventType.SUBAGENT_FINISHED }),
    ])
    expect(entries.map((entry) => entry.text)).toEqual([
      'agent claude_code started',
      'claude_code: tool Edit',
      'agent claude_code finished: Added a test.',
    ])
    expect(entries[0]).toMatchObject({
      kind: 'agent',
      answer: 'Added a\n  test.',
    })
  })

  it('shortens long answers, reports errors, and names unknown children "agent"', () => {
    const long = 'word '.repeat(60)
    const finished = fold([
      child({ type: EventType.SUBAGENT_STARTED, name: 'codex' }),
      child({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: long,
      }),
      child({ type: EventType.SUBAGENT_FINISHED }),
    ])
    const last = finished.at(-1)?.text ?? ''
    expect(last.startsWith('agent codex finished: word word')).toBe(true)
    expect(last.endsWith('...')).toBe(true)

    expect(
      fold([
        child({ type: EventType.SUBAGENT_STARTED }),
        child({ type: EventType.SUBAGENT_FINISHED }),
      ]).map((entry) => entry.text),
    ).toEqual(['agent agent started', 'agent agent finished'])

    const orphan = fold([
      child({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: 'lost',
      }),
      child({
        type: EventType.TOOL_CALL_START,
        toolCallId: 't',
        toolCallName: 'Read',
      }),
      child({ type: EventType.SUBAGENT_ERROR, message: 'crashed' }),
      child({ type: EventType.STEP_STARTED, stepName: 's' }),
    ])
    expect(orphan.map((entry) => entry.text)).toEqual([
      'agent: tool Read',
      'agent agent failed: crashed',
    ])
  })
})

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
