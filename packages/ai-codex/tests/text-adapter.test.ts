import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Codex } from '@openai/codex-sdk'
import { codexText } from '../src/adapters/text'
import type { CodexThreadEvent } from '../src/stream/sdk-types'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { StreamChunk, TextOptions } from '@tanstack/ai'

vi.mock('@openai/codex-sdk', () => ({
  Codex: vi.fn(),
}))

const codexMock = vi.mocked(Codex)

const startThreadMock = vi.fn()
const resumeThreadMock = vi.fn()
const runStreamedMock = vi.fn()

const textTurn: Array<CodexThreadEvent> = [
  { type: 'thread.started', thread_id: 'sess-1' },
  { type: 'turn.started' },
  {
    type: 'item.completed',
    item: { id: 'item-1', type: 'agent_message', text: 'hi there' },
  },
  {
    type: 'turn.completed',
    usage: {
      input_tokens: 10,
      cached_input_tokens: 0,
      output_tokens: 5,
      reasoning_output_tokens: 0,
    },
  },
]

function mockRunReturning(events: Array<CodexThreadEvent>) {
  runStreamedMock.mockImplementation(() => {
    async function* generate() {
      for (const event of events) yield event
    }
    return Promise.resolve({ events: generate() })
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
    model: 'gpt-5.1-codex',
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
  codexMock.mockReset()
  startThreadMock.mockReset()
  resumeThreadMock.mockReset()
  runStreamedMock.mockReset()
  const thread = { runStreamed: runStreamedMock }
  startThreadMock.mockReturnValue(thread)
  resumeThreadMock.mockReturnValue(thread)
  codexMock.mockImplementation(function (this: unknown) {
    return {
      startThread: startThreadMock,
      resumeThread: resumeThreadMock,
    } as unknown as Codex
  })
})

describe('codexText', () => {
  it('creates an adapter with the codex provider name', () => {
    const adapter = codexText('gpt-5.1-codex')
    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('codex')
    expect(adapter.model).toBe('gpt-5.1-codex')
  })
})

describe('chatStream', () => {
  it('streams translated AG-UI events for a simple turn', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex')
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

  it('starts a fresh thread without a sessionId', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex')
    await collect(adapter.chatStream(makeOptions()))
    expect(startThreadMock).toHaveBeenCalledTimes(1)
    expect(resumeThreadMock).not.toHaveBeenCalled()
    expect(runStreamedMock.mock.calls[0]![0]).toBe('hello')
  })

  it('resumes the thread and sends only the trailing user message', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex')
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
    expect(resumeThreadMock).toHaveBeenCalledTimes(1)
    expect(resumeThreadMock.mock.calls[0]![0]).toBe('sess-prior')
    expect(runStreamedMock.mock.calls[0]![0]).toBe('follow-up')
  })

  it('flattens prior turns into the prompt without a sessionId', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex')
    await collect(
      adapter.chatStream(
        makeOptions({
          messages: [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'answer' },
            { role: 'user', content: 'follow-up' },
          ],
        }),
      ),
    )
    expect(runStreamedMock.mock.calls[0]![0]).toBe(
      'Previous conversation:\nUser: first\nAssistant: answer\n\nfollow-up',
    )
  })

  it('builds thread options from config with safe defaults', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex', {
      cwd: '/workspace',
      sandboxMode: 'workspace-write',
    })
    await collect(adapter.chatStream(makeOptions()))
    expect(startThreadMock.mock.calls[0]![0]).toMatchObject({
      model: 'gpt-5.1-codex',
      sandboxMode: 'workspace-write',
      workingDirectory: '/workspace',
      approvalPolicy: 'never',
      skipGitRepoCheck: true,
    })
  })

  it('lets modelOptions override config thread options', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex', {
      cwd: '/workspace',
      sandboxMode: 'workspace-write',
    })
    await collect(
      adapter.chatStream(
        makeOptions({
          modelOptions: {
            sandboxMode: 'read-only',
            workingDirectory: '/elsewhere',
          },
        }),
      ),
    )
    expect(startThreadMock.mock.calls[0]![0]).toMatchObject({
      sandboxMode: 'read-only',
      workingDirectory: '/elsewhere',
    })
  })

  it('prepends system prompts to the prompt text', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex')
    await collect(
      adapter.chatStream(
        makeOptions({ systemPrompts: ['Be terse.', 'Use tabs.'] }),
      ),
    )
    expect(runStreamedMock.mock.calls[0]![0]).toBe(
      'Be terse.\n\nUse tabs.\n\nhello',
    )
  })

  it('starts a localhost MCP bridge and points codex at it when tools are passed', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex')
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
    expect(codexMock).toHaveBeenCalledTimes(1)
    const codexOptions = codexMock.mock.calls[0]![0]!
    const servers = codexOptions.config!.mcp_servers as Record<
      string,
      { url: string }
    >
    expect(servers.tanstack!.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
  })

  it('does not configure the bridge when no tools are passed', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex')
    await collect(adapter.chatStream(makeOptions()))
    const codexOptions = codexMock.mock.calls[0]![0] ?? {}
    expect(codexOptions.config).toBeUndefined()
  })

  it('emits RUN_ERROR for client-side tools (no execute)', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex')
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
    expect(runStreamedMock).not.toHaveBeenCalled()
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_ERROR' })
    expect((chunks.at(-1) as { message: string }).message).toMatch(
      /client-side/i,
    )
  })

  it('emits RUN_ERROR for approval-gated tools', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex')
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

  it('passes the abort signal through to runStreamed', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex')
    const controller = new AbortController()
    await collect(
      adapter.chatStream(makeOptions({ abortController: controller })),
    )
    expect(runStreamedMock.mock.calls[0]![1]).toMatchObject({
      signal: controller.signal,
    })
  })

  it('forwards apiKey and env to the Codex constructor', async () => {
    mockRunReturning(textTurn)
    const adapter = codexText('gpt-5.1-codex', {
      apiKey: 'sk-test',
      env: { PATH: '/usr/bin' },
    })
    await collect(adapter.chatStream(makeOptions()))
    expect(codexMock.mock.calls[0]![0]).toMatchObject({
      apiKey: 'sk-test',
      env: { PATH: '/usr/bin' },
    })
  })

  it('emits RUN_ERROR when the SDK throws', async () => {
    runStreamedMock.mockImplementation(() => {
      throw new Error('spawn failed')
    })
    const adapter = codexText('gpt-5.1-codex')
    const chunks = await collect(adapter.chatStream(makeOptions()))
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'spawn failed',
    })
  })
})

describe('structuredOutput', () => {
  it('passes the schema as outputSchema and parses the final agent message', async () => {
    mockRunReturning([
      { type: 'thread.started', thread_id: 'sess-so' },
      {
        type: 'item.completed',
        item: { id: 'item-1', type: 'agent_message', text: '{"answer":42}' },
      },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 7,
          cached_input_tokens: 0,
          output_tokens: 3,
          reasoning_output_tokens: 0,
        },
      },
    ])
    const adapter = codexText('gpt-5.1-codex')
    const schema = {
      type: 'object',
      properties: { answer: { type: 'number' } },
    }
    const result = await adapter.structuredOutput({
      chatOptions: makeOptions(),
      outputSchema: schema,
    })

    expect(result.data).toEqual({ answer: 42 })
    expect(result.rawText).toBe('{"answer":42}')
    expect(result.usage).toMatchObject({ promptTokens: 7, completionTokens: 3 })
    expect(runStreamedMock.mock.calls[0]![1]).toMatchObject({
      outputSchema: schema,
    })
  })

  it('runs structured output in a fresh read-only thread', async () => {
    mockRunReturning([
      {
        type: 'item.completed',
        item: { id: 'item-1', type: 'agent_message', text: '{}' },
      },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 1,
          cached_input_tokens: 0,
          output_tokens: 1,
          reasoning_output_tokens: 0,
        },
      },
    ])
    const adapter = codexText('gpt-5.1-codex', {
      sandboxMode: 'workspace-write',
    })
    await adapter.structuredOutput({
      chatOptions: makeOptions({ modelOptions: { sessionId: 'sess-live' } }),
      outputSchema: { type: 'object' },
    })
    expect(resumeThreadMock).not.toHaveBeenCalled()
    expect(startThreadMock.mock.calls[0]![0]).toMatchObject({
      sandboxMode: 'read-only',
    })
  })

  it('throws a descriptive error when the turn fails', async () => {
    mockRunReturning([
      { type: 'turn.failed', error: { message: 'harness exploded' } },
    ])
    const adapter = codexText('gpt-5.1-codex')
    await expect(
      adapter.structuredOutput({
        chatOptions: makeOptions(),
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow(/harness exploded/)
  })

  it('throws when the run ends without an agent message', async () => {
    mockRunReturning([
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 1,
          cached_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
        },
      },
    ])
    const adapter = codexText('gpt-5.1-codex')
    await expect(
      adapter.structuredOutput({
        chatOptions: makeOptions(),
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow(/without an agent message/)
  })
})
