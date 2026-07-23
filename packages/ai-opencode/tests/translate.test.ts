import { describe, expect, it } from 'vitest'
import {
  SESSION_ID_EVENT,
  TODO_EVENT,
  resolveToolName,
  translateOpencodeStream,
} from '../src/stream/translate'
import type { TranslateContext } from '../src/stream/translate'
import type {
  OpencodeAssistantMessage,
  OpencodeStreamEvent,
} from '../src/stream/sdk-types'
import type { StreamChunk } from '@tanstack/ai'

function makeCtx(overrides: Partial<TranslateContext> = {}): TranslateContext {
  let id = 0
  return {
    model: 'anthropic/claude-sonnet-4-5',
    runId: 'run-1',
    threadId: 'thread-1',
    genId: () => `gen-${++id}`,
    ...overrides,
  }
}

async function* fromArray(
  events: Array<OpencodeStreamEvent>,
): AsyncIterable<OpencodeStreamEvent> {
  for (const event of events) yield event
}

async function collect(
  events: Array<OpencodeStreamEvent>,
  ctx: TranslateContext = makeCtx(),
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of translateOpencodeStream(fromArray(events), ctx)) {
    chunks.push(chunk)
  }
  return chunks
}

const session: OpencodeStreamEvent = { kind: 'session', sessionId: 'sess-1' }

function done(
  overrides: Partial<OpencodeAssistantMessage> = {},
): OpencodeStreamEvent {
  return {
    kind: 'done',
    message: { id: 'msg-1', role: 'assistant', finish: 'stop', ...overrides },
  }
}

function textPart(
  id: string,
  text: string,
  delta?: string,
): OpencodeStreamEvent {
  return {
    kind: 'event',
    event: {
      type: 'message.part.updated',
      properties: {
        part: { id, sessionID: 'sess-1', type: 'text', text },
        ...(delta !== undefined && { delta }),
      },
    },
  }
}

describe('translateOpencodeStream', () => {
  it('structured mode suppresses prose and emits message.structured as terminal text', async () => {
    const chunks = await collect(
      [
        session,
        // Prose streamed during the turn — must be dropped.
        textPart('part-1', 'Let me work on that...', 'Let me work on that...'),
        done({ structured: { answer: 'pong' } }),
      ],
      makeCtx({ structuredOutput: true }),
    )

    const textContents = chunks.filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
    expect(textContents).toHaveLength(1)
    expect(textContents[0]).toMatchObject({ content: '{"answer":"pong"}' })
    expect(
      JSON.parse((textContents[0] as { content: string }).content),
    ).toEqual({ answer: 'pong' })
    const endIdx = chunks.findIndex((c) => c.type === 'TEXT_MESSAGE_END')
    const finishedIdx = chunks.findIndex((c) => c.type === 'RUN_FINISHED')
    expect(endIdx).toBeGreaterThanOrEqual(0)
    expect(endIdx).toBeLessThan(finishedIdx)
  })

  it('translates a simple text turn', async () => {
    const chunks = await collect([
      session,
      textPart('part-1', 'hi there', 'hi there'),
      done(),
    ])

    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
    expect(chunks[1]).toMatchObject({
      name: SESSION_ID_EVENT,
      value: { sessionId: 'sess-1' },
    })
    expect(chunks[3]).toMatchObject({ delta: 'hi there', content: 'hi there' })
    expect(chunks.at(-1)).toMatchObject({ finishReason: 'stop' })
  })

  it('accumulates incremental text deltas', async () => {
    const chunks = await collect([
      session,
      textPart('part-1', 'Hel', 'Hel'),
      textPart('part-1', 'Hello', 'lo'),
      done(),
    ])
    const contents = chunks.filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
    expect(contents).toHaveLength(2)
    expect(contents[0]).toMatchObject({ delta: 'Hel', content: 'Hel' })
    expect(contents[1]).toMatchObject({ delta: 'lo', content: 'Hello' })
    // A single START/END pair for the one part id.
    expect(chunks.filter((c) => c.type === 'TEXT_MESSAGE_START')).toHaveLength(
      1,
    )
    expect(chunks.filter((c) => c.type === 'TEXT_MESSAGE_END')).toHaveLength(1)
  })

  it('derives the delta from full-text snapshots when no delta is given', async () => {
    const chunks = await collect([
      session,
      textPart('part-1', 'Hel'),
      textPart('part-1', 'Hello'),
      done(),
    ])
    const contents = chunks.filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
    expect(contents[0]).toMatchObject({ delta: 'Hel' })
    expect(contents[1]).toMatchObject({ delta: 'lo', content: 'Hello' })
  })

  it('reports usage with cache and reasoning details', async () => {
    const chunks = await collect([
      session,
      done({
        tokens: {
          input: 100,
          output: 20,
          reasoning: 5,
          cache: { read: 40, write: 0 },
        },
      }),
    ])
    const finished = chunks.at(-1) as unknown as {
      usage: Record<string, unknown>
    }
    expect(finished.usage).toMatchObject({
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      promptTokensDetails: { cachedTokens: 40 },
      completionTokensDetails: { reasoningTokens: 5 },
    })
  })

  it('maps a length finish to finishReason length', async () => {
    const chunks = await collect([session, done({ finish: 'length' })])
    expect(chunks.at(-1)).toMatchObject({ finishReason: 'length' })
  })

  it('translates a reasoning part into a reasoning sequence', async () => {
    const chunks = await collect([
      session,
      {
        kind: 'event',
        event: {
          type: 'message.part.updated',
          properties: {
            part: {
              id: 'r-1',
              sessionID: 'sess-1',
              type: 'reasoning',
              text: 'thinking',
            },
            delta: 'thinking',
          },
        },
      },
      done(),
    ])
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'REASONING_START',
      'REASONING_MESSAGE_START',
      'REASONING_MESSAGE_CONTENT',
      'REASONING_MESSAGE_END',
      'REASONING_END',
      'RUN_FINISHED',
    ])
  })

  function toolEvent(
    callID: string,
    tool: string,
    state: Record<string, unknown>,
  ): OpencodeStreamEvent {
    return {
      kind: 'event',
      event: {
        type: 'message.part.updated',
        properties: {
          part: {
            id: `part-${callID}`,
            sessionID: 'sess-1',
            type: 'tool',
            callID,
            tool,
            state: state as never,
          },
        },
      },
    }
  }

  it('pairs a tool call across running and completed states', async () => {
    const chunks = await collect([
      session,
      toolEvent('call-1', 'bash', {
        status: 'running',
        input: { command: 'ls' },
      }),
      toolEvent('call-1', 'bash', {
        status: 'completed',
        input: { command: 'ls' },
        output: 'file.txt',
        title: 'ls',
      }),
      done(),
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
    expect(chunks[2]).toMatchObject({
      toolCallId: 'call-1',
      toolCallName: 'bash',
    })
    expect(chunks[3]).toMatchObject({ args: JSON.stringify({ command: 'ls' }) })
    expect(chunks[5]).toMatchObject({ content: 'file.txt' })
    expect((chunks[5] as { state?: string }).state).toBeUndefined()
  })

  it('marks tool errors as output-error', async () => {
    const chunks = await collect([
      session,
      toolEvent('call-2', 'bash', {
        status: 'error',
        input: { command: 'false' },
        error: 'exit 1',
      }),
      done(),
    ])
    expect(chunks.find((c) => c.type === 'TOOL_CALL_RESULT')).toMatchObject({
      content: 'exit 1',
      state: 'output-error',
    })
  })

  it('does not duplicate START events across repeated tool updates', async () => {
    const chunks = await collect([
      session,
      toolEvent('call-3', 'read', { status: 'pending', input: {} }),
      toolEvent('call-3', 'read', { status: 'running', input: { path: 'a' } }),
      toolEvent('call-3', 'read', {
        status: 'completed',
        input: { path: 'a' },
        output: 'data',
        title: 'read a',
      }),
      done(),
    ])
    expect(chunks.filter((c) => c.type === 'TOOL_CALL_START')).toHaveLength(1)
    expect(chunks.filter((c) => c.type === 'TOOL_CALL_RESULT')).toHaveLength(1)
  })

  it('surfaces bridged MCP tool calls under the registered name', async () => {
    const chunks = await collect(
      [
        session,
        toolEvent('call-4', 'tanstack_lookup_user', {
          status: 'completed',
          input: { userId: '7' },
          output: '{"name":"Ada"}',
          title: 'lookup_user',
        }),
        done(),
      ],
      makeCtx({ bridgedToolNames: new Set(['lookup_user']) }),
    )
    expect(chunks.find((c) => c.type === 'TOOL_CALL_START')).toMatchObject({
      toolCallName: 'lookup_user',
    })
    expect(chunks.find((c) => c.type === 'TOOL_CALL_RESULT')).toMatchObject({
      content: '{"name":"Ada"}',
    })
  })

  it('synthesizes interrupted results for unresolved tool calls on done', async () => {
    const chunks = await collect([
      session,
      toolEvent('call-9', 'bash', {
        status: 'running',
        input: { command: 'sleep 100' },
      }),
      done(),
    ])
    const result = chunks.find((c) => c.type === 'TOOL_CALL_RESULT')
    expect(result).toMatchObject({
      toolCallId: 'call-9',
      content: JSON.stringify({ status: 'interrupted' }),
    })
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_FINISHED' })
  })

  it('maps a message error to RUN_ERROR', async () => {
    const chunks = await collect([
      session,
      done({
        finish: undefined,
        error: { name: 'ProviderAuthError', data: { message: 'no key' } },
      }),
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'no key',
    })
  })

  it('emits a todo CUSTOM event', async () => {
    const chunks = await collect([
      session,
      {
        kind: 'event',
        event: {
          type: 'todo.updated',
          properties: {
            sessionID: 'sess-1',
            todos: [{ content: 'step 1', status: 'pending' }],
          },
        },
      },
      done(),
    ])
    expect(
      chunks.find((c) => c.type === 'CUSTOM' && c.name === TODO_EVENT),
    ).toBeDefined()
  })

  it('forwards raw stream events to onStreamEvent', async () => {
    const kinds: Array<string> = []
    await collect(
      [session, textPart('p', 'hi', 'hi'), done()],
      makeCtx({ onStreamEvent: (event) => kinds.push(event.kind) }),
    )
    expect(kinds).toEqual(['session', 'event', 'done'])
  })

  it('synthesizes results then rethrows when the source stream throws', async () => {
    async function* failing(): AsyncIterable<OpencodeStreamEvent> {
      yield session
      yield {
        kind: 'event',
        event: {
          type: 'message.part.updated',
          properties: {
            part: {
              id: 'p-c',
              sessionID: 'sess-1',
              type: 'tool',
              callID: 'call-7',
              tool: 'bash',
              state: { status: 'running', input: {} } as never,
            },
          },
        },
      }
      throw new Error('aborted')
    }

    const chunks: Array<StreamChunk> = []
    await expect(async () => {
      for await (const chunk of translateOpencodeStream(failing(), makeCtx())) {
        chunks.push(chunk)
      }
    }).rejects.toThrow('aborted')
    expect(chunks.at(-1)).toMatchObject({
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'call-7',
      content: JSON.stringify({ status: 'interrupted' }),
    })
  })
})

describe('resolveToolName', () => {
  it('returns the tool name verbatim without bridged names', () => {
    expect(resolveToolName('bash', undefined)).toBe('bash')
    expect(resolveToolName('edit', new Set())).toBe('edit')
  })

  it('strips the tanstack_ prefix for bridged tools', () => {
    const bridged = new Set(['lookup_user'])
    expect(resolveToolName('tanstack_lookup_user', bridged)).toBe('lookup_user')
    expect(resolveToolName('lookup_user', bridged)).toBe('lookup_user')
  })

  it('leaves foreign tool names untouched', () => {
    expect(
      resolveToolName('github_create_issue', new Set(['lookup_user'])),
    ).toBe('github_create_issue')
  })
})
