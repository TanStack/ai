import { describe, expect, it } from 'vitest'
import { translateSdkStream } from '../src/stream/translate'
import type { AgentSdkMessage } from '../src/stream/sdk-types'
import type { StreamChunk } from '@tanstack/ai'

function makeContext() {
  let id = 0
  return {
    model: 'claude-opus-4-6',
    runId: 'run-1',
    threadId: 'thread-1',
    genId: () => `gen-${++id}`,
  }
}

async function* fromArray(
  messages: Array<AgentSdkMessage>,
): AsyncIterable<AgentSdkMessage> {
  for (const message of messages) {
    yield message
  }
}

async function collect(
  messages: Array<AgentSdkMessage>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of translateSdkStream(
    fromArray(messages),
    makeContext(),
  )) {
    chunks.push(chunk)
  }
  return chunks
}

const init: AgentSdkMessage = {
  type: 'system',
  subtype: 'init',
  session_id: 'sess-abc',
  model: 'claude-opus-4-6',
  tools: ['Bash', 'Read'],
  cwd: '/tmp',
}

const usage = {
  input_tokens: 100,
  output_tokens: 50,
  cache_read_input_tokens: 10,
  cache_creation_input_tokens: 5,
}

function assistantText(text: string, messageId = 'msg-1'): AgentSdkMessage {
  return {
    type: 'assistant',
    message: { id: messageId, content: [{ type: 'text', text }] },
    parent_tool_use_id: null,
  }
}

const resultSuccess: AgentSdkMessage = {
  type: 'result',
  subtype: 'success',
  result: 'done',
  usage,
  total_cost_usd: 0.12,
}

async function collectStructured(
  messages: Array<AgentSdkMessage>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of translateSdkStream(fromArray(messages), {
    ...makeContext(),
    structuredOutput: true,
  })) {
    chunks.push(chunk)
  }
  return chunks
}

describe('translateSdkStream', () => {
  it('structured mode suppresses prose and emits structured_output as terminal text', async () => {
    const chunks = await collectStructured([
      init,
      // Natural-language prose the model emits during the run — must be dropped.
      assistantText('Let me work on that...'),
      {
        type: 'result',
        subtype: 'success',
        result: 'done',
        structured_output: { answer: 'pong' },
        usage,
        total_cost_usd: 0.01,
      },
    ])

    // Exactly one text burst, carrying the structured JSON (not the prose).
    const textContents = chunks.filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
    expect(textContents).toHaveLength(1)
    expect(textContents[0]).toMatchObject({ content: '{"answer":"pong"}' })
    expect(
      JSON.parse((textContents[0] as { content: string }).content),
    ).toEqual({ answer: 'pong' })
    // Emitted before the terminal RUN_FINISHED so it's harvestable.
    const endIdx = chunks.findIndex((c) => c.type === 'TEXT_MESSAGE_END')
    const finishedIdx = chunks.findIndex((c) => c.type === 'RUN_FINISHED')
    expect(endIdx).toBeGreaterThanOrEqual(0)
    expect(endIdx).toBeLessThan(finishedIdx)
  })

  it('translates a simple text turn into RUN_STARTED → CUSTOM → TEXT_* → RUN_FINISHED(stop)', async () => {
    const chunks = await collect([init, assistantText('Hello!'), resultSuccess])

    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])

    expect(chunks[0]).toMatchObject({
      type: 'RUN_STARTED',
      runId: 'run-1',
      threadId: 'thread-1',
      model: 'claude-opus-4-6',
    })
    expect(chunks[3]).toMatchObject({
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'Hello!',
      content: 'Hello!',
    })
    expect(chunks[5]).toMatchObject({
      type: 'RUN_FINISHED',
      finishReason: 'stop',
    })
  })

  it('surfaces the session id via a CUSTOM claude-code.session-id event', async () => {
    const chunks = await collect([init, assistantText('hi'), resultSuccess])
    const custom = chunks.find((c) => c.type === 'CUSTOM')
    expect(custom).toMatchObject({
      type: 'CUSTOM',
      name: 'claude-code.session-id',
      value: {
        sessionId: 'sess-abc',
        model: 'claude-opus-4-6',
        tools: ['Bash', 'Read'],
      },
    })
  })

  it('maps usage onto RUN_FINISHED including cache token details', async () => {
    const chunks = await collect([init, assistantText('hi'), resultSuccess])
    const finished = chunks.find((c) => c.type === 'RUN_FINISHED')
    expect(finished).toMatchObject({
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        promptTokensDetails: { cachedTokens: 10, cacheWriteTokens: 5 },
      },
    })
  })

  it('emits resolved TOOL_CALL_* quadruples for harness tool activity and never finishes with tool_calls', async () => {
    const messages: Array<AgentSdkMessage> = [
      init,
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'Bash',
              input: { command: 'ls' },
            },
          ],
        },
        parent_tool_use_id: null,
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: 'file-a\nfile-b',
            },
          ],
        },
        parent_tool_use_id: null,
      },
      assistantText('Found two files.', 'msg-2'),
      resultSuccess,
    ]

    const chunks = await collect(messages)
    const types = chunks.map((c) => c.type)
    expect(types).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])

    expect(chunks[2]).toMatchObject({
      toolCallId: 'toolu_1',
      toolCallName: 'Bash',
    })
    expect(chunks[3]).toMatchObject({
      toolCallId: 'toolu_1',
      delta: JSON.stringify({ command: 'ls' }),
    })
    expect(chunks[4]).toMatchObject({
      toolCallId: 'toolu_1',
      input: { command: 'ls' },
    })
    expect(chunks[5]).toMatchObject({
      type: 'TOOL_CALL_RESULT',
      toolCallId: 'toolu_1',
      content: 'file-a\nfile-b',
    })

    const finished = chunks.filter((c) => c.type === 'RUN_FINISHED')
    expect(finished).toHaveLength(1)
    expect(finished[0]).toMatchObject({ finishReason: 'stop' })
  })

  it('strips the mcp__tanstack__ prefix from bridged tool names', async () => {
    const chunks = await collect([
      init,
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_2',
              name: 'mcp__tanstack__lookup_user',
              input: { userId: 'u1' },
            },
          ],
        },
        parent_tool_use_id: null,
      },
      resultSuccess,
    ])

    const start = chunks.find((c) => c.type === 'TOOL_CALL_START')
    expect(start).toMatchObject({ toolCallName: 'lookup_user' })
  })

  it('marks errored tool results with state output-error', async () => {
    const chunks = await collect([
      init,
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [
            { type: 'tool_use', id: 'toolu_3', name: 'Bash', input: {} },
          ],
        },
        parent_tool_use_id: null,
      },
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_3',
              content: [{ type: 'text', text: 'command failed' }],
              is_error: true,
            },
          ],
        },
        parent_tool_use_id: null,
      },
      resultSuccess,
    ])

    const result = chunks.find((c) => c.type === 'TOOL_CALL_RESULT')
    expect(result).toMatchObject({
      toolCallId: 'toolu_3',
      content: 'command failed',
      state: 'output-error',
    })
  })

  it('synthesizes interrupted tool results for unresolved tool calls before RUN_FINISHED', async () => {
    const chunks = await collect([
      init,
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [
            { type: 'tool_use', id: 'toolu_4', name: 'Bash', input: {} },
          ],
        },
        parent_tool_use_id: null,
      },
      resultSuccess,
    ])

    const types = chunks.map((c) => c.type as string)
    expect(types.indexOf('TOOL_CALL_RESULT')).toBeGreaterThan(-1)
    expect(types.indexOf('TOOL_CALL_RESULT')).toBeLessThan(
      types.indexOf('RUN_FINISHED'),
    )
    expect(chunks.find((c) => c.type === 'TOOL_CALL_RESULT')).toMatchObject({
      toolCallId: 'toolu_4',
      content: JSON.stringify({ status: 'interrupted' }),
    })
  })

  it('translates thinking blocks into REASONING_* events', async () => {
    const chunks = await collect([
      init,
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [
            { type: 'thinking', thinking: 'pondering...' },
            { type: 'text', text: 'answer' },
          ],
        },
        parent_tool_use_id: null,
      },
      resultSuccess,
    ])

    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'REASONING_START',
      'REASONING_MESSAGE_START',
      'REASONING_MESSAGE_CONTENT',
      'REASONING_MESSAGE_END',
      'REASONING_END',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
    expect(
      chunks.find((c) => c.type === 'REASONING_MESSAGE_CONTENT'),
    ).toMatchObject({ delta: 'pondering...' })
  })

  it('maps error_max_turns to RUN_FINISHED(length)', async () => {
    const chunks = await collect([
      init,
      assistantText('partial'),
      {
        type: 'result',
        subtype: 'error_max_turns',
        usage,
        total_cost_usd: 0.5,
        errors: [],
      },
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_FINISHED',
      finishReason: 'length',
    })
  })

  it('maps error_during_execution to RUN_ERROR', async () => {
    const chunks = await collect([
      init,
      {
        type: 'result',
        subtype: 'error_during_execution',
        usage,
        total_cost_usd: 0,
        errors: ['boom'],
      },
    ])
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'boom',
      code: 'error_during_execution',
    })
  })

  it('skips subagent messages (parent_tool_use_id set)', async () => {
    const chunks = await collect([
      init,
      {
        type: 'assistant',
        message: { id: 'msg-sub', content: [{ type: 'text', text: 'inner' }] },
        parent_tool_use_id: 'toolu_task',
      },
      assistantText('outer'),
      resultSuccess,
    ])

    const contents = chunks.filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
    expect(contents).toHaveLength(1)
    expect(contents[0]).toMatchObject({ delta: 'outer' })
  })

  it('streams partial text deltas and dedupes the whole assistant message', async () => {
    const chunks = await collect([
      init,
      {
        type: 'stream_event',
        event: { type: 'message_start', message: { id: 'msg-1' } },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hel' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'lo' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
        parent_tool_use_id: null,
      },
      assistantText('Hello', 'msg-1'),
      resultSuccess,
    ])

    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
    expect(chunks[3]).toMatchObject({ delta: 'Hel', content: 'Hel' })
    expect(chunks[4]).toMatchObject({ delta: 'lo', content: 'Hello' })
  })

  it('emits synthetic tool results then rethrows when the SDK stream throws mid-run', async () => {
    async function* throwing(): AsyncIterable<AgentSdkMessage> {
      yield init
      yield {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [
            { type: 'tool_use', id: 'toolu_5', name: 'Bash', input: {} },
          ],
        },
        parent_tool_use_id: null,
      }
      throw new Error('aborted')
    }

    const chunks: Array<StreamChunk> = []
    await expect(async () => {
      for await (const chunk of translateSdkStream(throwing(), makeContext())) {
        chunks.push(chunk)
      }
    }).rejects.toThrow('aborted')

    expect(chunks.find((c) => c.type === 'TOOL_CALL_RESULT')).toMatchObject({
      toolCallId: 'toolu_5',
      content: JSON.stringify({ status: 'interrupted' }),
    })
  })

  it('ignores unknown SDK message types', async () => {
    const chunks = await collect([
      init,
      {
        type: 'system',
        subtype: 'status',
        status: 'compacting',
      } as unknown as AgentSdkMessage,
      assistantText('hi'),
      resultSuccess,
    ])
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
  })
})
