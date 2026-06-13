import { beforeEach, describe, expect, it, vi } from 'vitest'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { claudeCodeText } from '../src/adapters/text'
import type { AgentSdkMessage } from '../src/stream/sdk-types'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { StreamChunk, TextOptions } from '@tanstack/ai'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

const queryMock = vi.mocked(query)

const init: AgentSdkMessage = {
  type: 'system',
  subtype: 'init',
  session_id: 'sess-1',
  model: 'claude-opus-4-6',
  tools: ['Bash'],
}

const textTurn: Array<AgentSdkMessage> = [
  init,
  {
    type: 'assistant',
    message: { id: 'msg-1', content: [{ type: 'text', text: 'hi there' }] },
    parent_tool_use_id: null,
  },
  {
    type: 'result',
    subtype: 'success',
    result: 'hi there',
    usage: { input_tokens: 10, output_tokens: 5 },
    total_cost_usd: 0.01,
  },
]

function mockQueryReturning(messages: Array<AgentSdkMessage>) {
  queryMock.mockImplementation(() => {
    async function* generate() {
      for (const message of messages) yield message
    }
    return generate() as ReturnType<typeof query>
  })
}

const noopLogger = {
  request: vi.fn(),
  provider: vi.fn(),
  output: vi.fn(),
  errors: vi.fn(),
  middleware: vi.fn(),
  tools: vi.fn(),
  agentLoop: vi.fn(),
  config: vi.fn(),
  isEnabled: () => false,
} as unknown as InternalLogger

function makeOptions(
  overrides: Partial<TextOptions<Record<string, any>>> = {},
): TextOptions<Record<string, any>> {
  return {
    model: 'claude-opus-4-6',
    messages: [{ role: 'user', content: 'hello' }],
    logger: noopLogger,
    ...overrides,
  } as TextOptions<Record<string, any>>
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

beforeEach(() => {
  queryMock.mockReset()
})

describe('claudeCodeText', () => {
  it('creates an adapter with the claude-code provider name', () => {
    const adapter = claudeCodeText('claude-opus-4-6')
    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('claude-code')
    expect(adapter.model).toBe('claude-opus-4-6')
  })
})

describe('chatStream', () => {
  it('streams translated AG-UI events for a simple turn', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6')
    const chunks = await collect(adapter.chatStream(makeOptions()))
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
    expect(chunks.at(-1)).toMatchObject({ finishReason: 'stop' })
  })

  it('passes prompt, model, and resume to query()', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6')
    await collect(
      adapter.chatStream(
        makeOptions({
          messages: [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'answer' },
            { role: 'user', content: 'follow-up' },
          ],
          modelOptions: { sessionId: 'sess-prior' },
        }),
      ),
    )

    expect(queryMock).toHaveBeenCalledTimes(1)
    const call = queryMock.mock.calls[0]![0]
    expect(call.prompt).toBe('follow-up')
    expect(call.options).toMatchObject({
      model: 'claude-opus-4-6',
      resume: 'sess-prior',
      includePartialMessages: true,
    })
  })

  it('isolates the harness from user-level settings by default (project only)', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6')
    await collect(adapter.chatStream(makeOptions()))
    const options = queryMock.mock.calls[0]![0].options!
    expect(options.settingSources).toEqual(['project'])
  })

  it('honors a settingSources override', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6', {
      settingSources: ['user', 'project', 'local'],
    })
    await collect(adapter.chatStream(makeOptions()))
    const options = queryMock.mock.calls[0]![0].options!
    expect(options.settingSources).toEqual(['user', 'project', 'local'])
  })

  it('bridges executable tools into an mcpServers entry named tanstack', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6')
    await collect(
      adapter.chatStream(
        makeOptions({
          tools: [
            {
              name: 'lookup_user',
              description: 'Look up a user',
              inputSchema: { type: 'object', properties: {} },
              execute: async () => ({ ok: true }),
            } as never,
          ],
        }),
      ),
    )

    const options = queryMock.mock.calls[0]![0].options!
    expect(options.mcpServers).toMatchObject({
      tanstack: { type: 'sdk', name: 'tanstack' },
    })
  })

  it('does not create the bridge server when no tools are passed', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6')
    await collect(adapter.chatStream(makeOptions()))
    const options = queryMock.mock.calls[0]![0].options!
    expect(options.mcpServers ?? {}).toEqual({})
  })

  it('emits RUN_ERROR for client-side tools (no execute)', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6')
    const chunks = await collect(
      adapter.chatStream(
        makeOptions({
          tools: [
            {
              name: 'client_only',
              description: 'runs in browser',
              inputSchema: { type: 'object', properties: {} },
            } as never,
          ],
        }),
      ),
    )
    expect(queryMock).not.toHaveBeenCalled()
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_ERROR' })
    expect((chunks.at(-1) as { message: string }).message).toMatch(
      /client-side/i,
    )
  })

  it('emits RUN_ERROR for approval-gated tools', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6')
    const chunks = await collect(
      adapter.chatStream(
        makeOptions({
          tools: [
            {
              name: 'needs_ok',
              description: 'requires approval',
              inputSchema: { type: 'object', properties: {} },
              execute: async () => 'x',
              needsApproval: true,
            } as never,
          ],
        }),
      ),
    )
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_ERROR' })
  })

  it('appends system prompts to the claude_code preset by default', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6')
    await collect(
      adapter.chatStream(
        makeOptions({ systemPrompts: ['Be terse.', 'Use tabs.'] }),
      ),
    )
    const options = queryMock.mock.calls[0]![0].options!
    expect(options.systemPrompt).toEqual({
      type: 'preset',
      preset: 'claude_code',
      append: 'Be terse.\n\nUse tabs.',
    })
  })

  it('replaces the system prompt entirely in replace mode', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6', {
      systemPromptMode: 'replace',
    })
    await collect(
      adapter.chatStream(makeOptions({ systemPrompts: ['Only this.'] })),
    )
    const options = queryMock.mock.calls[0]![0].options!
    expect(options.systemPrompt).toBe('Only this.')
  })

  it('wires permissionMode bypassPermissions with the required safety flag', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6', {
      permissionMode: 'bypassPermissions',
    })
    await collect(adapter.chatStream(makeOptions()))
    const options = queryMock.mock.calls[0]![0].options!
    expect(options.permissionMode).toBe('bypassPermissions')
    expect(options.allowDangerouslySkipPermissions).toBe(true)
  })

  it('passes an abort controller that follows the request signal', async () => {
    mockQueryReturning(textTurn)
    const adapter = claudeCodeText('claude-opus-4-6')
    const controller = new AbortController()
    await collect(
      adapter.chatStream(
        makeOptions({ request: { signal: controller.signal } }),
      ),
    )
    const options = queryMock.mock.calls[0]![0].options!
    expect(options.abortController).toBeInstanceOf(AbortController)
    expect(options.abortController!.signal.aborted).toBe(false)
    controller.abort()
    expect(options.abortController!.signal.aborted).toBe(true)
  })

  it('emits RUN_ERROR when query() throws', async () => {
    queryMock.mockImplementation(() => {
      throw new Error('spawn failed')
    })
    const adapter = claudeCodeText('claude-opus-4-6')
    const chunks = await collect(adapter.chatStream(makeOptions()))
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'spawn failed',
    })
  })
})

describe('structuredOutput', () => {
  it('uses the native outputFormat and returns structured_output', async () => {
    mockQueryReturning([
      init,
      {
        type: 'result',
        subtype: 'success',
        result: '{"answer":42}',
        structured_output: { answer: 42 },
        usage: { input_tokens: 7, output_tokens: 3 },
        total_cost_usd: 0,
      },
    ])
    const adapter = claudeCodeText('claude-opus-4-6')
    const result = await adapter.structuredOutput({
      chatOptions: makeOptions(),
      outputSchema: {
        type: 'object',
        properties: { answer: { type: 'number' } },
      },
    })

    expect(result.data).toEqual({ answer: 42 })
    expect(result.rawText).toBe('{"answer":42}')
    expect(result.usage).toMatchObject({ promptTokens: 7, completionTokens: 3 })

    const options = queryMock.mock.calls[0]![0].options!
    expect(options.outputFormat).toEqual({
      type: 'json_schema',
      schema: {
        type: 'object',
        properties: { answer: { type: 'number' } },
      },
    })
    expect(options.maxTurns).toBe(1)
  })

  it('falls back to parsing result text when structured_output is missing', async () => {
    mockQueryReturning([
      init,
      {
        type: 'result',
        subtype: 'success',
        result: '{"answer":7}',
        usage: { input_tokens: 1, output_tokens: 1 },
        total_cost_usd: 0,
      },
    ])
    const adapter = claudeCodeText('claude-opus-4-6')
    const result = await adapter.structuredOutput({
      chatOptions: makeOptions(),
      outputSchema: { type: 'object' },
    })
    expect(result.data).toEqual({ answer: 7 })
  })

  it('throws a descriptive error when the run fails', async () => {
    mockQueryReturning([
      init,
      {
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['harness exploded'],
        usage: {},
        total_cost_usd: 0,
      },
    ])
    const adapter = claudeCodeText('claude-opus-4-6')
    await expect(
      adapter.structuredOutput({
        chatOptions: makeOptions(),
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow(/harness exploded/)
  })
})
