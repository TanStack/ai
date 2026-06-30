import { describe, expect, it } from 'vitest'
import {
  matchBridgedToolName,
  translateAcpStream,
} from '../src/stream/translate'
import type { AcpStreamEvent, TranslateContext } from '../src/stream/translate'
import type { StreamChunk } from '@tanstack/ai'

const SESSION_ID_EVENT = 'test.session-id'
const PLAN_EVENT = 'test.plan'

function makeCtx(overrides: Partial<TranslateContext> = {}): TranslateContext {
  let id = 0
  return {
    model: 'gemini-3-pro-preview',
    runId: 'run-1',
    threadId: 'thread-1',
    genId: () => `gen-${++id}`,
    labels: {
      sessionIdEvent: SESSION_ID_EVENT,
      planEvent: PLAN_EVENT,
      refusalMessage: 'Harness refused the request.',
    },
    ...overrides,
  }
}

async function* fromArray(
  events: Array<AcpStreamEvent>,
): AsyncIterable<AcpStreamEvent> {
  for (const event of events) yield event
}

async function collect(
  events: Array<AcpStreamEvent>,
  ctx: TranslateContext = makeCtx(),
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of translateAcpStream(fromArray(events), ctx)) {
    chunks.push(chunk)
  }
  return chunks
}

const session: AcpStreamEvent = { kind: 'session', sessionId: 'sess-1' }
const done: AcpStreamEvent = { kind: 'done', stopReason: 'end_turn' }

function text(value: string): AcpStreamEvent {
  return {
    kind: 'update',
    update: {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: value },
    },
  }
}

function thought(value: string): AcpStreamEvent {
  return {
    kind: 'update',
    update: {
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: value },
    },
  }
}

describe('translateAcpStream', () => {
  it('translates streamed text deltas into one accumulated message', async () => {
    const chunks = await collect([session, text('Hel'), text('lo'), done])
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
    expect(chunks[1]).toMatchObject({
      name: SESSION_ID_EVENT,
      value: { sessionId: 'sess-1' },
    })
    expect(chunks[3]).toMatchObject({ delta: 'Hel', content: 'Hel' })
    expect(chunks[4]).toMatchObject({ delta: 'lo', content: 'Hello' })
    expect(chunks.at(-1)).toMatchObject({ finishReason: 'stop' })
  })

  it('translates thought chunks into reasoning events', async () => {
    const chunks = await collect([
      session,
      thought('hmm '),
      thought('ok'),
      text('answer'),
      done,
    ])
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'REASONING_START',
      'REASONING_MESSAGE_START',
      'REASONING_MESSAGE_CONTENT',
      'REASONING_MESSAGE_CONTENT',
      'REASONING_MESSAGE_END',
      'REASONING_END',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
  })

  it('closes an open text message when a tool call interleaves, then reopens', async () => {
    const chunks = await collect([
      session,
      text('Let me check. '),
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-1',
          title: 'Reading file',
          kind: 'read',
          status: 'in_progress',
          rawInput: { path: 'a.ts' },
        },
      },
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tc-1',
          status: 'completed',
          rawOutput: 'contents',
        },
      },
      text('Done.'),
      done,
    ])
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
    expect(chunks[5]).toMatchObject({
      toolCallId: 'tc-1',
      toolCallName: 'read',
    })
    expect(chunks[6]).toMatchObject({
      args: JSON.stringify({ title: 'Reading file', path: 'a.ts' }),
    })
    expect(chunks[8]).toMatchObject({ content: 'contents' })
  })

  it('marks failed tool calls as output-error', async () => {
    const chunks = await collect([
      session,
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-2',
          kind: 'execute',
          status: 'in_progress',
        },
      },
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tc-2',
          status: 'failed',
          rawOutput: { error: 'denied' },
        },
      },
      done,
    ])
    expect(chunks.find((c) => c.type === 'TOOL_CALL_RESULT')).toMatchObject({
      state: 'output-error',
      content: JSON.stringify({ error: 'denied' }),
    })
  })

  it('resolves a tool_call that arrives already completed', async () => {
    const chunks = await collect([
      session,
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-3',
          kind: 'search',
          status: 'completed',
          content: [
            { type: 'content', content: { type: 'text', text: 'found it' } },
          ],
        },
      },
      done,
    ])
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
      'RUN_FINISHED',
    ])
    expect(chunks[5]).toMatchObject({ content: 'found it' })
  })

  it('streams in_progress tool_call_update args after the tool is opened', async () => {
    const chunks = await collect([
      session,
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-stream',
          title: 'list_dir',
          kind: 'list_dir',
          status: 'in_progress',
        },
      },
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tc-stream',
          title: 'list_dir',
          kind: 'list_dir',
          status: 'in_progress',
          rawInput: { target_directory: '.' },
        },
      },
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tc-stream',
          status: 'completed',
          rawOutput: 'ok',
        },
      },
      done,
    ])
    const argChunks = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')
    expect(argChunks).toHaveLength(2)
    expect(argChunks[1]).toMatchObject({
      toolCallId: 'tc-stream',
      args: JSON.stringify({ title: 'list_dir', target_directory: '.' }),
    })
  })

  it('opens a synthetic pair for a tool_call_update with an unknown id', async () => {
    const chunks = await collect([
      session,
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: 'tc-mystery',
          status: 'completed',
          rawOutput: 'late result',
        },
      },
      done,
    ])
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
      'RUN_FINISHED',
    ])
  })

  it('surfaces bridged TanStack tool calls under their registered names', async () => {
    const chunks = await collect(
      [
        session,
        {
          kind: 'update',
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 'tc-4',
            title: 'lookup_user (tanstack MCP Server)',
            kind: 'other',
            status: 'completed',
            rawOutput: '{"name":"Ada"}',
          },
        },
        done,
      ],
      makeCtx({ bridgedToolNames: new Set(['lookup_user']) }),
    )
    expect(chunks.find((c) => c.type === 'TOOL_CALL_START')).toMatchObject({
      toolCallName: 'lookup_user',
    })
  })

  it('emits plan updates as CUSTOM events', async () => {
    const chunks = await collect([
      session,
      {
        kind: 'update',
        update: {
          sessionUpdate: 'plan',
          entries: [{ content: 'step 1', status: 'pending' }],
        },
      },
      done,
    ])
    expect(chunks[2]).toMatchObject({
      type: 'CUSTOM',
      name: PLAN_EVENT,
      value: { entries: [{ content: 'step 1', status: 'pending' }] },
    })
  })

  it('maps max_tokens and max_turn_requests to finishReason length', async () => {
    for (const stopReason of ['max_tokens', 'max_turn_requests'] as const) {
      const chunks = await collect([session, { kind: 'done', stopReason }])
      expect(chunks.at(-1)).toMatchObject({
        type: 'RUN_FINISHED',
        finishReason: 'length',
      })
    }
  })

  it('maps cancelled to a normal stop', async () => {
    const chunks = await collect([
      session,
      { kind: 'done', stopReason: 'cancelled' },
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_FINISHED',
      finishReason: 'stop',
    })
  })

  it('maps refusal to RUN_ERROR', async () => {
    const chunks = await collect([
      session,
      { kind: 'done', stopReason: 'refusal' },
    ])
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_ERROR', code: 'refusal' })
  })

  it('reports usage from the prompt response when present', async () => {
    const chunks = await collect([
      session,
      {
        kind: 'done',
        stopReason: 'end_turn',
        usage: {
          inputTokens: 50,
          outputTokens: 10,
          totalTokens: 60,
          cachedReadTokens: 20,
          thoughtTokens: 4,
        },
      },
    ])
    const finished = chunks.at(-1) as unknown as {
      usage: Record<string, unknown>
    }
    expect(finished.usage).toMatchObject({
      promptTokens: 50,
      completionTokens: 10,
      totalTokens: 60,
      promptTokensDetails: { cachedTokens: 20 },
      completionTokensDetails: { reasoningTokens: 4 },
    })
  })

  it('omits usage when the harness reports none', async () => {
    const chunks = await collect([session, done])
    expect(
      (chunks.at(-1) as unknown as { usage?: unknown }).usage,
    ).toBeUndefined()
  })

  it('closes open messages and synthesizes results before finishing', async () => {
    const chunks = await collect([
      session,
      text('working...'),
      {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-5',
          kind: 'execute',
          status: 'in_progress',
        },
      },
      done,
    ])
    const types: Array<string> = chunks.map((c) => c.type)
    expect(types.indexOf('TOOL_CALL_RESULT')).toBeGreaterThan(-1)
    expect(chunks.find((c) => c.type === 'TOOL_CALL_RESULT')).toMatchObject({
      content: JSON.stringify({ status: 'interrupted' }),
    })
    expect(types.at(-1)).toBe('RUN_FINISHED')
  })

  it('synthesizes results then rethrows when the source stream throws', async () => {
    async function* failing(): AsyncIterable<AcpStreamEvent> {
      yield session
      yield {
        kind: 'update',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tc-6',
          kind: 'execute',
          status: 'in_progress',
        },
      }
      throw new Error('process died')
    }

    const chunks: Array<StreamChunk> = []
    await expect(async () => {
      for await (const chunk of translateAcpStream(failing(), makeCtx())) {
        chunks.push(chunk)
      }
    }).rejects.toThrow('process died')
    expect(chunks.at(-1)).toMatchObject({
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'tc-6',
      content: JSON.stringify({ status: 'interrupted' }),
    })
  })

  it('ignores harness-internal update types', async () => {
    const chunks = await collect([
      session,
      {
        kind: 'update',
        update: { sessionUpdate: 'available_commands_update' },
      },
      { kind: 'update', update: { sessionUpdate: 'current_mode_update' } },
      done,
    ])
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'RUN_FINISHED',
    ])
  })
})

describe('matchBridgedToolName', () => {
  const names = new Set(['lookup_user', 'get_weather'])

  it('matches exact tool names', () => {
    expect(matchBridgedToolName('lookup_user', names)).toBe('lookup_user')
  })

  it('matches server-suffixed titles', () => {
    expect(
      matchBridgedToolName('get_weather (tanstack MCP Server)', names),
    ).toBe('get_weather')
  })

  it('returns undefined for unrelated titles', () => {
    expect(matchBridgedToolName('Run shell command', names)).toBeUndefined()
    expect(matchBridgedToolName(undefined, names)).toBeUndefined()
    expect(matchBridgedToolName('lookup_user', undefined)).toBeUndefined()
  })
})
