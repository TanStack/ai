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

describe('translateSdkStream', () => {
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
      parentMessageId: 'msg-1',
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

  it('streams partial tool-call args and dedupes the complete assistant message', async () => {
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
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'Read' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"file":' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '"a.ts"}' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
        parent_tool_use_id: null,
      },
      // The complete assistant message restates the tool call; it must be deduped.
      {
        type: 'assistant',
        message: {
          id: 'msg-1',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'Read',
              input: { file: 'a.ts' },
            },
          ],
        },
        parent_tool_use_id: null,
      },
      // The harness executes the tool and feeds the result back.
      {
        type: 'user',
        message: {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: 'file contents',
            },
          ],
        },
        parent_tool_use_id: null,
      },
      resultSuccess,
    ])

    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
      'RUN_FINISHED',
    ])
    // Args stream as deltas only; consumers accumulate them.
    expect(chunks[3]).toMatchObject({ delta: '{"file":' })
    expect(chunks[4]).toMatchObject({ delta: '"a.ts"}' })
    expect(chunks[3]).not.toHaveProperty('args')
    // END carries the parsed input; the complete message re-emitted nothing.
    expect(chunks[5]).toMatchObject({
      type: 'TOOL_CALL_END',
      toolCallId: 'toolu_1',
      toolCallName: 'Read',
      input: { file: 'a.ts' },
    })
  })

  it('fails instead of completing malformed streamed tool input as an empty object', async () => {
    await expect(
      collect([
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
            content_block: { type: 'tool_use', id: 'toolu_1', name: 'Read' },
          },
          parent_tool_use_id: null,
        },
        {
          type: 'stream_event',
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'input_json_delta', partial_json: '{"file":' },
          },
          parent_tool_use_id: null,
        },
        {
          type: 'stream_event',
          event: { type: 'content_block_stop', index: 0 },
          parent_tool_use_id: null,
        },
      ]),
    ).rejects.toThrow()
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

  it('synthesizes an interrupted result when the stream throws mid partial tool-args', async () => {
    async function* throwing(): AsyncIterable<AgentSdkMessage> {
      yield init
      yield {
        type: 'stream_event',
        event: { type: 'message_start', message: { id: 'msg-1' } },
        parent_tool_use_id: null,
      }
      yield {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'toolu_9', name: 'Read' },
        },
        parent_tool_use_id: null,
      }
      yield {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"file":' },
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

    // START was emitted for the partial tool call; the abort must still pair it
    // with a TOOL_CALL_END and an interrupted TOOL_CALL_RESULT (the module
    // invariant documented at the top of translate.ts).
    expect(chunks.filter((c) => c.type === 'TOOL_CALL_START')).toHaveLength(1)
    expect(chunks.find((c) => c.type === 'TOOL_CALL_END')).toMatchObject({
      toolCallId: 'toolu_9',
    })
    expect(chunks.find((c) => c.type === 'TOOL_CALL_RESULT')).toMatchObject({
      toolCallId: 'toolu_9',
      content: JSON.stringify({ status: 'interrupted' }),
    })
  })

  it('closes an open partial text segment when the stream throws mid-text', async () => {
    async function* throwing(): AsyncIterable<AgentSdkMessage> {
      yield init
      yield {
        type: 'stream_event',
        event: { type: 'message_start', message: { id: 'msg-1' } },
        parent_tool_use_id: null,
      }
      yield {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text' },
        },
        parent_tool_use_id: null,
      }
      yield {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Half a sent' },
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

    // TEXT_MESSAGE_START was emitted; the abort must still pair it with a
    // TEXT_MESSAGE_END or the consumer's message stays open forever.
    expect(chunks.find((c) => c.type === 'TEXT_MESSAGE_END')).toMatchObject({
      messageId: 'msg-1',
    })
  })

  it('tags a streamed tool call with the parent message id shared with sibling text', async () => {
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
          delta: { type: 'text_delta', text: 'Reading…' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_7', name: 'Read' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"file":"a.ts"}' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 1 },
        parent_tool_use_id: null,
      },
      resultSuccess,
    ])

    // The tool call must be grouped under the same message as the sibling text,
    // so a downstream message rename can't orphan its later result.
    expect(chunks.find((c) => c.type === 'TEXT_MESSAGE_START')).toMatchObject({
      messageId: 'msg-1',
    })
    expect(chunks.find((c) => c.type === 'TOOL_CALL_START')).toMatchObject({
      parentMessageId: 'msg-1',
    })
  })

  it('correlates interleaved tool_use blocks by event index', async () => {
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
          content_block: { type: 'tool_use', id: 'toolu_a', name: 'Read' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_b', name: 'Bash' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"file":"a.ts"}' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"cmd":"ls"}' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 1 },
        parent_tool_use_id: null,
      },
      resultSuccess,
    ])

    const ends = chunks.filter((c) => c.type === 'TOOL_CALL_END')
    expect(ends).toHaveLength(2)
    expect(ends[0]).toMatchObject({
      toolCallId: 'toolu_a',
      input: { file: 'a.ts' },
    })
    expect(ends[1]).toMatchObject({
      toolCallId: 'toolu_b',
      input: { cmd: 'ls' },
    })

    const args = chunks.filter((c) => c.type === 'TOOL_CALL_ARGS')
    expect(args[0]).toMatchObject({
      toolCallId: 'toolu_a',
      delta: '{"file":"a.ts"}',
    })
    expect(args[1]).toMatchObject({
      toolCallId: 'toolu_b',
      delta: '{"cmd":"ls"}',
    })
  })

  it('streams a zero-argument tool call as START → END with no args frame', async () => {
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
          content_block: { type: 'tool_use', id: 'toolu_z', name: 'Now' },
        },
        parent_tool_use_id: null,
      },
      {
        type: 'stream_event',
        event: { type: 'content_block_stop', index: 0 },
        parent_tool_use_id: null,
      },
      resultSuccess,
    ])

    // Mirrors the @tanstack/ai-anthropic streaming path: no input_json_delta
    // means no ARGS frame: START then END(input={}), never a synthesized one.
    const toolTypes = chunks
      .map((c) => c.type)
      .filter((t) => t.startsWith('TOOL_CALL_'))
    expect(toolTypes).toEqual([
      'TOOL_CALL_START',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
    ])
    expect(chunks.find((c) => c.type === 'TOOL_CALL_END')).toMatchObject({
      toolCallId: 'toolu_z',
      input: {},
    })
  })
})
