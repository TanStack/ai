import { describe, expect, it } from 'vitest'
import {
  SESSION_ID_EVENT,
  toolNameForItem,
  translateThreadEvents,
} from '../src/stream/translate'
import type { TranslateContext } from '../src/stream/translate'
import type { CodexThreadEvent } from '../src/stream/sdk-types'
import type { StreamChunk } from '@tanstack/ai'

function makeCtx(overrides: Partial<TranslateContext> = {}): TranslateContext {
  let id = 0
  return {
    model: 'gpt-5.1-codex',
    runId: 'run-1',
    threadId: 'thread-1',
    genId: () => `gen-${++id}`,
    ...overrides,
  }
}

async function* fromArray(
  events: Array<CodexThreadEvent>,
): AsyncIterable<CodexThreadEvent> {
  for (const event of events) yield event
}

async function collect(
  events: Array<CodexThreadEvent>,
  ctx: TranslateContext = makeCtx(),
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of translateThreadEvents(fromArray(events), ctx)) {
    chunks.push(chunk)
  }
  return chunks
}

const started: CodexThreadEvent = {
  type: 'thread.started',
  thread_id: 'sess-1',
}

const completedTurn: CodexThreadEvent = {
  type: 'turn.completed',
  usage: {
    input_tokens: 100,
    cached_input_tokens: 40,
    output_tokens: 20,
    reasoning_output_tokens: 5,
  },
}

describe('translateThreadEvents', () => {
  it('translates a simple text turn', async () => {
    const chunks = await collect([
      started,
      { type: 'turn.started' },
      {
        type: 'item.completed',
        item: { id: 'item-1', type: 'agent_message', text: 'hi there' },
      },
      completedTurn,
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

  it('reports usage with cache and reasoning details', async () => {
    const chunks = await collect([started, completedTurn])
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

  it('notifies onSessionId and forwards raw events to onThreadEvent', async () => {
    const sessionIds: Array<string> = []
    const raw: Array<string> = []
    await collect(
      [started, completedTurn],
      makeCtx({
        onSessionId: (id) => sessionIds.push(id),
        onThreadEvent: (event) => raw.push(event.type),
      }),
    )
    expect(sessionIds).toEqual(['sess-1'])
    expect(raw).toEqual(['thread.started', 'turn.completed'])
  })

  it('starts the run without a session event on resumed threads', async () => {
    const chunks = await collect([
      { type: 'turn.started' },
      {
        type: 'item.completed',
        item: { id: 'item-1', type: 'agent_message', text: 'resumed' },
      },
      completedTurn,
    ])
    expect(chunks[0]).toMatchObject({ type: 'RUN_STARTED' })
    expect(chunks.some((c) => c.type === 'CUSTOM')).toBe(false)
  })

  it('translates reasoning items into a reasoning burst', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.completed',
        item: { id: 'item-r', type: 'reasoning', text: 'thinking...' },
      },
      completedTurn,
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

  it('pairs command executions across item.started and item.completed', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.started',
        item: {
          id: 'cmd-1',
          type: 'command_execution',
          command: 'ls -la',
          status: 'in_progress',
        },
      },
      {
        type: 'item.completed',
        item: {
          id: 'cmd-1',
          type: 'command_execution',
          command: 'ls -la',
          aggregated_output: 'file.txt',
          exit_code: 0,
          status: 'completed',
        },
      },
      completedTurn,
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
      toolCallId: 'cmd-1',
      toolCallName: 'command_execution',
    })
    expect(chunks[3]).toMatchObject({
      args: JSON.stringify({ command: 'ls -la' }),
    })
    const result = chunks[5] as { content: string; state?: string }
    expect(JSON.parse(result.content)).toMatchObject({
      aggregated_output: 'file.txt',
      exit_code: 0,
      status: 'completed',
    })
    expect(result.state).toBeUndefined()
  })

  it('marks failed command executions as output-error', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.completed',
        item: {
          id: 'cmd-2',
          type: 'command_execution',
          command: 'false',
          aggregated_output: '',
          exit_code: 1,
          status: 'failed',
        },
      },
      completedTurn,
    ])
    const result = chunks.find((c) => c.type === 'TOOL_CALL_RESULT')
    expect(result).toMatchObject({ state: 'output-error' })
  })

  it('emits a full tool pair when item.completed arrives without item.started', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.completed',
        item: {
          id: 'fc-1',
          type: 'file_change',
          changes: [{ path: 'a.ts', kind: 'update' }],
          status: 'completed',
        },
      },
      completedTurn,
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
    expect(chunks[2]).toMatchObject({ toolCallName: 'file_change' })
  })

  it('does not duplicate START events when both started and completed fire', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.started',
        item: {
          id: 'ws-1',
          type: 'web_search',
          query: 'tanstack ai',
        },
      },
      {
        type: 'item.completed',
        item: { id: 'ws-1', type: 'web_search', query: 'tanstack ai' },
      },
      completedTurn,
    ])
    const startEvents = chunks.filter((c) => c.type === 'TOOL_CALL_START')
    expect(startEvents).toHaveLength(1)
  })

  it('strips the tanstack server prefix from bridged MCP tool calls', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.completed',
        item: {
          id: 'mcp-1',
          type: 'mcp_tool_call',
          server: 'tanstack',
          tool: 'lookup_user',
          arguments: { userId: '7' },
          result: { content: [{ type: 'text', text: '{"name":"Ada"}' }] },
          status: 'completed',
        },
      },
      completedTurn,
    ])
    expect(chunks.find((c) => c.type === 'TOOL_CALL_START')).toMatchObject({
      toolCallName: 'lookup_user',
    })
    expect(chunks.find((c) => c.type === 'TOOL_CALL_RESULT')).toMatchObject({
      content: '{"name":"Ada"}',
    })
  })

  it('namespaces foreign MCP tool calls as mcp__server__tool', async () => {
    expect(
      toolNameForItem({
        id: 'x',
        type: 'mcp_tool_call',
        server: 'github',
        tool: 'create_issue',
        status: 'completed',
      }),
    ).toBe('mcp__github__create_issue')
  })

  it('surfaces MCP tool errors as output-error results', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.completed',
        item: {
          id: 'mcp-2',
          type: 'mcp_tool_call',
          server: 'tanstack',
          tool: 'boom',
          error: { message: 'kaboom' },
          status: 'failed',
        },
      },
      completedTurn,
    ])
    expect(chunks.find((c) => c.type === 'TOOL_CALL_RESULT')).toMatchObject({
      content: 'kaboom',
      state: 'output-error',
    })
  })

  it('ignores item.updated events', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.started',
        item: {
          id: 'todo-1',
          type: 'todo_list',
          items: [{ text: 'step 1', completed: false }],
        },
      },
      {
        type: 'item.updated',
        item: {
          id: 'todo-1',
          type: 'todo_list',
          items: [{ text: 'step 1', completed: true }],
        },
      },
      {
        type: 'item.completed',
        item: {
          id: 'todo-1',
          type: 'todo_list',
          items: [{ text: 'step 1', completed: true }],
        },
      },
      completedTurn,
    ])
    expect(chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')).toHaveLength(1)
    expect(chunks.filter((c) => c.type === 'TOOL_CALL_RESULT')).toHaveLength(1)
  })

  it('synthesizes interrupted results for unresolved tool calls on turn.completed', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.started',
        item: {
          id: 'cmd-9',
          type: 'command_execution',
          command: 'sleep 100',
          status: 'in_progress',
        },
      },
      completedTurn,
    ])
    const result = chunks.find((c) => c.type === 'TOOL_CALL_RESULT')
    expect(result).toMatchObject({
      toolCallId: 'cmd-9',
      content: JSON.stringify({ status: 'interrupted' }),
    })
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_FINISHED' })
  })

  it('maps turn.failed to RUN_ERROR after synthesizing results', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.started',
        item: {
          id: 'cmd-8',
          type: 'command_execution',
          command: 'x',
          status: 'in_progress',
        },
      },
      { type: 'turn.failed', error: { message: 'model exploded' } },
    ])
    const types: Array<string> = chunks.map((c) => c.type)
    expect(types.indexOf('TOOL_CALL_RESULT')).toBeLessThan(
      types.indexOf('RUN_ERROR'),
    )
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'model exploded',
    })
  })

  it('maps stream error events to RUN_ERROR', async () => {
    const chunks = await collect([
      started,
      { type: 'error', message: 'stream broke' },
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'stream broke',
    })
  })

  it('synthesizes results then rethrows when the source stream throws', async () => {
    async function* failing(): AsyncIterable<CodexThreadEvent> {
      yield started
      yield {
        type: 'item.started',
        item: {
          id: 'cmd-7',
          type: 'command_execution',
          command: 'x',
          status: 'in_progress',
        },
      }
      throw new Error('aborted')
    }

    const chunks: Array<StreamChunk> = []
    await expect(async () => {
      for await (const chunk of translateThreadEvents(failing(), makeCtx())) {
        chunks.push(chunk)
      }
    }).rejects.toThrow('aborted')
    expect(chunks.at(-1)).toMatchObject({
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'cmd-7',
      content: JSON.stringify({ status: 'interrupted' }),
    })
  })

  it('ignores non-fatal error items', async () => {
    const chunks = await collect([
      started,
      {
        type: 'item.completed',
        item: { id: 'err-1', type: 'error', message: 'transient hiccup' },
      },
      completedTurn,
    ])
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'RUN_FINISHED',
    ])
  })
})
